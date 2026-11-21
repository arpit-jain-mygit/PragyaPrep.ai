import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ApiError, ReleaseHistoryRow, TodayPassage, TodayReleases } from '../core/models';
import { TenantService } from '../core/tenant.service';

/** The titles and the page heading for each kind of release. */
const HEADINGS: Record<'daily_rc' | 'weekly_dilr', { heading: string; empty: string; hint: string }> = {
  daily_rc: { heading: 'Daily RC', empty: 'Nothing is set for today yet.', hint: "Today's passage. Read it, then attempt its questions." },
  weekly_dilr: { heading: 'Weekly DILR', empty: 'Nothing is set for this week yet.', hint: "This week's set. Work through it, then attempt its questions." },
};

/**
 * Daily RC and Weekly DILR: the passage or set the student sees today or this week, and an attempt at its questions.
 * An attempt opens the normal test page, so it is marked and reviewed the same way as any other test.
 */
@Component({
  selector: 'app-student-release',
  imports: [RouterLink],
  template: `
    <div class="page-head"><h1>{{ heading() }}</h1></div>
    <p class="hint">{{ hint() }}</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="release-error">{{ problem.detail }}</div> }
    @if (loaded()) {
      @if (passage(); as item) {
        <article class="card release-passage" id="release-passage">
          <h2>{{ item.title }}</h2>
          <p class="muted small">{{ item.date }}</p>
          <div class="release-text">{{ item.text }}</div>
          <button class="btn" type="button" id="release-attempt" [disabled]="busy()" (click)="attempt()">Attempt the questions</button>
        </article>
      } @else {
        <p class="muted" id="release-empty">{{ empty() }}</p>
      }
      @if (history().length) {
        <section class="card" id="release-history">
          <h2>Earlier passages</h2>
          <ul class="plain-list">
            @for (row of history(); track row.id) {
              <li class="history-row" [attr.data-release]="row.id">
                <span class="muted small">{{ row.date }}</span> {{ row.title }}
                @if (row.attempted && row.practice_id) {
                  <a class="small" [routerLink]="['/', tenants.slug(), 'tests', row.practice_id]">Attempted: review</a>
                } @else {
                  <span class="muted small">Not attempted</span>
                }
              </li>
            }
          </ul>
        </section>
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
  styles: `
    .release-text { white-space: pre-wrap; line-height: 1.6; margin: 0.75rem 0 1rem; }
  `,
})
export class StudentRelease implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly tenants = inject(TenantService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly kind: 'daily_rc' | 'weekly_dilr' = this.route.snapshot.data?.['kind'] === 'weekly_dilr' ? 'weekly_dilr' : 'daily_rc';
  readonly heading = computed(() => HEADINGS[this.kind].heading);
  readonly hint = computed(() => HEADINGS[this.kind].hint);
  readonly empty = computed(() => HEADINGS[this.kind].empty);

  readonly passage = signal<TodayPassage | null>(null);
  readonly loaded = signal(false);
  readonly history = signal<ReleaseHistoryRow[]>([]);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const today: TodayReleases = await this.api.myReleasesToday();
      this.passage.set(today[this.kind]);
      this.loaded.set(true);
      this.history.set((await this.api.releaseHistory(this.kind)).releases);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async attempt(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const made = await this.api.attemptRelease(this.kind);
      await this.router.navigate(['/', this.tenants.slug(), 'tests', made.id]);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }
}

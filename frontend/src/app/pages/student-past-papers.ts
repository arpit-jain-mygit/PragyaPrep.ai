import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ApiError, PastPaperCard } from '../core/models';
import { TenantService } from '../core/tenant.service';

/**
 * Past papers: Attempt sits a paper from its year, and Explore lists every paper by year with its question count.
 * Both open the normal test page, so a past paper is marked and reviewed the same way as any other test.
 */
@Component({
  selector: 'app-student-past-papers',
  imports: [RouterLink],
  template: `
    <div class="page-head"><h1>{{ heading() }}</h1></div>
    <p class="hint">{{ hint() }}</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="past-error">{{ problem.detail }}</div> }
    @if (loaded()) {
      @for (group of byYear(); track group.year) {
        <section class="card past-year" [attr.data-year]="group.year">
          <h2>{{ group.year }}</h2>
          <ul class="plain-list">
            @for (paper of group.papers; track paper.id) {
              <li class="past-row" [attr.data-paper]="paper.id">
                <a [routerLink]="['/', tenants.slug(), 'tests', paper.id]">{{ paper.title }}</a>
                <span class="muted small">{{ paper.question_count }} questions</span>
              </li>
            }
          </ul>
        </section>
      } @empty {
        <p class="muted" id="no-past-papers">No past papers are open to you yet.</p>
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class StudentPastPapers implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly tenants = inject(TenantService);

  readonly explore = this.route.snapshot.data?.['view'] === 'explore';
  readonly heading = computed(() => (this.explore ? 'Explore past papers' : 'Past papers'));
  readonly hint = computed(() =>
    this.explore ? 'Every past paper, by year. Open one to look at its questions.' : 'Sit a past paper from its year, under test conditions.',
  );

  readonly papers = signal<PastPaperCard[]>([]);
  readonly loaded = signal(false);
  readonly error = signal<ApiError | null>(null);

  /** The papers grouped by year, newest first. */
  readonly byYear = computed(() => {
    const groups = new Map<number, PastPaperCard[]>();
    for (const paper of this.papers()) {
      const year = paper.year ?? 0;
      groups.set(year, [...(groups.get(year) ?? []), paper]);
    }
    return [...groups].sort((a, b) => b[0] - a[0]).map(([year, papers]) => ({ year, papers }));
  });

  async ngOnInit(): Promise<void> {
    try {
      this.papers.set(await this.api.myPastPapers());
      this.loaded.set(true);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }
}

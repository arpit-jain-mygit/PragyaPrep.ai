import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { formatDateTime } from '../core/format';
import { ApiError, StudentTestCard } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

const ORDER = { open: 0, upcoming: 1, ended: 2 };

/** The tests a student can take: for the courses they can open now. */
@Component({
  selector: 'app-student-tests',
  imports: [RouterLink, Icon, InfoTip],
  template: `
    <div class="page-head">
      <h1>Tests <app-info text="Tests for your courses. You can start one while it is open, as long as you have attempts left." /></h1>
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (!tests().length && !error()) {
      <div class="empty-state"><app-icon name="clipboard" [size]="32" /><p>No tests for your courses yet</p></div>
    }

    @for (test of tests(); track test.id) {
      <article class="card test-card" [attr.data-test]="test.title">
        <div class="row q-head">
          <strong>{{ test.title }}</strong>
          <span class="status" [class.ok]="test.state === 'open'" [class.warn]="test.state === 'upcoming'">{{ stateLabel(test) }}</span>
          <div class="q-actions">
            <a class="btn small" [class.secondary]="!canStart(test)" [routerLink]="['/', tenants.slug(), 'tests', test.id]">
              @if (test.in_progress) { <app-icon name="play" [size]="16" /> Resume } @else if (canStart(test)) { <app-icon name="play" [size]="16" /> Start } @else { Details }
            </a>
          </div>
        </div>
        <p class="soft" style="margin: 0.25rem 0 0">
          {{ test.question_count }} questions · {{ test.total_marks }} marks · {{ test.duration_minutes }} min · pass {{ test.pass_percentage }}%
        </p>
        <p class="soft" style="margin: 0.15rem 0 0">{{ windowOf(test) }}</p>
        <p class="soft" style="margin: 0.15rem 0 0">
          Attempts {{ test.attempts_used }} of {{ test.max_attempts }}
          @if (test.best; as best) { · best <strong>{{ best.percentage }}%</strong> <span class="status" [class.ok]="best.passed" [class.bad]="!best.passed">{{ best.passed ? 'passed' : 'not passed' }}</span> }
        </p>
      </article>
    }
  `,
})
export class StudentTests implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);

  readonly tests = signal<StudentTestCard[]>([]);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.api.myTests();
      // A test in progress first, then open ones, then upcoming, then ended.
      this.tests.set([...list].sort((a, b) => Number(!!b.in_progress) - Number(!!a.in_progress) || ORDER[a.state] - ORDER[b.state]));
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  canStart(test: StudentTestCard): boolean {
    return test.state === 'open' && test.attempts_left > 0;
  }

  stateLabel(test: StudentTestCard): string {
    if (test.in_progress) return 'In progress';
    if (test.state === 'upcoming') return 'Upcoming';
    if (test.state === 'ended') return 'Ended';
    return test.attempts_left > 0 ? 'Open' : 'Done';
  }

  windowOf(test: StudentTestCard): string {
    if (!test.start_at && !test.end_at) return 'Open any time';
    if (test.state === 'upcoming') return `Opens ${formatDateTime(test.start_at ?? '')}`;
    return test.end_at ? `Open until ${formatDateTime(test.end_at)}` : 'Open now';
  }
}

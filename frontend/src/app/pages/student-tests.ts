import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { formatDateTime } from '../core/format';
import { ApiError, StudentTestCard } from '../core/models';
import { ScheduleGroup, dueLabel, isUrgent, scheduleGroups } from '../core/schedule';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';

const GROUP_ICONS = { overdue: 'flag', open: 'play', upcoming: 'clock', finished: 'check' } as const;

/** The tests a student can take: for the courses they can open now. */
@Component({
  selector: 'app-student-tests',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (tests().length) {
      <div class="toolbar" id="test-filters">
        <div class="field" style="flex: 2 1 12rem">
          <label class="sr-only" for="t-search">Search tests</label>
          <input id="t-search" name="tsearch" type="search" placeholder="Search by test name" [ngModel]="search()" (ngModelChange)="search.set($event ?? '')" />
        </div>
        <div class="field">
          <label class="sr-only" for="t-type">Type</label>
          <select id="t-type" name="ttype" [ngModel]="type()" (ngModelChange)="type.set($event ?? '')">
            <option value="">All types</option>
            <option value="course">Course tests</option>
            <option value="practice">My practice tests</option>
            <option value="parent">Set by your parent</option>
          </select>
        </div>
      </div>
    }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (!tests().length && !error()) {
      <div class="empty-state"><app-icon name="clipboard" [size]="32" /><p>No tests for your courses yet</p></div>
    } @else if (!shown().length && !error()) {
      <div class="empty-state" id="no-match"><app-icon name="clipboard" [size]="32" /><p>No tests match</p></div>
    }

    @for (group of groups(); track group.key) {
      <h2 class="schedule-head" [attr.data-group]="group.key" [class.overdue]="group.key === 'overdue'">
        <app-icon [name]="icon(group.key)" [size]="18" /> {{ group.title }} <span class="count">{{ group.tests.length }}</span>
      </h2>
    @for (test of group.tests; track test.id) {
      <article class="card test-card" [attr.data-test]="test.title">
        <div class="row q-head">
          <strong>{{ test.title }}</strong>
          @if (test.practice) { <span class="chip" title="A practice test, only for you">Practice</span> }
          @if (test.set_by) { <span class="chip parent-tag" id="set-by-parent" title="Your parent set this test for you"><app-icon name="users" [size]="13" /> Set by your parent</span> }
          <span class="status" [class.ok]="test.state === 'open' && !test.overdue" [class.warn]="test.state === 'upcoming' || urgent(test)" [class.bad]="test.overdue">{{ stateLabel(test) }}</span>
          <div class="q-actions">
            <a class="btn small" [class.secondary]="!canStart(test)" [routerLink]="['/', tenants.slug(), 'tests', test.id]">
              @if (test.in_progress) { <app-icon name="play" [size]="16" /> Resume } @else if (canStart(test)) { <app-icon name="play" [size]="16" /> Start } @else { Details }
            </a>
          </div>
        </div>
        <p class="soft" style="margin: 0.25rem 0 0">
          {{ test.question_count }} questions · {{ test.total_marks }} marks · {{ test.duration_minutes }} min · pass {{ test.pass_percentage }}%
        </p>
        <p class="soft due" style="margin: 0.15rem 0 0" [class.urgent]="urgent(test)" [class.late]="test.overdue">
          <strong>{{ due(test) }}</strong>@if (windowOf(test); as when) { · {{ when }}}
        </p>
        <p class="soft" style="margin: 0.15rem 0 0">
          Attempts {{ test.attempts_used }} of {{ test.max_attempts }}
          @if (test.best; as best) { · best <strong>{{ best.percentage }}%</strong> <span class="status" [class.ok]="best.passed" [class.bad]="!best.passed">{{ best.passed ? 'passed' : 'not passed' }}</span> }
        </p>
      </article>
    }
    }
  `,
})
export class StudentTests implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);

  readonly tests = signal<StudentTestCard[]>([]);
  readonly search = signal('');
  readonly type = signal('');
  /** The tests that match the search and the type: course tests, practice tests the student made, or ones a parent set. */
  readonly shown = computed(() => {
    const words = this.search().toLowerCase().split(/\s+/).filter(Boolean);
    const type = this.type();
    return this.tests().filter(
      (t) =>
        words.every((w) => t.title.toLowerCase().includes(w)) &&
        (!type || (type === 'course' && !t.practice) || (type === 'practice' && !!t.practice && !t.set_by) || (type === 'parent' && !!t.set_by)),
    );
  });
  readonly groups = computed<ScheduleGroup[]>(() => scheduleGroups(this.shown()));
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.api.myTests();
      this.tests.set(list);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  canStart(test: StudentTestCard): boolean {
    return test.state === 'open' && test.attempts_left > 0;
  }

  icon(key: ScheduleGroup['key']): string {
    return GROUP_ICONS[key];
  }

  due(test: StudentTestCard): string {
    return test.overdue ? 'Overdue' : dueLabel(test);
  }

  urgent(test: StudentTestCard): boolean {
    return isUrgent(test);
  }

  stateLabel(test: StudentTestCard): string {
    if (test.overdue) return 'Overdue';
    if (test.in_progress) return 'In progress';
    if (test.state === 'upcoming') return 'Upcoming';
    if (test.state === 'ended') return 'Ended';
    return test.attempts_left > 0 ? 'Open' : 'Done';
  }

  /** The exact date and time behind the countdown; nothing when the due line already says it all. */
  windowOf(test: StudentTestCard): string {
    if (test.state === 'upcoming') return formatDateTime(test.start_at ?? '');
    if (test.state === 'open') return test.end_at ? `until ${formatDateTime(test.end_at)}` : '';
    return test.overdue && test.end_at ? `closed ${formatDateTime(test.end_at)}` : '';
  }
}

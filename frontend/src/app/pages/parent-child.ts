import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { shortDate, timeAgo } from '../core/format';
import { ApiError, ChildDetail, StudentProgress } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Avatar } from '../ui/avatar';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

/** One child, for their parent: course status, what is overdue, tests, and weak topics with a button to set a practice test. */
@Component({
  selector: 'app-parent-child',
  imports: [FormsModule, RouterLink, Avatar, Icon, InfoTip],
  template: `
    <div class="page-head">
      <h1 class="greeting">
        @if (data(); as d) { <app-avatar [url]="d.student.avatar_url" [first]="d.student.name.split(' ')[0]" [last]="d.student.name.split(' ')[1] ?? ''" [email]="d.student.email" [size]="48" /> }
        {{ data()?.student?.name ?? 'Student' }}
      </h1>
      <a class="btn secondary small" [routerLink]="['/', tenants.slug(), 'parent']"><app-icon name="arrow-left" [size]="16" /> Children</a>
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
    @if (notice(); as n) { <div class="alert ok" role="status" id="notice">{{ n }}</div> }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (data(); as d) {
      @if (d.courses.length > 1) {
        <nav class="tabs" aria-label="Courses">
          @for (course of d.courses; track course.course.id) {
            <button class="tab" type="button" [attr.data-tab]="course.course.name" [attr.aria-selected]="course.course.id === shown()?.course?.id" (click)="pick.set(course.course.id)">{{ course.course.name }}</button>
          }
        </nav>
      }
      @if (shown(); as c) {
        <p class="soft" id="status-line"><span class="status" [class.bad]="c.row.status === 'behind'" [class.ok]="c.row.status === 'on_track'">{{ statusLabel(c.row.status) }}</span> · {{ c.course.name }} · last active {{ ago(c.row.last_active) }}</p>
        <div class="stat-grid" id="stats">
          <div class="stat"><div class="num" id="s-cw">{{ c.row.cw_done }}<span class="soft"> / {{ c.row.cw_total }}</span></div><div class="label">Coursework done</div></div>
          <div class="stat"><div class="num" id="s-tests">{{ c.row.tests_taken }}<span class="soft"> / {{ c.row.tests_available }}</span></div><div class="label">Tests taken</div></div>
          <div class="stat"><div class="num" id="s-avg">{{ c.row.avg_percent === null ? '-' : c.row.avg_percent + '%' }}</div><div class="label">Average score</div></div>
          <div class="stat"><div class="num bad-num" id="s-overdue">{{ c.row.overdue }}</div><div class="label">Overdue</div></div>
        </div>

        @if (c.overdue_items.length) {
          <h2>Overdue coursework</h2>
          <ul class="plain-list" id="overdue-items">
            @for (item of c.overdue_items; track item.title + item.due) {
              <li [attr.data-overdue]="item.title"><app-icon name="flag" [size]="15" /> <strong>{{ item.title }}</strong> <span class="soft">{{ item.subject }} › {{ item.topic }} · was due {{ date(item.due) }}</span></li>
            }
          </ul>
        }

      } @else {
        <div class="empty-state" id="no-courses"><app-icon name="layers" [size]="32" /><p>{{ d.student.name }} is not enrolled in a course yet</p></div>
      }

      <h2>Tests</h2>
      <div class="toolbar" id="test-filters">
        <div class="field" style="flex: 2 1 12rem">
          <label class="sr-only" for="pt-search">Search tests</label>
          <input id="pt-search" name="ptsearch" type="search" placeholder="Search by test name" [ngModel]="search()" (ngModelChange)="search.set($event ?? '')" />
        </div>
        <div class="field">
          <label class="sr-only" for="pt-type">Type</label>
          <select id="pt-type" name="pttype" [ngModel]="type()" (ngModelChange)="type.set($event ?? '')">
            <option value="">All types</option>
            <option value="course">Course tests</option>
            <option value="practice">Practice by {{ firstName() }}</option>
            <option value="parent">Set by you</option>
          </select>
        </div>
      </div>
      <div class="table-wrap">
        <table class="compact" id="tests">
          <thead><tr><th>Test</th><th>Attempts</th><th>Best score</th></tr></thead>
          <tbody>
            @for (test of tests(); track test.id) {
              <tr [attr.data-test]="test.title">
                <td>
                  <strong>{{ test.title }}</strong>
                  @if (test.kind === 'course') { <span class="chip">Course</span> } @else if (test.kind === 'parent') { <span class="chip parent-tag">Set by you</span> } @else { <span class="chip">Practice</span> }
                  @if (test.overdue) { <span class="status bad"> Missed</span> }
                </td>
                <td class="soft">{{ test.attempts_used }}@if (test.max_attempts) { of {{ test.max_attempts }} }</td>
                <td>@if (test.best) { <strong>{{ test.best.percentage }}%</strong> <span class="status" [class.ok]="test.best.passed" [class.bad]="!test.best.passed">{{ test.best.passed ? 'passed' : 'not passed' }}</span> } @else { <span class="soft">-</span> }</td>
              </tr>
            } @empty {
              <tr><td colspan="3"><div class="empty-state" id="no-tests"><app-icon name="clipboard" [size]="32" /><p>{{ allTests().length ? 'No tests match' : 'No tests yet' }}</p></div></td></tr>
            }
          </tbody>
        </table>
      </div>

      <h2>Where {{ firstName() }} needs practice <app-info text="Topics where the accuracy in finished tests is under 75%, weakest first. Set a practice test and {{ firstName() }} will find it under Tests." /></h2>
      @for (subject of d.results.subjects; track subject.id) {
        @for (topic of subject.topics; track topic.topic) {
          @if (Number(topic.accuracy) < 75) {
            <div class="topic-row" [attr.data-weak]="subject.name + ': ' + topic.topic">
              <span class="topic-name">{{ subject.name }}: {{ topic.topic }}</span>
              <span class="meter" [class.hard]="Number(topic.accuracy) < 50" [class.mid]="Number(topic.accuracy) >= 50"><i [style.width.%]="topic.accuracy"></i></span>
              <span class="soft topic-score">{{ topic.correct }} of {{ topic.questions }} · {{ topic.accuracy }}%</span>
              <button class="btn small" type="button" [attr.data-practise]="topic.topic" [disabled]="making()" (click)="setPractice(subject.id, topic.topic)"><app-icon name="play" [size]="14" /> Set practice test</button>
            </div>
          }
        }
      } @empty {
        <p class="soft" id="no-weak">Weak topics show here after {{ firstName() }} finishes a test.</p>
      }
    }
  `,
})
export class ParentChild implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly tenants = inject(TenantService);

  readonly data = signal<ChildDetail | null>(null);
  readonly pick = signal<string | null>(null);
  readonly loading = signal(false);
  readonly making = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly notice = signal<string | null>(null);
  readonly shown = computed<StudentProgress | null>(() => {
    const d = this.data();
    return d ? (d.courses.find((c) => c.course.id === this.pick()) ?? d.courses[0] ?? null) : null;
  });
  readonly firstName = computed(() => (this.data()?.student.name ?? 'your child').split(' ')[0]);
  readonly search = signal('');
  readonly type = signal('');
  /** The tests of the chosen course, then the child's practice tests (made by them, or set by the parent). */
  readonly allTests = computed(() => {
    const d = this.data();
    if (!d) return [];
    const course = (this.shown()?.tests ?? []).map((t) => ({ id: t.id, title: t.title, kind: 'course' as const, overdue: t.overdue, attempts_used: t.attempts_used, max_attempts: t.max_attempts as number | null, best: t.best }));
    const practice = d.practice.map((t) => ({ id: t.id, title: t.title, kind: (t.set_by_parent ? 'parent' : 'practice') as 'parent' | 'practice', overdue: false, attempts_used: t.attempts_used, max_attempts: null as number | null, best: t.best }));
    return [...course, ...practice];
  });
  readonly tests = computed(() => {
    const words = this.search().toLowerCase().split(/\s+/).filter(Boolean);
    const type = this.type();
    return this.allTests().filter((t) => words.every((w) => t.title.toLowerCase().includes(w)) && (!type || t.kind === type));
  });
  readonly Number = Number;
  date = shortDate;
  ago = timeAgo;

  private get email(): string {
    return this.route.snapshot.paramMap.get('email') ?? '';
  }

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.data.set(await this.api.myChild(this.email));
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  statusLabel(status: 'behind' | 'not_started' | 'on_track'): string {
    return { behind: 'Behind', not_started: 'Not started', on_track: 'On track' }[status];
  }

  async setPractice(paper: string, topic: string): Promise<void> {
    if (this.making()) return;
    this.making.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const made = await this.api.makeChildPractice(this.email, { paper, topic });
      this.notice.set(`Practice test "${made.title}" (${made.question_count} questions) is ready. ${this.firstName()} will find it under Tests.`);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.making.set(false);
    }
  }
}

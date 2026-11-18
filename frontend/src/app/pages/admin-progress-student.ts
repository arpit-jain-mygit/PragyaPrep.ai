import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { shortDate, timeAgo } from '../core/format';
import { ApiError, StudentProgress } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';
import { STATUS_LABELS } from './admin-progress';

/** One student in one course: status, coursework by subject and topic, what is overdue, and their tests. */
@Component({
  selector: 'app-admin-progress-student',
  imports: [RouterLink, Icon],
  template: `
    <div class="page-head">
      <h1>{{ data()?.student?.name ?? 'Student' }}@if (data()) { <span class="soft"> · {{ data()!.course.name }}</span> }</h1>
      <a class="btn secondary small" [routerLink]="['/', tenants.slug(), 'admin', 'progress']"><app-icon name="arrow-left" [size]="16" /> Progress</a>
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (data(); as d) {
      <p class="soft" id="who">{{ d.student.email }} · last active {{ ago(d.row.last_active) }} ·
        <span class="status" [class.bad]="d.row.status === 'behind'" [class.ok]="d.row.status === 'on_track'" id="status">{{ label(d.row.status) }}</span>
      </p>

      <div class="stat-grid" id="stats">
        <div class="stat"><div class="num" id="s-cw">{{ d.row.cw_done }}<span class="soft"> / {{ d.row.cw_total }}</span></div><div class="label">Coursework done</div></div>
        <div class="stat"><div class="num" id="s-tests">{{ d.row.tests_taken }}<span class="soft"> / {{ d.row.tests_available }}</span></div><div class="label">Tests taken</div></div>
        <div class="stat"><div class="num" id="s-avg">{{ d.row.avg_percent === null ? '-' : d.row.avg_percent + '%' }}</div><div class="label">Average score</div></div>
        <div class="stat"><div class="num bad-num" id="s-overdue">{{ d.row.overdue }}</div><div class="label">Overdue</div></div>
      </div>

      @if (d.overdue_items.length) {
        <h2>Overdue coursework</h2>
        <ul class="plain-list" id="overdue-items">
          @for (item of d.overdue_items; track item.title + item.due) {
            <li [attr.data-overdue]="item.title"><app-icon name="flag" [size]="15" /> <strong>{{ item.title }}</strong> <span class="soft">{{ item.subject }} › {{ item.topic }} · was due {{ date(item.due) }} ({{ item.days_late }} {{ item.days_late === 1 ? 'day' : 'days' }} ago)</span></li>
          }
        </ul>
      }

      <h2>Coursework</h2>
      @if (!d.coursework) {
        <div class="empty-state" id="no-coursework"><app-icon name="layers" [size]="32" /><p>No published coursework in this course</p></div>
      }
      @for (subject of d.coursework?.subjects ?? []; track subject.paper_id) {
        <section class="card" [attr.data-subject]="subject.name" style="margin-bottom: 0.7rem">
          <div class="row q-head"><strong>{{ subject.name }}</strong><span class="soft">{{ subject.progress.done }}/{{ subject.progress.total }}</span><span class="cw-bar"><i [style.width.%]="percent(subject.progress.done, subject.progress.total)"></i></span></div>
          @for (topic of subject.topics; track topic.id) {
            <div class="cw-topic" [attr.data-topic]="topic.title">
              <div class="row q-head"><span>{{ topic.title }}</span><span class="soft">{{ topic.progress.done }}/{{ topic.progress.total }}</span></div>
              <ul class="plain-list">
                @for (sub of topic.subtopics; track sub.id) {
                  <li [attr.data-sub]="sub.title">
                    <app-icon [name]="sub.done ? 'check' : sub.overdue ? 'flag' : 'clock'" [size]="15" [class]="sub.done ? 'ok-icon' : sub.overdue ? 'bad-icon' : 'soft-icon'" />
                    {{ sub.title }}
                    <span class="soft">@if (sub.done) { done {{ ago(sub.done_at) }} } @else if (sub.due) { due {{ date(sub.due) }} }</span>
                  </li>
                }
              </ul>
            </div>
          }
        </section>
      }

      <h2>Tests</h2>
      <div class="table-wrap">
        <table class="compact" id="tests">
          <thead><tr><th>Test</th><th>Attempts</th><th>Best score</th><th>State</th></tr></thead>
          <tbody>
            @for (test of d.tests; track test.id) {
              <tr [attr.data-test]="test.title">
                <td><strong>{{ test.title }}</strong></td>
                <td class="soft">{{ test.attempts_used }} of {{ test.max_attempts }}</td>
                <td>@if (test.best) { <strong>{{ test.best.percentage }}%</strong> <span class="status" [class.ok]="test.best.passed" [class.bad]="!test.best.passed">{{ test.best.passed ? 'passed' : 'not passed' }}</span> } @else { <span class="soft">-</span> }</td>
                <td><span class="status" [class.bad]="test.overdue" [class.ok]="test.state === 'open'" [class.warn]="test.state === 'upcoming'">{{ test.overdue ? 'Missed' : test.state === 'open' ? 'Open' : test.state === 'upcoming' ? 'Upcoming' : 'Closed' }}</span></td>
              </tr>
            } @empty {
              <tr><td colspan="4"><div class="empty-state"><app-icon name="clipboard" [size]="32" /><p>No tests for this course</p></div></td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminProgressStudent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly tenants = inject(TenantService);

  readonly data = signal<StudentProgress | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);

  date = shortDate;
  ago = timeAgo;

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.data.set(await this.api.studentProgress(this.route.snapshot.paramMap.get('course') ?? '', this.route.snapshot.paramMap.get('email') ?? ''));
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  label(status: 'behind' | 'not_started' | 'on_track'): string {
    return STATUS_LABELS[status];
  }

  percent(done: number, total: number): number {
    return total ? Math.round((done / total) * 100) : 0;
  }
}

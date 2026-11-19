import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { toCsv } from '../core/csv';
import { formatDateTime, shortDate, timeAgo } from '../core/format';
import { AdminCourse, ApiError, CourseProgress, CourseStuck, ProgressRow, ProgressStatus, ReminderResult } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Avatar } from '../ui/avatar';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

export const STATUS_LABELS: Record<ProgressStatus, string> = { behind: 'Behind', not_started: 'Not started', on_track: 'On track' };

/** For one course: who is behind, and which sub-topics students are not finishing. */
@Component({
  selector: 'app-admin-progress',
  imports: [FormsModule, RouterLink, Avatar, Icon, InfoTip],
  template: `
    <div class="page-head">
      <h1>
        Progress
        <app-info text="Coursework and tests for the students of one course. Behind means something is overdue: a finish-by date passed without the sub-topic marked complete, or a test closed with no attempt. Not started means nothing done yet. Last active is the last time a sub-topic was marked complete or a test was submitted." />
      </h1>
      <span class="row">
        <select id="course" aria-label="Course" [ngModel]="courseId()" (ngModelChange)="pick($event)" [ngModelOptions]="{ standalone: true }" style="width: auto">
          @for (course of courses(); track course.id) { <option [value]="course.id">{{ course.name }}</option> }
        </select>
        @if (data(); as d) {
          <button class="btn small" type="button" id="remind" [disabled]="d.summary.behind === 0 || busy()" (click)="confirmRemind.set(!confirmRemind())"><app-icon name="bell" [size]="16" /> Remind {{ d.summary.behind }}</button>
          <button class="btn secondary small" type="button" id="download-csv" (click)="download()"><app-icon name="download" [size]="16" /> CSV</button>
          <button class="btn secondary small" type="button" id="refresh" [disabled]="refreshing()" (click)="refresh()"><app-icon name="rotate" [size]="16" /> {{ refreshing() ? 'Updating…' : 'Refresh' }}</button>
        }
      </span>
    </div>

    @if (confirmRemind() && data(); as d) {
      <div class="card" id="remind-panel" role="group" aria-label="Remind students who are behind">
        <p style="margin-top: 0">Send a reminder to the <strong>{{ d.summary.behind }}</strong> {{ d.summary.behind === 1 ? 'student' : 'students' }} behind in {{ d.course.name }}? Each gets a notice with their own overdue items. Anyone already reminded today and who hasn't read it is skipped.</p>
        <div class="row">
          <label class="cw-check"><input type="checkbox" id="remind-email" [(ngModel)]="remindEmail" [ngModelOptions]="{ standalone: true }" /> Send an email too</label>
          <button class="btn" type="button" id="remind-send" [disabled]="busy()" (click)="remind()"><app-icon name="bell" [size]="16" /> Send</button>
          <button class="btn secondary" type="button" (click)="confirmRemind.set(false)">Cancel</button>
        </div>
      </div>
    }
    @if (reminded(); as r) {
      <div class="alert ok" role="status" id="remind-result">
        Reminded {{ r.reminded }} {{ r.reminded === 1 ? 'student' : 'students' }}@if (r.skipped) { · {{ r.skipped }} skipped, already reminded }@if (r.emailed) { · {{ r.emailed }} emailed }@if (r.email_failed) { · {{ r.email_failed }} emails could not be sent }
      </div>
    }

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (!courses().length && !loading()) {
      <div class="empty-state"><app-icon name="book" [size]="32" /><p>No courses yet</p></div>
    }

    @if (data(); as d) {
      @if (d.as_of) { <p class="soft small" id="as-of">Updated {{ updated(d.as_of) }}@if (refreshing()) { · working out the latest… }</p> }
      <div class="stat-grid" id="counts">
        <div class="stat"><div class="num" id="c-students">{{ d.summary.students }}</div><div class="label">Students</div></div>
        <div class="stat"><div class="num bad-num" id="c-behind">{{ d.summary.behind }}</div><div class="label">Behind</div></div>
        <div class="stat"><div class="num" id="c-notstarted">{{ d.summary.not_started }}</div><div class="label">Not started</div></div>
        <div class="stat"><div class="num ok-num" id="c-ontrack">{{ d.summary.on_track }}</div><div class="label">On track</div></div>
      </div>

      <nav class="tabs" aria-label="Progress views">
        <button type="button" class="tab with-icon" id="tab-students" [class.active]="tab() === 'students'" (click)="tab.set('students')"><app-icon name="users" [size]="16" /> Students</button>
        <button type="button" class="tab with-icon" id="tab-stuck" [class.active]="tab() === 'stuck'" (click)="showStuck()"><app-icon name="flag" [size]="16" /> Where students get stuck</button>
      </nav>

      @if (tab() === 'students') {
        <div class="filters">
          <input type="search" id="search" placeholder="Search name or email" aria-label="Search students" [(ngModel)]="search" [ngModelOptions]="{ standalone: true }" />
          <label class="cw-check"><input type="checkbox" id="behind-only" [(ngModel)]="behindOnly" [ngModelOptions]="{ standalone: true }" /> Behind only</label>
        </div>
        <div class="table-wrap">
          <table class="compact" id="students">
            <thead><tr><th>Student</th><th>Coursework</th><th>Tests</th><th class="hide-sm">Last active</th><th>Status</th></tr></thead>
            <tbody>
              @for (row of shown(); track row.email) {
                <tr [attr.data-student]="row.email">
                  <td>
                    <span class="person-cell">
                      <app-avatar [url]="row.avatar_url" [first]="row.name.split(' ')[0]" [last]="row.name.split(' ')[1] ?? ''" [email]="row.email" [size]="34" />
                      <span>
                        <a [routerLink]="['/', tenants.slug(), 'admin', 'progress', courseId(), row.email]"><strong>{{ row.name }}</strong></a>
                        <div class="soft">{{ row.email }}</div>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span class="cw-bar"><i [style.width.%]="percent(row.cw_done, row.cw_total)"></i></span>
                    <span class="soft">{{ row.cw_done }}/{{ row.cw_total }}</span>
                    @if (row.cw_overdue) { <span class="tchip-sm bad" title="Overdue sub-topics">{{ row.cw_overdue }} overdue</span> }
                  </td>
                  <td>
                    <span class="soft">{{ row.tests_taken }} of {{ row.tests_available }}</span>
                    @if (row.avg_percent !== null) { <strong> · {{ row.avg_percent }}%</strong> }
                    @if (row.tests_overdue) { <span class="tchip-sm bad" title="Closed tests not attempted">{{ row.tests_overdue }} missed</span> }
                  </td>
                  <td class="soft hide-sm">{{ ago(row.last_active) }}</td>
                  <td><span class="status" [class.bad]="row.status === 'behind'" [class.ok]="row.status === 'on_track'">{{ label(row.status) }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="5"><div class="empty-state"><app-icon name="users" [size]="32" /><p>{{ d.students.length ? 'No students match' : 'No students with access to this course' }}</p></div></td></tr>
              }
            </tbody>
          </table>
        </div>
        @if (d.students.length) { <p class="soft" id="showing">Showing {{ shown().length }} of {{ d.students.length }}</p> }
      } @else {
        @if (stuckLoading()) {
          <p class="muted">Loading…</p>
        } @else if (stuck(); as s) {
          <div class="table-wrap">
            <table class="compact" id="stuck">
              <thead><tr><th>Sub-topic</th><th class="hide-sm">Finish by</th><th>Completed</th></tr></thead>
              <tbody>
                @for (item of s.subtopics; track item.id) {
                  <tr [attr.data-stuck]="item.title">
                    <td><strong>{{ item.title }}</strong><div class="soft">{{ item.subject }} › {{ item.topic }}</div></td>
                    <td class="soft hide-sm">{{ date(item.due) || '-' }}</td>
                    <td>
                      <span class="cw-bar"><i [style.width.%]="item.percent"></i></span>
                      <span class="soft">{{ item.done }} of {{ item.students }}</span>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="3"><div class="empty-state"><app-icon name="layers" [size]="32" /><p>No published coursework in this course yet</p></div></td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    }
  `,
})
export class AdminProgress implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);

  readonly courses = signal<AdminCourse[]>([]);
  readonly courseId = signal('');
  readonly data = signal<CourseProgress | null>(null);
  readonly stuck = signal<CourseStuck | null>(null);
  readonly tab = signal<'students' | 'stuck'>('students');
  readonly loading = signal(false);
  readonly stuckLoading = signal(false);
  readonly refreshing = signal(false);
  updated = formatDateTime;
  readonly error = signal<ApiError | null>(null);
  readonly query = signal('');
  readonly onlyBehind = signal(false);
  readonly confirmRemind = signal(false);
  readonly busy = signal(false);
  readonly reminded = signal<ReminderResult | null>(null);
  remindEmail = true;

  date = shortDate;
  ago = timeAgo;

  get search(): string { return this.query(); }
  set search(value: string) { this.query.set(value ?? ''); }
  get behindOnly(): boolean { return this.onlyBehind(); }
  set behindOnly(value: boolean) { this.onlyBehind.set(!!value); }

  readonly shown = computed<ProgressRow[]>(() => {
    const text = this.query().trim().toLowerCase();
    return (this.data()?.students ?? []).filter(
      (r) => (!this.onlyBehind() || r.status === 'behind') && (!text || r.name.toLowerCase().includes(text) || r.email.toLowerCase().includes(text)),
    );
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const all = await this.api.adminCourses();
      const open = all.filter((c) => c.active);
      this.courses.set(open.length ? open : all);
      if (this.courses().length) await this.pick(this.courses()[0].id);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  async pick(id: string): Promise<void> {
    this.courseId.set(id);
    this.data.set(null);
    this.stuck.set(null);
    this.error.set(null);
    this.reminded.set(null);
    this.confirmRemind.set(false);
    try {
      const saved = await this.api.courseProgress(id);
      this.data.set(saved);
      if (this.tab() === 'stuck') await this.showStuck();
      // The saved page opens at once. If it is over 15 minutes old, work out the latest behind the scenes and swap it in.
      if (saved.fresh === false) await this.refresh();
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  /** Work the latest out (a few seconds) and replace what is shown, unless another course was picked meanwhile. */
  async refresh(): Promise<void> {
    const id = this.courseId();
    if (!id || this.refreshing()) return;
    this.refreshing.set(true);
    try {
      const latest = await this.api.refreshProgress(id);
      if (this.courseId() !== id) return;
      this.data.set(latest);
      this.stuck.set(null);
      if (this.tab() === 'stuck') await this.showStuck();
    } catch (error) {
      if (this.data() === null) this.error.set(error as ApiError);
    } finally {
      this.refreshing.set(false);
    }
  }

  async remind(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.reminded.set(await this.api.sendReminders(this.courseId(), null, this.remindEmail));
      this.confirmRemind.set(false);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async showStuck(): Promise<void> {
    this.tab.set('stuck');
    if (this.stuck() || !this.courseId()) return;
    this.stuckLoading.set(true);
    try {
      this.stuck.set(await this.api.courseStuck(this.courseId()));
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.stuckLoading.set(false);
    }
  }

  label(status: ProgressStatus): string {
    return STATUS_LABELS[status];
  }

  percent(done: number, total: number): number {
    return total ? Math.round((done / total) * 100) : 0;
  }

  /** The table as a spreadsheet file, with every student of the course (not just the ones the filters show). */
  download(): void {
    const d = this.data();
    if (!d) return;
    const rows: (string | number | null)[][] = [
      ['Student', 'Email', 'Status', 'Coursework done', 'Coursework total', 'Coursework overdue', 'Tests taken', 'Tests available', 'Tests missed', 'Average %', 'Last active'],
      ...d.students.map((r) => [r.name, r.email, STATUS_LABELS[r.status], r.cw_done, r.cw_total, r.cw_overdue, r.tests_taken, r.tests_available, r.tests_overdue, r.avg_percent, r.last_active]),
    ];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    link.download = `${d.course.name.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'course'}-progress.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}

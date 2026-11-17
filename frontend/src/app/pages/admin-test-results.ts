import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { toCsv } from '../core/csv';
import { formatDateTime } from '../core/format';
import { AdminAttempt, ApiError, AttemptResult, QuestionStat, ResultRow, TestResults } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';
import { TestResult } from './test-result';

const SORTS = { newest: 'Newest first', high: 'Highest score', low: 'Lowest score', name: 'Student name' } as const;
type Sort = keyof typeof SORTS;

/** How students did at one test: a summary, every attempt (open one to see what the student answered), and how each question went. */
@Component({
  selector: 'app-admin-test-results',
  imports: [FormsModule, RouterLink, Icon, InfoTip, TestResult],
  template: `
    <div class="page-head">
      <h1>
        {{ data()?.test?.title ?? 'Results' }}
        <app-info text="Everything students did at this test. Click an attempt to see their answers with the right answers and reasons." />
      </h1>
      <div class="tools">
        @if (data()) { <button class="btn secondary small" type="button" id="download-csv" (click)="download()"><app-icon name="download" [size]="16" /> Download CSV</button> }
        <a class="btn secondary small" [routerLink]="['/', tenants.slug(), 'admin', 'tests']"><app-icon name="arrow-left" [size]="16" /> Tests</a>
      </div>
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (data(); as d) {
      @if (!d.summary.attempts) {
        <div class="empty-state"><app-icon name="chart" [size]="32" /><p>No one has started this test yet</p></div>
      } @else {
        <div class="stat-grid" id="summary">
          <div class="stat"><div class="num" id="s-students">{{ d.summary.students }}</div><div class="label">Students</div></div>
          <div class="stat"><div class="num" id="s-attempts">{{ d.summary.attempts }}</div><div class="label">Attempts{{ d.summary.in_progress ? ' (' + d.summary.in_progress + ' in progress)' : '' }}</div></div>
          <div class="stat"><div class="num" id="s-average">{{ pct(d.summary.average) }}</div><div class="label">Average</div></div>
          <div class="stat"><div class="num" id="s-highest">{{ pct(d.summary.highest) }}</div><div class="label">Highest</div></div>
          <div class="stat"><div class="num" id="s-lowest">{{ pct(d.summary.lowest) }}</div><div class="label">Lowest</div></div>
          <div class="stat"><div class="num" id="s-pass">{{ pct(d.summary.pass_rate) }}</div><div class="label">Passed ({{ d.summary.passed }} of {{ d.summary.submitted }})</div></div>
        </div>
        <div class="bars" id="distribution" role="img" aria-label="How many attempts scored in each ten percent band">
          @for (count of d.summary.distribution; track $index) {
            <div class="bar-col" [attr.data-band]="$index">{{ count || '' }}<div class="bar" [style.height.%]="barHeight(count)"></div></div>
          }
        </div>
        <div class="bar-labels" aria-hidden="true">@for (count of d.summary.distribution; track $index) { <span>{{ $index * 10 }}</span> }</div>

        <div class="toolbar" id="result-filters">
          <div class="field" style="flex: 2 1 12rem">
            <label class="sr-only" for="rf-search">Search students</label>
            <input id="rf-search" name="rfsearch" type="search" placeholder="Search by student name or email" [ngModel]="filter().search" (ngModelChange)="setFilter('search', $event)" />
          </div>
          <div class="field">
            <label class="sr-only" for="rf-result">Result</label>
            <select id="rf-result" name="rfresult" [ngModel]="filter().result" (ngModelChange)="setFilter('result', $event)">
              <option value="">All results</option>
              <option value="passed">Passed</option>
              <option value="failed">Not passed</option>
              <option value="progress">In progress</option>
            </select>
          </div>
          <div class="field">
            <label class="sr-only" for="rf-sort">Sort</label>
            <select id="rf-sort" name="rfsort" [ngModel]="sort()" (ngModelChange)="sort.set($event)">
              @for (entry of sorts; track entry[0]) { <option [value]="entry[0]">{{ entry[1] }}</option> }
            </select>
          </div>
          <label class="check" style="margin: 0.5rem 0.25rem 0">
            <input id="rf-best" type="checkbox" [ngModel]="filter().best" (ngModelChange)="setFilter('best', $event)" name="rfbest" /> Best per student
          </label>
        </div>
        <p class="soft" id="result-count">{{ shownRows().length === d.attempts.length ? d.attempts.length + ' attempts' : shownRows().length + ' of ' + d.attempts.length + ' attempts' }}</p>

        <div class="table-wrap">
          <table class="compact" id="attempt-table">
            <thead><tr><th>Student</th><th>#</th><th class="hide-sm">Started</th><th class="hide-sm">Time</th><th>Marks</th><th>%</th><th>Result</th></tr></thead>
            <tbody>
              @for (row of shownRows(); track row.email + '#' + row.number) {
                <tr class="result-row" [attr.data-attempt]="row.email + '#' + row.number" (click)="toggle(row)">
                  <td><strong>{{ row.name }}</strong><div class="soft">{{ row.email }}</div></td>
                  <td>{{ row.number }}</td>
                  <td class="soft hide-sm">{{ when(row.started_at) }}</td>
                  <td class="soft hide-sm">{{ took(row) }}</td>
                  @if (row.status === 'submitted') {
                    <td>{{ row.marks }} / {{ row.total_marks }}</td>
                    <td>{{ row.percentage }}%</td>
                    <td><span class="status" [class.ok]="row.passed" [class.bad]="!row.passed">{{ row.passed ? 'Passed' : 'Not passed' }}</span>@if (row.auto_submitted) { <span class="soft" title="Time ran out"> ⏱</span> }</td>
                  } @else {
                    <td class="soft" colspan="3">In progress</td>
                  }
                </tr>
                @if (isOpen(row)) {
                  <tr [attr.data-detail]="row.email + '#' + row.number">
                    <td colspan="7" class="detail-cell">
                      @if (detailError(); as problem) {
                        <div class="alert error" role="alert">{{ problem.detail }}</div>
                      } @else if (!detail()) {
                        <p class="muted">Loading…</p>
                      } @else if (asResult(detail()); as result) {
                        <app-test-result [result]="result" [embedded]="true" />
                      } @else {
                        <p class="soft" id="detail-progress">Still in progress: answered {{ progressText(detail()) }}.</p>
                      }
                    </td>
                  </tr>
                }
              } @empty {
                <tr><td colspan="7"><div class="empty-state"><app-icon name="search" [size]="28" /><p>No attempts match</p></div></td></tr>
              }
            </tbody>
          </table>
        </div>

        <h2 style="margin-top: 1.25rem">Question analysis <app-info text="How many students got each question right, and the wrong option chosen most often. Only finished attempts count." /></h2>
        <div class="row" style="margin-bottom: 0.4rem">
          <button class="btn secondary small" type="button" id="sort-questions" (click)="hardestFirst.set(!hardestFirst())"><app-icon name="filter" [size]="16" /> {{ hardestFirst() ? 'Test order' : 'Hardest first' }}</button>
        </div>
        <div class="table-wrap">
          <table class="compact" id="question-table">
            <thead><tr><th>#</th><th>Question</th><th>Correct</th><th class="hide-sm">Answered</th><th class="hide-sm">Most chosen wrong</th></tr></thead>
            <tbody>
              @for (item of shownQuestions(); track item.id) {
                <tr [attr.data-question]="item.id">
                  <td>{{ numberOf(item) }}</td>
                  <td><div class="clip">{{ item.text }}</div><div class="soft">{{ item.topic }} · {{ item.difficulty }}</div></td>
                  <td>
                    @if (item.percent_correct !== null) {
                      <span class="meter" [class.hard]="num(item.percent_correct) < 35" [class.mid]="num(item.percent_correct) >= 35 && num(item.percent_correct) < 65"><i [style.width.%]="num(item.percent_correct)"></i></span>
                      <strong> {{ item.percent_correct }}%</strong>
                    } @else { <span class="soft">–</span> }
                  </td>
                  <td class="soft hide-sm">{{ item.answered }} of {{ item.faced }}</td>
                  <td class="soft hide-sm">@if (item.most_chosen_wrong; as wrong) { {{ letters[wrong.option] }}: {{ wrong.text }} ({{ wrong.count }}) } @else { – }</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
})
export class AdminTestResults implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly tenants = inject(TenantService);
  readonly letters = ['A', 'B', 'C', 'D'];
  readonly sorts = Object.entries(SORTS);
  readonly when = formatDateTime;

  readonly data = signal<TestResults | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly filter = signal({ search: '', result: '', best: false });
  readonly sort = signal<Sort>('newest');
  readonly hardestFirst = signal(false);

  readonly openKey = signal<string | null>(null);
  readonly detail = signal<AdminAttempt | null>(null);
  readonly detailError = signal<ApiError | null>(null);

  readonly shownRows = computed<ResultRow[]>(() => {
    const d = this.data();
    if (!d) return [];
    const f = this.filter();
    const words = f.search.toLowerCase().split(/\s+/).filter(Boolean);
    let rows = d.attempts;
    if (f.best) {
      // One row per student: the highest finished score (the latest if equal), or the unfinished one if nothing is finished.
      const best = new Map<string, ResultRow>();
      for (const row of rows) {
        const have = best.get(row.email);
        const better = !have || (row.status === 'submitted' && (have.status !== 'submitted' || Number(row.percentage) >= Number(have.percentage)));
        if (better) best.set(row.email, row);
      }
      rows = [...best.values()];
    }
    rows = rows.filter(
      (row) =>
        words.every((word) => (row.name + ' ' + row.email).toLowerCase().includes(word)) &&
        (!f.result ||
          (f.result === 'passed' && row.status === 'submitted' && row.passed) ||
          (f.result === 'failed' && row.status === 'submitted' && !row.passed) ||
          (f.result === 'progress' && row.status === 'in_progress')),
    );
    const sorted = [...rows];
    const score = (row: ResultRow) => (row.status === 'submitted' ? Number(row.percentage) : -1);
    const started = (row: ResultRow) => row.started_at;
    switch (this.sort()) {
      case 'high': return sorted.sort((a, b) => score(b) - score(a));
      case 'low': return sorted.sort((a, b) => (score(a) < 0 ? 1e9 : score(a)) - (score(b) < 0 ? 1e9 : score(b)));
      case 'name': return sorted.sort((a, b) => a.name.localeCompare(b.name) || a.number - b.number);
      default: return sorted.sort((a, b) => started(b).localeCompare(started(a)));
    }
  });

  readonly shownQuestions = computed<QuestionStat[]>(() => {
    const list = this.data()?.questions ?? [];
    if (!this.hardestFirst()) return list;
    const value = (item: QuestionStat) => (item.percent_correct === null ? 101 : Number(item.percent_correct));
    return [...list].sort((a, b) => value(a) - value(b));
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.data.set(await this.api.testResults(this.route.snapshot.paramMap.get('id') ?? ''));
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  setFilter(field: 'search' | 'result' | 'best', value: string | boolean): void {
    this.filter.update((f) => ({ ...f, [field]: value }));
  }

  pct(value: string | null): string {
    return value === null ? '–' : `${value}%`;
  }

  num(value: string | null): number {
    return Number(value ?? 0);
  }

  barHeight(count: number): number {
    const max = Math.max(1, ...(this.data()?.summary.distribution ?? [1]));
    return count ? Math.max(6, (count / max) * 90) : 0;
  }

  took(row: ResultRow): string {
    if (row.seconds === undefined || row.seconds === null) return '';
    const minutes = Math.floor(row.seconds / 60);
    const seconds = row.seconds % 60;
    return minutes ? `${minutes} min${seconds ? ` ${seconds} s` : ''}` : `${seconds} s`;
  }

  numberOf(item: QuestionStat): number {
    return (this.data()?.questions ?? []).findIndex((x) => x.id === item.id) + 1;
  }

  isOpen(row: ResultRow): boolean {
    return this.openKey() === row.email + '#' + row.number;
  }

  /** Open a student's attempt under its row, or close it. */
  async toggle(row: ResultRow): Promise<void> {
    const key = row.email + '#' + row.number;
    if (this.openKey() === key) {
      this.openKey.set(null);
      return;
    }
    this.openKey.set(key);
    this.detail.set(null);
    this.detailError.set(null);
    try {
      const attempt = await this.api.studentAttempt(this.route.snapshot.paramMap.get('id') ?? '', row.email, row.number);
      if (this.openKey() === key) this.detail.set(attempt);
    } catch (error) {
      if (this.openKey() === key) this.detailError.set(error as ApiError);
    }
  }

  asResult(attempt: AdminAttempt | null): AttemptResult | null {
    return attempt && attempt.status === 'submitted' ? attempt : null;
  }

  progressText(attempt: AdminAttempt | null): string {
    return attempt && attempt.status === 'in_progress' ? `${attempt.answered} of ${attempt.questions} questions` : '';
  }

  /** The attempts table as a spreadsheet file. */
  download(): void {
    const d = this.data();
    if (!d) return;
    const rows: (string | number | null)[][] = [
      ['Student', 'Email', 'Attempt', 'Status', 'Started', 'Submitted', 'Minutes', 'Marks', 'Total marks', 'Percentage', 'Result', 'Correct', 'Wrong', 'Not answered', 'Time ran out'],
      ...d.attempts.map((r) => [
        r.name, r.email, r.number, r.status === 'submitted' ? 'Submitted' : 'In progress', r.started_at, r.submitted_at,
        r.seconds === undefined || r.seconds === null ? '' : Math.round((r.seconds / 60) * 10) / 10,
        r.marks ?? '', r.total_marks ?? '', r.percentage ?? '', r.status === 'submitted' ? (r.passed ? 'Passed' : 'Not passed') : '',
        r.correct ?? '', r.wrong ?? '', r.unanswered ?? '', r.auto_submitted ? 'Yes' : '',
      ]),
    ];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    link.download = `${d.test.title.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'test'}-results.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}

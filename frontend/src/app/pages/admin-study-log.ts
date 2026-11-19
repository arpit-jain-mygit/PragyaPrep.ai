import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { formatDateTime } from '../core/format';
import { ApiError, AskLogRow, AskLogSource } from '../core/models';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

/** Below this share of matching words, a match is shown in red. From here to 75% it is amber. At 75% and above, green. */
const RED_BELOW = 0.3;
const GREEN_FROM = 0.75;

/** What students asked in Ask AI, how well the notes covered each question, and where the answer is in the coursework. */
@Component({
  selector: 'app-admin-study-log',
  imports: [Icon, InfoTip],
  styles: `
    .meter { display: flex; align-items: center; gap: 8px; min-width: 150px; }
    .meter-track { flex: 1; height: 10px; border-radius: 5px; background: var(--border, #e5e7eb); overflow: hidden; }
    .meter-fill { display: block; height: 100%; border-radius: 5px; }
    .meter-fill.low { background: #d64545; }
    .meter-fill.mid { background: #e0a100; }
    .meter-fill.high { background: #2e9e5b; }
    .meter-value { font-weight: 500; min-width: 3ch; text-align: right; }
    .source { display: block; margin-bottom: 6px; }
    .source-line { font-size: 13px; color: var(--text-secondary, #6b7280); }
  `,
  template: `
    <div class="page-head">
      <h1>
        Ask AI log
        <app-info text="Every question a student asks in Ask AI, with how well the notes covered it. Rows are deleted automatically after 30 days. A student's name and email appear only when you tick the box." />
      </h1>
      <button class="btn secondary" type="button" id="refresh" [disabled]="loading()" (click)="load()">
        <app-icon name="rotate" [size]="16" /> {{ loading() ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    <div class="form-panel">
      <div class="field">
        <label for="filter">Show</label>
        <select id="filter" name="filter" [value]="filter()" (change)="setFilter($any($event.target).value)">
          <option value="all">All questions</option>
          <option value="not_covered">Not covered (the app did not answer)</option>
          <option value="low_coverage">Low coverage (no passage shown)</option>
        </select>
      </div>
      <div class="field">
        <label for="below">Best match</label>
        <select id="below" name="below" [value]="below() === null ? 'any' : String(below())" (change)="setBelow($any($event.target).value)">
          <option value="any">Any</option>
          <option value="0.75">Below 75%</option>
        </select>
      </div>
      <div class="field">
        <label for="sort">Order</label>
        <select id="sort" name="sort" [value]="sort()" (change)="setSort($any($event.target).value)">
          <option value="newest">Newest first</option>
          <option value="worst">Worst match first</option>
        </select>
      </div>
      <label class="check">
        <input type="checkbox" id="show-student" [checked]="showStudent()" (change)="setShowStudent($any($event.target).checked)" />
        Show which student asked
      </label>
    </div>

    @if (loading() && rows().length === 0) {
      <p class="soft">Loading…</p>
    } @else if (rows().length === 0) {
      <div class="empty-state" id="log-empty"><app-icon name="search" [size]="28" /><p><strong>No questions here yet.</strong></p><p class="soft">Questions appear as students use Ask AI.</p></div>
    } @else {
      <div class="table-wrap">
        <table class="compact" id="log">
          <thead>
            <tr>
              <th>When</th>
              <th>Question</th>
              <th>Best match</th>
              <th>Passages</th>
              <th>Answered</th>
              <th>Coursework</th>
              @if (showStudent()) { <th>Student</th> }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr [attr.data-band]="band(row.best_coverage)">
                <td>{{ formatDate(row.created_at) }}</td>
                <td>{{ row.question }}</td>
                <td>
                  <div class="meter" [attr.aria-label]="'Best match ' + percent(row.best_coverage)">
                    <span class="meter-track" aria-hidden="true"><span class="meter-fill" [class]="'meter-fill ' + band(row.best_coverage)" [style.width]="percent(row.best_coverage)"></span></span>
                    <span class="meter-value">{{ percent(row.best_coverage) }}</span>
                  </div>
                </td>
                <td>{{ row.matches }}</td>
                <td>{{ row.answered ? 'Yes' : 'No' }}</td>
                <td>
                  @for (source of row.sources ?? []; track $index) {
                    <span class="source">
                      <span class="source-line">{{ source.course }} › {{ source.topic }} › {{ source.subtopic }}</span><br />
                      <button class="btn small secondary" type="button" [disabled]="openingKey() === row.id + $index" (click)="openSource(row.id, source, $index)">
                        <app-icon name="file" [size]="14" /> {{ source.file }}, page {{ source.page }}
                      </button>
                    </span>
                  } @empty {
                    <span class="soft">None</span>
                  }
                </td>
                @if (showStudent()) { <td>{{ row.student_name }}<br /><span class="soft">{{ row.student_email }}</span></td> }
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminStudyLog implements OnInit {
  private readonly api = inject(ApiService);

  readonly filter = signal('all');
  readonly below = signal<number | null>(null);
  readonly sort = signal('newest');
  readonly showStudent = signal(false);
  readonly rows = signal<AskLogRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  readonly openingKey = signal<string | null>(null);

  readonly String = String;

  ngOnInit(): void {
    void this.load();
  }

  setFilter(value: string): void {
    this.filter.set(value);
    void this.load();
  }

  setBelow(value: string): void {
    this.below.set(value === 'any' ? null : Number(value));
    void this.load();
  }

  setSort(value: string): void {
    this.sort.set(value);
    void this.load();
  }

  setShowStudent(value: boolean): void {
    this.showStudent.set(value);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const reply = await this.api.studyLog(this.filter(), this.showStudent(), this.below(), this.sort());
      this.rows.set(reply.rows);
    } catch (error) {
      this.rows.set([]);
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  /** Open the passage's PDF at its page. A new tab opens first, as for other files. */
  async openSource(rowId: string, source: AskLogSource, index: number): Promise<void> {
    if (this.openingKey() !== null) return;
    this.openingKey.set(rowId + index);
    this.error.set(null);
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const link = await this.api.adminFileLink(source.course_id, source.file_id);
      const url = `${link.url}#page=${source.page}`;
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (error) {
      tab?.close();
      this.error.set(error as ApiError);
    } finally {
      this.openingKey.set(null);
    }
  }

  /** The coverage score as a whole percentage, for example 0.32 becomes 32%. */
  percent(score: number): string {
    return `${Math.round(score * 100)}%`;
  }

  /** The colour band for a score: red below 30%, amber up to 75%, green from 75%. */
  band(score: number): 'low' | 'mid' | 'high' {
    if (score < RED_BELOW) return 'low';
    if (score < GREEN_FROM) return 'mid';
    return 'high';
  }

  formatDate(value: string): string {
    return formatDateTime(value);
  }
}

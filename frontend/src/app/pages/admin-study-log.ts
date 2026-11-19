import { Component, ElementRef, OnInit, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { formatDateTime } from '../core/format';
import { ApiError, AskLogRow, AskLogSource } from '../core/models';
import { Choice } from '../ui/choice';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

/** Below this share of matching words, a match is shown in red. From here to 75% it is amber. At 75% and above, green. */
const RED_BELOW = 0.3;
const GREEN_FROM = 0.75;

/** What students asked in Ask AI, how well the notes covered each question, and where the answer is in the coursework. */
@Component({
  selector: 'app-admin-study-log',
  imports: [FormsModule, Choice, Icon, InfoTip],
  styles: `
    .meter { display: flex; align-items: center; gap: 8px; min-width: 150px; }
    .meter-track { flex: 1; height: 10px; border-radius: 5px; background: var(--border, #e5e7eb); overflow: hidden; }
    .meter-fill { display: block; height: 100%; border-radius: 5px; }
    .meter-fill.low { background: #d64545; }
    .meter-fill.mid { background: #e0a100; }
    .meter-fill.high { background: #2e9e5b; }
    .meter-value { font-weight: 500; min-width: 3ch; text-align: right; }
    .source { display: block; margin-bottom: 6px; }
    .filters { display: flex; flex-wrap: wrap; gap: 16px 32px; align-items: flex-start; }
    .divider { border: 0; border-top: 1px solid var(--border, #e5e7eb); margin: 16px 0; }
    .source-line { font-size: 13px; color: var(--text-secondary, #6b7280); }
    .source-list { list-style: none; padding: 0; margin: 12px 0 0; }
    .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 50; }
    .dialog { background: var(--surface-1, #fff); color: var(--text-primary, #111827); border-radius: 12px; padding: 20px; width: min(560px, 100%); max-height: 80vh; overflow: auto; }
    .dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .dialog-head h2 { margin: 0; font-size: 18px; font-weight: 500; }
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
      <div class="filters">
        <div class="field">
          <label for="match">Best match</label>
          <app-choice id="match" name="match" label="Best match" [options]="[{ value: 'all', label: 'All' }, { value: 'under_75', label: 'Under 75%' }, { value: 'under_30', label: 'Under 30%' }]" [ngModel]="match()" (ngModelChange)="setMatch($event)" />
        </div>
        <div class="field">
          <label for="sort">Order</label>
          <app-choice id="sort" name="sort" label="Order" [options]="[{ value: 'newest', label: 'Newest' }, { value: 'worst', label: 'Worst first' }]" [ngModel]="sort()" (ngModelChange)="setSort($event)" />
        </div>
      </div>
      <label class="check">
        <input type="checkbox" id="show-student" [checked]="showStudent()" (change)="setShowStudent($any($event.target).checked)" />
        Show which student asked
      </label>
    </div>

    <hr class="divider" />

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
                  @if ((row.sources ?? []).length) {
                    <button class="btn small secondary" type="button" (click)="showSources(row)">
                      <app-icon name="book" [size]="14" /> View {{ row.sources.length }} {{ row.sources.length === 1 ? 'source' : 'sources' }}
                    </button>
                  } @else {
                    <span class="soft">None</span>
                  }
                </td>
                @if (showStudent()) { <td>{{ row.student_name }}<br /><span class="soft">{{ row.student_email }}</span></td> }
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (next()) { <div #sentinel id="sentinel" style="height: 1px" aria-hidden="true"></div> }
      @if (loadingMore()) { <p class="muted center" id="loading-more">Loading…</p> }
    }

    @if (openedRow(); as opened) {
      <div class="overlay" (click)="closeSources()">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="sources-title" id="sources-dialog" (click)="$event.stopPropagation()">
          <div class="dialog-head">
            <h2 id="sources-title">Coursework for this question</h2>
            <button class="btn small secondary" type="button" id="close-sources" (click)="closeSources()">Close</button>
          </div>
          <p class="soft">{{ opened.question }}</p>
          <ol class="source-list">
            @for (source of opened.sources; track $index) {
              <li class="source">
                <span class="source-line">{{ source.course }} › {{ source.topic }} › {{ source.subtopic }}</span><br />
                <button class="btn small secondary" type="button" [disabled]="openingKey() === opened.id + $index" (click)="openSource(opened.id, source, $index)">
                  <app-icon name="file" [size]="14" /> {{ source.file }}, page {{ source.page }}
                </button>
              </li>
            }
          </ol>
        </div>
      </div>
    }
  `,
})
export class AdminStudyLog implements OnInit {
  /** How many questions to fetch at a time. More are fetched as the admin scrolls near the end. */
  static readonly PAGE_SIZE = 25;

  private readonly api = inject(ApiService);

  readonly match = signal('all');
  readonly sort = signal('newest');
  readonly showStudent = signal(false);
  readonly rows = signal<AskLogRow[]>([]);
  /** The cursor for the next page, or null when every question for these settings is loaded. */
  readonly next = signal<string | null>(null);
  readonly loadingMore = signal(false);
  /** The bottom of the table. When it comes near the screen, the next page is fetched. */
  readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  readonly openingKey = signal<string | null>(null);
  /** The question whose coursework list is open in the popup, or null when no popup is open. */
  readonly openedRow = signal<AskLogRow | null>(null);

  showSources(row: AskLogRow): void {
    this.openedRow.set(row);
  }

  closeSources(): void {
    this.openedRow.set(null);
  }

  constructor() {
    // Watch the bottom of the table. Each time a page is added, the watch starts again, so a short page keeps filling.
    effect((onCleanup) => {
      const element = this.sentinel()?.nativeElement;
      const cursor = this.next();
      if (!element || !cursor || typeof IntersectionObserver === 'undefined') return;
      const watcher = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) void this.loadMore();
        },
        { rootMargin: '400px 0px' },
      );
      watcher.observe(element);
      onCleanup(() => watcher.disconnect());
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  setMatch(value: string): void {
    this.match.set(value);
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

  /** Start the log again from its first page (new filter, sort, or Refresh). */
  async load(): Promise<void> {
    const wanted = this.settingsKey();
    this.loading.set(true);
    this.error.set(null);
    this.next.set(null);
    try {
      const reply = await this.api.studyLogPage(this.match(), this.showStudent(), this.sort(), null, AdminStudyLog.PAGE_SIZE);
      if (wanted !== this.settingsKey()) return; // the admin changed a setting while this was loading
      this.rows.set(reply.rows);
      this.next.set(reply.next);
    } catch (error) {
      this.rows.set([]);
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  /** Add the next page to the bottom of the table. Does nothing if a page is already loading or none are left. */
  async loadMore(): Promise<void> {
    const cursor = this.next();
    if (!cursor || this.loadingMore() || this.loading()) return;
    const wanted = this.settingsKey();
    this.loadingMore.set(true);
    try {
      const reply = await this.api.studyLogPage(this.match(), this.showStudent(), this.sort(), cursor, AdminStudyLog.PAGE_SIZE);
      if (wanted !== this.settingsKey()) return;
      this.rows.update((list) => [...list, ...reply.rows]);
      this.next.set(reply.next);
    } catch (error) {
      // Keep the cursor, so scrolling again can retry; show what went wrong.
      this.error.set(error as ApiError);
    } finally {
      this.loadingMore.set(false);
    }
  }

  /** The settings that decide which questions are listed, as one string, to spot a change while a page is loading. */
  private settingsKey(): string {
    return `${this.match()}|${this.showStudent()}|${this.sort()}`;
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

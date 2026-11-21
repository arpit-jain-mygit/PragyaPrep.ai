import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AnalyseFilters, AnalyseView, ApiError } from '../core/models';

const HEADINGS: Record<'topic' | 'sectional' | 'mock', { heading: string; hint: string }> = {
  topic: { heading: 'Topic test analytics', hint: 'How you are doing on the topic tests you have taken, by subject and topic.' },
  sectional: { heading: 'Sectional analytics', hint: 'How you are doing on the sectionals you have taken, by subject and topic.' },
  mock: { heading: 'Mock analytics', hint: 'How you are doing on the mocks you have taken, by subject and topic.' },
};

/**
 * Analyse for one kind of test: the summary, a trend of your scores, and your accuracy by subject and topic,
 * weakest first. The page reads only your own submitted attempts.
 */
@Component({
  selector: 'app-student-analyse',
  imports: [DatePipe, FormsModule],
  template: `
    <div class="page-head"><h1>{{ heading() }}</h1></div>
    <p class="hint">{{ hint() }}</p>

    <section class="card analyse-filters" id="analyse-filters" aria-label="Filters">
      <label class="small">Subject
        <select id="filter-subject" name="subject" [(ngModel)]="subject" (ngModelChange)="reload()">
          <option value="">All subjects</option>
          @for (option of view()?.subject_options ?? []; track option.id) { <option [value]="option.id">{{ option.name }}</option> }
        </select>
      </label>
      <label class="small">From
        <input id="filter-start" type="date" name="start" [(ngModel)]="start" (ngModelChange)="reload()" />
      </label>
      <label class="small">To
        <input id="filter-end" type="date" name="end" [(ngModel)]="end" (ngModelChange)="reload()" />
      </label>
      <button class="btn secondary small" type="button" id="filter-clear" (click)="clear()">Clear filters</button>
    </section>

    @if (error(); as problem) { <div class="alert error" role="alert" id="analyse-error">{{ problem.detail }}</div> }
    @if (view(); as v) {
      <section class="card" id="analyse-summary">
        <p><strong>{{ v.summary.attempts }}</strong> attempts</p>
        @if (v.summary.attempts) {
          <p>Average <strong>{{ v.summary.average }}%</strong>, best <strong>{{ v.summary.best }}%</strong></p>
        }
      </section>

      @if (v.summary.attempts) {
        <section class="card" id="analyse-trend">
          <h2>Recent scores</h2>
          <ul class="plain-list">
            @for (row of v.trend; track $index) {
              <li class="trend-row"><span>{{ row.title }}</span> <span class="muted small">{{ row.started_at | date: 'd MMM' }}</span> <strong>{{ row.percentage }}%</strong></li>
            }
          </ul>
        </section>

        @for (subject of v.subjects; track subject.id) {
          <section class="card subject" [attr.data-subject]="subject.id">
            <h2>{{ subject.name }} <span class="muted small">{{ subject.accuracy }}% right</span></h2>
            <table class="compact">
              <thead><tr><th>Topic</th><th>Right</th><th>Wrong</th><th>Left out</th><th>Accuracy</th></tr></thead>
              <tbody>
                @for (topic of subject.topics; track topic.topic) {
                  <tr [attr.data-topic]="topic.topic">
                    <td>{{ topic.topic }}</td><td>{{ topic.correct }}</td><td>{{ topic.wrong }}</td><td>{{ topic.unanswered }}</td><td>{{ topic.accuracy }}%</td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
        }
      } @else {
        <p class="muted" id="analyse-empty">No attempts yet. Your numbers appear here once you submit a test.</p>
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class StudentAnalyse implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly kind: 'topic' | 'sectional' | 'mock' = (['sectional', 'mock'] as const).find((k) => this.route.snapshot.data?.['view'] === k) ?? 'topic';
  readonly heading = computed(() => HEADINGS[this.kind].heading);
  readonly hint = computed(() => HEADINGS[this.kind].hint);

  readonly view = signal<AnalyseView | null>(null);
  readonly error = signal<ApiError | null>(null);
  subject = '';
  start = '';
  end = '';

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  /** Load the analysis with the current filters. The subject list comes back from the server, so it stays complete. */
  async reload(): Promise<void> {
    this.error.set(null);
    const filters: AnalyseFilters = { subject: this.subject, start: this.start, end: this.end };
    try {
      this.view.set(await this.api.myAnalyse(this.kind, filters));
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  clear(): void {
    this.subject = '';
    this.start = '';
    this.end = '';
    void this.reload();
  }
}

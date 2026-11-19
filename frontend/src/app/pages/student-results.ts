import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { formatDate } from '../core/format';
import { ApiError, MyResults, MyResultRow } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { AskAi } from '../ui/ask-ai';
import { Sparkle } from '../ui/sparkle';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

/** A student's results across all their tests: totals, how their scores are moving, every finished attempt, and where they are strong or weak. */
@Component({
  selector: 'app-student-results',
  imports: [FormsModule, RouterLink, AskAi, Icon, InfoTip, Sparkle],
  template: `
    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (data(); as d) {
      @if (!d.summary.attempts) {
        <div class="empty-state" id="no-results">
          <app-icon name="chart" [size]="32" />
          <p>{{ d.summary.in_progress ? 'Finish your test to see your results here' : 'Take a test to see your results here' }}</p>
        </div>
      } @else {
        <div class="stat-grid" id="summary">
          <div class="stat"><div class="num" id="s-tests">{{ d.summary.tests_taken }}</div><div class="label">Tests taken</div></div>
          <div class="stat"><div class="num" id="s-attempts">{{ d.summary.attempts }}</div><div class="label">Attempts</div></div>
          <div class="stat"><div class="num" id="s-average">{{ d.summary.average }}%</div><div class="label">Average score</div></div>
          <div class="stat"><div class="num" id="s-best">{{ d.summary.best }}%</div><div class="label">Best score</div></div>
          <div class="stat"><div class="num" id="s-passed">{{ d.summary.tests_passed }} <span class="soft">of {{ d.summary.tests_taken }}</span></div><div class="label">Tests passed</div></div>
        </div>

        @if (d.trend.length > 1) {
          <h2>Your scores <app-info text="Each bar is one attempt, oldest on the left. Green bars passed." /></h2>
          <div class="bars trend" id="trend" role="img" aria-label="Score of each recent attempt">
            @for (point of d.trend; track $index) {
              <div class="bar-col" [attr.data-point]="$index" [attr.title]="point.title + ', attempt ' + point.number + ': ' + point.percentage + '%'">
                <span>{{ point.percentage }}</span>
                <div class="bar" [class.pass]="point.passed" [class.fail]="!point.passed" [style.height.%]="barHeight(point.percentage)"></div>
              </div>
            }
          </div>
        }

        <app-ask-ai [prefill]="askTopic()" />

        <h2>Strengths and weaknesses <app-info text="How many of the questions you met in each subject and topic you answered correctly, from all your finished tests. Weakest first." /></h2>
        @for (subject of d.subjects; track subject.id) {
          <div class="card subject-card" [attr.data-subject]="subject.id">
            <div class="row q-head">
              <strong>{{ subject.name }}</strong>
              <span class="soft">{{ subject.correct }} of {{ subject.questions }} · {{ subject.accuracy }}%</span>
              <span class="meter" [class.hard]="level(subject.accuracy) === 'weak'" [class.mid]="level(subject.accuracy) === 'ok'"><i [style.width.%]="subject.accuracy"></i></span>
            </div>
            @for (topic of subject.topics; track topic.topic) {
              <div class="topic-row" [attr.data-topic]="topic.topic">
                <span class="topic-name">{{ topic.topic }}</span>
                <span class="meter" [class.hard]="level(topic.accuracy) === 'weak'" [class.mid]="level(topic.accuracy) === 'ok'"><i [style.width.%]="topic.accuracy"></i></span>
                <span class="soft topic-score">{{ topic.correct }} of {{ topic.questions }} · {{ topic.accuracy }}%</span>
                <button class="btn small secondary" type="button" [attr.data-ask]="topic.topic" (click)="askAbout(topic.topic)"><app-sparkle [size]="18" /> Ask AI</button>
                @if (level(topic.accuracy) === 'weak') {
                  <button class="btn small" type="button" [attr.data-weak]="topic.topic" [disabled]="making()" (click)="practise(subject.id, topic.topic)"><app-icon name="play" [size]="14" /> Practise this</button>
                } @else if (level(topic.accuracy) === 'ok') {
                  <button class="btn small secondary" type="button" [attr.data-improve]="topic.topic" [disabled]="making()" (click)="practise(subject.id, topic.topic)"><app-icon name="play" [size]="14" /> Practise</button>
                }
              </div>
            }
          </div>
        } @empty {
          <p class="soft">Your topic results will show here after your next test.</p>
        }

        <h2>All your results</h2>
        <div class="toolbar" id="my-filters">
          <div class="field" style="flex: 2 1 12rem">
            <label class="sr-only" for="mr-search">Search tests</label>
            <input id="mr-search" name="mrsearch" type="search" placeholder="Search by test name" [ngModel]="filter().search" (ngModelChange)="setFilter('search', $event)" />
          </div>
          <div class="field">
            <label class="sr-only" for="mr-result">Result</label>
            <select id="mr-result" name="mrresult" [ngModel]="filter().result" (ngModelChange)="setFilter('result', $event)">
              <option value="">All results</option>
              <option value="passed">Passed</option>
              <option value="failed">Not passed</option>
            </select>
          </div>
        </div>
        <div class="table-wrap">
          <table class="compact" id="results-table">
            <thead><tr><th>Test</th><th class="hide-sm">Date</th><th>Marks</th><th>%</th><th>Result</th><th><span class="sr-only">Open</span></th></tr></thead>
            <tbody>
              @for (row of shownRows(); track row.test_id + '#' + row.number) {
                <tr [attr.data-result]="row.test_id + '#' + row.number">
                  <td><strong>{{ row.title }}</strong><div class="soft">Attempt {{ row.number }}</div></td>
                  <td class="soft hide-sm">{{ date(row.started_at) }}</td>
                  <td>{{ row.marks }} / {{ row.total_marks }}</td>
                  <td>{{ row.percentage }}%</td>
                  <td><span class="status" [class.ok]="row.passed" [class.bad]="!row.passed">{{ row.passed ? 'Passed' : 'Not passed' }}</span>@if (row.auto_submitted) { <span class="soft" title="Time ran out"> ⏱</span> }</td>
                  <td class="actions-cell"><a class="btn secondary small" [routerLink]="['/', tenants.slug(), 'tests', row.test_id, 'attempts', row.number]">Open</a></td>
                </tr>
              } @empty {
                <tr><td colspan="6"><div class="empty-state"><app-icon name="search" [size]="28" /><p>No results match</p></div></td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
})
export class StudentResults implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);
  private readonly router = inject(Router);
  readonly date = formatDate;
  readonly making = signal(false);
  /** The topic last sent to the Ask AI box. Setting it again with the same topic still refills the box. */
  readonly askTopic = signal('');

  readonly data = signal<MyResults | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly filter = signal({ search: '', result: '' });

  readonly shownRows = computed<MyResultRow[]>(() => {
    const d = this.data();
    if (!d) return [];
    const f = this.filter();
    const words = f.search.toLowerCase().split(/\s+/).filter(Boolean);
    return d.attempts.filter(
      (row) =>
        words.every((word) => row.title.toLowerCase().includes(word)) &&
        (!f.result || (f.result === 'passed' && row.passed) || (f.result === 'failed' && !row.passed)),
    );
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.data.set(await this.api.myResults());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  /** Make a practice test on this topic and open it. */
  /** Put a topic into the Ask AI box and bring the box into view. */
  askAbout(topic: string): void {
    this.askTopic.set('');
    queueMicrotask(() => {
      this.askTopic.set(topic);
      document.getElementById('study-search')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  }

  async practise(paper: string, topic: string): Promise<void> {
    if (this.making()) return;
    this.making.set(true);
    this.error.set(null);
    try {
      const made = await this.api.makePractice({ paper, topic });
      await this.router.navigate(['/', this.tenants.slug(), 'tests', made.id]);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.making.set(false);
    }
  }

  setFilter(field: 'search' | 'result', value: string): void {
    this.filter.update((f) => ({ ...f, [field]: value ?? '' }));
  }

  barHeight(percentage: string): number {
    return Math.max(4, Number(percentage) * 0.9);
  }

  /** Under 50% is a weak spot, 50 to 74% is fair, 75% and above is strong. */
  level(accuracy: string): 'weak' | 'ok' | 'strong' {
    const value = Number(accuracy);
    return value < 50 ? 'weak' : value < 75 ? 'ok' : 'strong';
  }
}

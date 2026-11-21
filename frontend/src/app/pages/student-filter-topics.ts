import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ApiError, FilterTopicGroup, QuestionViewer, ViewerQuestion } from '../core/models';
import { TenantService } from '../core/tenant.service';

/**
 * Filter topics: each subject's topics that appear in the past papers, with how many questions each has.
 * "Questions" opens a viewer of those questions, filtered by year and difficulty, with each answer one click away.
 * "Practise" makes a short practice test on that topic, the same way as Topic tests.
 */
@Component({
  selector: 'app-student-filter-topics',
  imports: [FormsModule],
  template: `
    <div class="page-head"><h1>Filter topics</h1></div>
    <p class="hint">Pick a topic from the past papers to read its questions, or practise it.</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="filter-error">{{ problem.detail }}</div> }
    @for (group of groups(); track group.paper) {
      <section class="card" [attr.data-paper]="group.paper">
        <h2>{{ group.paper }}</h2>
        <ul class="plain-list">
          @for (topic of group.topics; track topic.name) {
            <li class="topic-row" [attr.data-topic]="topic.name">
              <span>{{ topic.name }}</span>
              <span class="muted small">{{ topic.count }} {{ topic.count === 1 ? 'question' : 'questions' }}</span>
              <button class="btn secondary small" type="button" data-view (click)="open(group.paper, topic.name)">Questions</button>
              <button class="btn small" type="button" [disabled]="busy()" (click)="practise(group.paper, topic.name)">Practise</button>
            </li>
          }
        </ul>
      </section>
    } @empty {
      @if (loaded()) { <p class="muted" id="no-filter-topics">No topics from the past papers yet.</p> }
    }

    @if (chosen(); as pick) {
      <section class="card" id="question-viewer">
        <div class="row" style="justify-content: space-between; flex-wrap: wrap; gap: 0.5rem">
          <h2 style="margin: 0">{{ pick.topic }} <span class="muted small">{{ pick.paper }}</span></h2>
          <div class="row" style="gap: 0.5rem; flex-wrap: wrap">
            <label class="small">Year
              <select id="viewer-year" name="year" [(ngModel)]="year" (ngModelChange)="load()">
                <option value="">All years</option>
                @for (y of viewer()?.years ?? []; track y) { <option [value]="y">{{ y }}</option> }
              </select>
            </label>
            <label class="small">Difficulty
              <select id="viewer-difficulty" name="difficulty" [(ngModel)]="difficulty" (ngModelChange)="load()">
                <option value="">All levels</option>
                @for (d of viewer()?.difficulties ?? []; track d) { <option [value]="d">{{ d }}</option> }
              </select>
            </label>
          </div>
        </div>

        @if (viewer(); as view) {
          <p class="muted small" id="viewer-count">
            {{ view.total }} {{ view.total === 1 ? 'question' : 'questions' }}{{ view.total > view.limit ? ', showing the first ' + view.limit : '' }}
          </p>
          @for (item of view.questions; track item.id) {
            <article class="viewer-question" [attr.data-question]="item.id">
              <p><strong>{{ item.text }}</strong></p>
              <p class="muted small">{{ item.difficulty }}@if (item.years.length) { · {{ item.years.join(', ') }} }</p>
              @if (item.kind === 'mcq') {
                <ol class="plain-list" type="A">
                  @for (option of item.options; track option.letter) {
                    <li [class.right]="shown(item.id) && option.letter === item.correct_letter">
                      <strong>{{ option.letter }}.</strong> {{ option.text }}
                      @if (shown(item.id) && option.why) { <span class="muted small"> {{ option.why }}</span> }
                    </li>
                  }
                </ol>
              } @else {
                <p class="small">Type the answer.</p>
              }
              <button class="btn secondary small" type="button" [attr.data-answer]="item.id" (click)="toggle(item.id)">{{ shown(item.id) ? 'Hide answer' : 'Show answer' }}</button>
              @if (shown(item.id)) {
                @if (item.kind === 'fill_in') { <p class="small"><strong>Answer:</strong> {{ answerText(item) }}</p> }
                @if (item.explanation) { <p class="small muted">{{ item.explanation }}</p> }
              }
            </article>
          } @empty {
            <p class="muted" id="viewer-empty">No questions match these filters.</p>
          }
        } @else {
          <p class="muted">Loading…</p>
        }
      </section>
    }
  `,
  styles: `
    .viewer-question { border-top: 1px solid var(--line, #e2e8f0); padding: 0.75rem 0; }
    .right { color: #15803d; font-weight: 600; }
  `,
})
export class StudentFilterTopics implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly tenants = inject(TenantService);

  readonly groups = signal<FilterTopicGroup[]>([]);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly chosen = signal<{ paper: string; topic: string } | null>(null);
  readonly viewer = signal<QuestionViewer | null>(null);
  readonly revealed = signal<Set<string>>(new Set());
  year = '';
  difficulty = '';

  async ngOnInit(): Promise<void> {
    try {
      this.groups.set(await this.api.myFilterTopics());
      this.loaded.set(true);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  /** Open the viewer for one topic, with no year or difficulty filter. */
  async open(paper: string, topic: string): Promise<void> {
    this.chosen.set({ paper, topic });
    this.year = '';
    this.difficulty = '';
    this.revealed.set(new Set());
    await this.load();
  }

  /** Reload the viewer with the current filters. */
  async load(): Promise<void> {
    const pick = this.chosen();
    if (!pick) return;
    this.error.set(null);
    try {
      const year = this.year ? Number(this.year) : undefined;
      this.viewer.set(await this.api.filterQuestions({ paper: pick.paper, topic: pick.topic, difficulty: this.difficulty || undefined, year }));
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  shown(id: string): boolean {
    return this.revealed().has(id);
  }

  toggle(id: string): void {
    const next = new Set(this.revealed());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.revealed.set(next);
  }

  answerText(item: ViewerQuestion): string {
    return Array.isArray(item.answer) ? item.answer.join(' or ') : (item.answer ?? '');
  }

  async practise(paper: string, topic: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const made = await this.api.makePractice({ paper, topic, count: 10 });
      await this.router.navigate(['/', this.tenants.slug(), 'tests', made.id]);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }
}

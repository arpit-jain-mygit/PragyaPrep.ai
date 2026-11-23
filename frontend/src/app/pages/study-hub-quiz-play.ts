import { Component, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { HubCmQuizQuestion, HubTestResult, HubWmQuestion } from '../core/models';
import { TenantService } from '../core/tenant.service';

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * One chapter's quiz. Wren & Martin: one question at a time, with feedback after each answer.
 * Cambridge Maths: every question on one page, checked together at the end.
 * Nothing is saved on the server; progress lives only on this page.
 */
@Component({
  selector: 'app-study-hub-quiz-play',
  imports: [RouterLink],
  template: `
    <p class="crumb"><a [routerLink]="base + '/' + subject() + '/quiz'">🎯 Quiz</a> &middot; Chapter {{ chapter() }}</p>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (loading()) {
      <p class="sub">Loading the quiz...</p>
    } @else if (isWm()) {
      @if (finished()) {
        <section class="card done">
          <div class="trophy" aria-hidden="true">🎉</div>
          <h2>Chapter {{ chapter() }} complete</h2>
          <p>You have answered {{ answeredCount() }} of {{ questions().length }} questions.</p>
          <a class="btn block" [routerLink]="base + '/' + subject() + '/quiz'">Pick another chapter</a>
          <a class="btn ghost block" [routerLink]="base + '/' + subject() + '/learn/' + chapter()">Read the chapter notes</a>
        </section>
      } @else if (current(); as q) {
        <div class="bar-wrap" aria-label="Progress">
          <div class="bar" [style.width.%]="(index() / questions().length) * 100"></div>
        </div>
        <p class="count">Question {{ index() + 1 }} of {{ questions().length }}</p>

        <p class="source">
          @if (q.source === 'Book') {
            📖 From the book{{ q.exercise ? ' · ' + q.exercise : '' }}
          } @else {
            ✏️ Practice question
          }
        </p>
        <h2 class="stem">{{ q.stem }}</h2>

        <div class="options" role="group" aria-label="Answer choices">
          @for (opt of q.options; track $index; let i = $index) {
            <button class="opt"
                    [class.right]="result()?.correct && selected() === i"
                    [class.wrong]="result() && !result()!.correct && selected() === i"
                    [disabled]="busy() || (result()?.correct ?? false)"
                    (click)="choose(i)">
              <span class="letter">{{ letters[i] }}</span>
              <span>{{ opt }}</span>
            </button>
          }
        </div>

        @if (result(); as r) {
          <div class="feedback" [class.good]="r.correct" [class.bad]="!r.correct" role="status">
            @if (r.correct) {
              <strong>{{ alreadyDone() ? 'Already answered' : 'Correct!' }}</strong>
              <p>{{ r.explanation }}</p>
              <button class="btn block" (click)="next()">
                {{ index() + 1 < questions().length ? 'Next question' : 'Finish chapter' }}
              </button>
            } @else {
              <strong>Not quite. Try another answer.</strong>
              <p>{{ r.explanation }}</p>
            }
          </div>
        }
      }
    } @else if (!loading()) {
      <h2>{{ title() }}</h2>
      <p class="sub">{{ cmQuestions().length }} questions. Answer them all, then press Check my answers.</p>
      @for (q of cmQuestions(); track q.id; let i = $index) {
        <div class="q">
          <p class="qhead"><span class="qno">{{ i + 1 }}</span></p>
          <p class="stem-small">{{ q.stem }}</p>
          <div class="options">
            @for (opt of q.options; track $index; let o = $index) {
              <button type="button" class="opt" [class.picked]="cmAnswers()[q.id] === letters[o]"
                      (click)="pick(q.id, letters[o])">
                <strong>{{ letters[o] }}.</strong> {{ opt }}
              </button>
            }
          </div>
        </div>
      }
      <div class="actions">
        <button type="button" class="go" (click)="check()" [disabled]="busy()">
          {{ busy() ? 'Checking...' : 'Check my answers' }}
        </button>
      </div>
    }

    @if (stage() === 'result' && cmResult(); as r) {
      <section class="card">
        <p class="score">{{ r.score }} / {{ r.total }} correct</p>
        @for (row of r.results; track row.id; let i = $index) {
          <div class="q" [class.right]="row.correct" [class.wrong]="!row.correct">
            <p class="qhead">
              <span class="qno">{{ i + 1 }}</span>
              <span class="mark">{{ row.correct ? '✓ Correct' : '✗ Not correct' }}</span>
            </p>
            <p class="stem-small">{{ cmQuestions()[i].stem }}</p>
            @if (!row.correct) {
              <p class="given">Right answer: <strong>{{ row.expected }}</strong></p>
            }
            @if (row.explanation) {
              <p class="why">{{ row.explanation }}</p>
            }
          </div>
        }
        <div class="actions">
          <button type="button" class="go" (click)="retry()">Try again</button>
          <a class="ghost" [routerLink]="base + '/' + subject() + '/quiz'">All chapters</a>
        </div>
      </section>
    }
  `,
  styles: [`
    .crumb, .sub, .count { color: var(--muted); font-size: 15px; margin: 0 0 8px; }
    .crumb a { color: var(--muted); }
    .error { color: var(--danger); }
    h2 { font-size: 24px; margin: 6px 0 12px; overflow-wrap: anywhere; }
    .bar-wrap { height: 8px; border-radius: 999px; background: var(--line); overflow: hidden; margin-bottom: 8px; }
    .bar { height: 100%; background: var(--brand); transition: width 0.3s ease; }
    .source { font-size: 13px; color: var(--brand); font-weight: 600; margin: 12px 0 4px; }
    .stem { margin: 0 0 14px; font-size: 22px; overflow-wrap: anywhere; }
    .stem-small { margin: 0 0 10px; font-size: 16px; overflow-wrap: anywhere; }
    .options { display: grid; gap: 10px; }
    .opt { display: flex; gap: 12px; align-items: center; text-align: left; min-height: 52px; padding: 12px 14px; border-radius: 14px; border: 2px solid var(--line); background: var(--card); color: var(--ink); font: inherit; font-size: 16px; cursor: pointer; overflow-wrap: anywhere; min-width: 0; }
    .opt:disabled { cursor: default; opacity: 0.85; }
    .opt:not(:disabled):hover { border-color: var(--brand); }
    .opt.picked { border-color: var(--brand); box-shadow: inset 0 0 0 1px var(--brand); }
    .opt.right { border-color: var(--ok); background: var(--ok-bg); }
    .opt.wrong { border-color: var(--danger); background: var(--danger-bg); }
    .letter { font-weight: 800; min-width: 26px; color: var(--brand); }
    .feedback { margin-top: 16px; padding: 14px 16px; border-radius: 16px; display: grid; gap: 8px; }
    .feedback.good { background: var(--ok-bg); color: var(--ink); }
    .feedback.bad { background: var(--danger-bg); color: var(--ink); }
    .feedback p { margin: 0; overflow-wrap: anywhere; }
    .btn { display: inline-block; text-align: center; margin-top: 8px; padding: 12px 16px; border-radius: 14px; background: var(--brand); color: var(--brand-text); font-weight: 700; text-decoration: none; min-height: 46px; border: 0; font: inherit; }
    .btn.block { width: 100%; box-sizing: border-box; }
    .btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }
    .done { text-align: center; display: grid; gap: 10px; }
    .trophy { font-size: 56px; }
    .q { border-top: 1px solid var(--line); padding: 14px 0; min-width: 0; }
    .q:first-child { border-top: 0; padding-top: 0; }
    .qhead { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 13px; }
    .qno { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--page); border: 1px solid var(--line); font-weight: 700; }
    .mark { color: var(--muted); }
    .q.right .mark { color: var(--ok); }
    .q.wrong .mark { color: var(--danger); }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
    .go { padding: 12px 20px; border-radius: 14px; border: 0; background: var(--brand); color: var(--brand-text); font: inherit; font-weight: 700; min-height: 46px; }
    .go:disabled { opacity: 0.6; }
    .ghost { padding: 12px 16px; border-radius: 14px; border: 1px solid var(--line); background: transparent; color: var(--ink); font: inherit; min-height: 46px; display: inline-flex; align-items: center; text-decoration: none; }
    .score { font-size: 24px; font-weight: 700; margin: 0 0 8px; }
    .given { margin: 2px 0; font-size: 14px; }
    .why { margin: 6px 0 0; color: var(--muted); font-size: 14px; overflow-wrap: anywhere; }
  `],
})
export class StudyHubQuizPlay {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly tenants = inject(TenantService);
  readonly base = `/${this.tenants.slug()}/learning/study-hub`;
  readonly letters = LETTERS;

  readonly subject = signal<string>('wm');
  readonly chapter = signal(1);
  readonly title = signal('Quiz');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');

  // Wren & Martin state
  readonly questions = signal<(HubWmQuestion & { done?: boolean })[]>([]);
  readonly index = signal(0);
  readonly selected = signal<number | null>(null);
  readonly result = signal<{ correct: boolean; explanation: string } | null>(null);
  readonly alreadyDone = signal(false);
  readonly current = computed(() => this.questions()[this.index()] ?? null);
  readonly finished = computed(() => this.questions().length > 0 && this.index() >= this.questions().length);
  readonly answeredCount = computed(() => this.questions().filter((q) => q.done).length);

  // Cambridge Maths state
  readonly cmQuestions = signal<HubCmQuizQuestion[]>([]);
  readonly cmAnswers = signal<Record<string, string>>({});
  readonly cmResult = signal<HubTestResult | null>(null);
  readonly stage = signal<'quiz' | 'result'>('quiz');

  constructor() {
    this.route.paramMap.subscribe((p) => {
      this.subject.set(p.get('subject') ?? 'wm');
      this.chapter.set(Number(p.get('chapter')));
      this.load();
    });
  }

  isWm() {
    return this.subject() !== 'cm';
  }

  private async load() {
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);
    try {
      if (this.isWm()) {
        const res = await this.api.hubWmQuestions(this.chapter());
        this.questions.set(res.questions);
        this.index.set(0);
        this.selected.set(null);
      } else {
        const res = await this.api.hubCmQuiz(this.chapter());
        this.title.set(res.title);
        this.cmQuestions.set(res.questions);
        this.cmAnswers.set({});
        this.cmResult.set(null);
        this.stage.set('quiz');
      }
    } catch {
      this.error.set('Could not load this quiz. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  async choose(i: number) {
    const q = this.current();
    if (!q || this.busy()) return;
    this.busy.set(true);
    this.selected.set(i);
    this.alreadyDone.set(!!q.done);
    try {
      const r = await this.api.hubWmAnswer(this.chapter(), q.id, i);
      this.result.set(r);
      if (r.correct) {
        this.questions.update((list) => list.map((x) => (x.id === q.id ? { ...x, done: true } : x)));
      }
    } catch {
      this.error.set('Something went wrong. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  next() {
    this.index.update((n) => n + 1);
    this.selected.set(null);
    this.result.set(null);
  }

  pick(id: string, letter: string) {
    this.cmAnswers.set({ ...this.cmAnswers(), [id]: letter });
  }

  async check() {
    this.busy.set(true);
    this.error.set('');
    const payload = this.cmQuestions().map((q) => ({ id: q.id, answer: this.cmAnswers()[q.id] ?? '' }));
    try {
      this.cmResult.set(await this.api.hubGradeTest('cm', payload));
      this.stage.set('result');
      window.scrollTo({ top: 0 });
    } catch {
      this.error.set('Could not check the quiz. Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  retry() {
    this.load();
  }
}

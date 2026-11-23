import { Component, OnChanges, inject, signal } from '@angular/core';
import { TenantService } from '../core/tenant.service';
import { learnBase } from './base';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StudyHubApi } from './api';
import { CmQuizQuestion, WmTestResult } from './models';

// Cambridge Stage 8: one chapter's quiz. Answer every question, then check. Nothing is saved.
@Component({
  selector: 'app-cm-quiz-play',
  standalone: true,
  imports: [RouterLink],
  template: `
    <p class="crumb"><a [routerLink]="hub + '/cambridge/quiz'">🎯 Quiz</a> &middot; Chapter {{ chapter }}</p>
    <h1>{{ title() }}</h1>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (loading()) {
      <p class="sub">Loading the quiz...</p>
    } @else if (stage() === 'quiz') {
      <p class="sub">{{ questions().length }} questions. Answer them all, then press Check my answers.</p>
      @for (q of questions(); track q.id; let i = $index) {
        <div class="q">
          <p class="qhead"><span class="qno">{{ i + 1 }}</span></p>
          <p class="stem">{{ q.stem }}</p>
          <div class="options">
            @for (opt of q.options; track $index; let o = $index) {
              <button type="button" class="opt" [class.picked]="answers()[q.id] === letters[o]"
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

    @if (stage() === 'result' && result(); as r) {
      <section class="card">
        <p class="score">{{ r.score }} / {{ r.total }} correct</p>
        @for (row of r.results; track row.id; let i = $index) {
          <div class="q" [class.right]="row.correct" [class.wrong]="!row.correct">
            <p class="qhead">
              <span class="qno">{{ i + 1 }}</span>
              <span class="mark">{{ row.correct ? '✓ Correct' : '✗ Not correct' }}</span>
            </p>
            <p class="stem">{{ questions()[i].stem }}</p>
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
          <a class="ghost" [routerLink]="hub + '/cambridge/quiz'">All chapters</a>
        </div>
      </section>
    }
  `,
  styles: [`
    .crumb, .sub { color: var(--muted); font-size: 15px; }
    .crumb a { color: var(--muted); }
    h1 { font-family: var(--display); font-size: 28px; margin: 6px 0 12px; overflow-wrap: anywhere; }
    .error { color: var(--retry); }
    .card { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }
    .q { border-top: 1px solid var(--line); padding: 14px 0; min-width: 0; }
    .q:first-child { border-top: 0; padding-top: 0; }
    .qhead { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; flex-wrap: wrap; font-size: 13px; }
    .qno { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--bg); border: 1px solid var(--line); font-weight: 700; }
    .mark { color: var(--muted); }
    .stem { margin: 0 0 10px; font-size: 16px; overflow-wrap: anywhere; }
    .options { display: grid; gap: 8px; }
    .opt { text-align: left; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); font: inherit; min-height: 44px; overflow-wrap: anywhere; }
    .opt.picked { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .go { margin-top: 18px; padding: 12px 20px; border-radius: 14px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 700; min-height: 46px; }
    .go:disabled { opacity: 0.6; }
    .ghost { margin-top: 18px; padding: 12px 16px; border-radius: 14px; border: 1px solid var(--line); background: transparent; color: var(--fg); font: inherit; min-height: 46px; display: inline-flex; align-items: center; text-decoration: none; }
    .score { font-family: var(--display); font-size: 26px; margin: 0 0 8px; }
    .q.right .mark { color: var(--correct); }
    .q.wrong .mark { color: var(--retry); }
    .given { margin: 2px 0; font-size: 14px; }
    .why { margin: 6px 0 0; color: var(--muted); font-size: 14px; overflow-wrap: anywhere; }
  `],
})
export class CmQuizPlayPage implements OnChanges {
  readonly learn = learnBase(inject(TenantService));
  readonly hub = this.learn + '/study-hub';
  chapter = '';
  private api = inject(StudyHubApi);

  readonly letters = 'ABCD';
  title = signal('Quiz');
  questions = signal<CmQuizQuestion[]>([]);
  answers = signal<Record<string, string>>({});
  result = signal<WmTestResult | null>(null);
  stage = signal<'quiz' | 'result'>('quiz');
  loading = signal(true);
  busy = signal(false);
  error = signal('');

  constructor() {
    // The chapter number is in the address. Read it when the page opens, and again when it changes.
    inject(ActivatedRoute).paramMap.subscribe((p) => {
      this.chapter = p.get('chapter') ?? '';
      this.ngOnChanges();
    });
  }

  ngOnChanges() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set('');
    this.api.cmQuiz(Number(this.chapter)).subscribe({
      next: (res) => {
        this.title.set(res.title);
        this.questions.set(res.questions);
        this.answers.set({});
        this.result.set(null);
        this.stage.set('quiz');
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load this quiz. Please try again.');
        this.loading.set(false);
      },
    });
  }

  pick(id: string, letter: string) {
    this.answers.set({ ...this.answers(), [id]: letter });
  }

  check() {
    this.busy.set(true);
    this.error.set('');
    const payload = this.questions().map((q) => ({ id: q.id, answer: this.answers()[q.id] ?? '' }));
    this.api.cmGradeTest(payload).subscribe({
      next: (res) => {
        this.result.set(res);
        this.stage.set('result');
        this.busy.set(false);
        window.scrollTo({ top: 0 });
      },
      error: () => {
        this.error.set('Could not check the quiz. Try again.');
        this.busy.set(false);
      },
    });
  }

  retry() {
    this.load();
  }
}

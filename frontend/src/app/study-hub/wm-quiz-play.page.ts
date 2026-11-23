import { Component, OnChanges, inject, signal, computed } from '@angular/core';
import { TenantService } from '../core/tenant.service';
import { learnBase } from './base';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StudyHubApi } from './api';
import { PlayerService } from './player';
import { WmAnswerResult, WmQuestion } from './models';

const LETTERS = ['A', 'B', 'C', 'D'];

@Component({
  selector: 'app-wm-quiz-play',
  standalone: true,
  imports: [RouterLink],
  template: `
    <p class="crumb"><a [routerLink]="hub + '/wren-martin/quiz'">🎯 Quiz</a> &middot; Chapter {{ chapter }}</p>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else if (!code()) {
      <p class="hint">Start your wizard on <a [routerLink]="learn + '/vocabulary'">Word Wizard</a> first, so your points are saved.</p>
    } @else if (loading()) {
      <p class="sub">Shuffling the questions...</p>
    } @else if (finished()) {
      <section class="card done">
        <div class="trophy" aria-hidden="true">🎉</div>
        <h1>Chapter {{ chapter }} complete</h1>
        <p>You have answered {{ answeredCount() }} of {{ questions().length }} questions.</p>
        <a class="btn block" [routerLink]="hub + '/wren-martin/quiz'">Pick another chapter</a>
        <a class="btn ghost block" [routerLink]="[hub + '/wren-martin/learn', chapter]">Read the chapter notes</a>
      </section>
    } @else if (current()) {
      @let q = current()!;
      <div class="progress" aria-label="Progress">
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
      <h1 class="stem">{{ q.stem }}</h1>

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
            <strong>{{ r.already_answered ? 'Already answered' : (r.first_try ? 'Correct! 🌟' : 'Correct!') }}</strong>
            @if (!r.already_answered && r.points_awarded > 0) {
              <span class="reward">+{{ r.points_awarded }} points · +{{ r.candies_awarded }} 🍬</span>
            }
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
  `,
  styles: [`
    .crumb, .sub, .hint, .count { color: var(--muted); font-size: 15px; margin: 0 0 8px; }
    .crumb a { color: var(--muted); }
    .progress { height: 8px; border-radius: 999px; background: var(--line); overflow: hidden; margin-bottom: 8px; }
    .bar { height: 100%; background: var(--accent); transition: width 0.3s ease; }
    .source { font-size: 13px; color: var(--accent); font-weight: 600; margin: 12px 0 4px; }
    .stem { font-family: var(--display); font-size: 24px; margin: 0 0 14px; }
    .options { display: grid; gap: 10px; }
    .opt { display: flex; gap: 12px; align-items: center; text-align: left; min-height: 56px; padding: 12px 14px; border-radius: 14px; border: 2px solid var(--line); background: var(--surface); color: var(--fg); font: inherit; font-size: 16px; cursor: pointer; }
    .opt:disabled { cursor: default; opacity: 0.85; }
    .opt:not(:disabled):hover { border-color: var(--accent); }
    .opt.right { border-color: var(--correct); background: var(--correct-bg); }
    .opt.wrong { border-color: var(--retry); background: var(--retry-bg); }
    .letter { font-family: var(--display); font-weight: 800; min-width: 26px; color: var(--accent); }
    .feedback { margin-top: 16px; padding: 14px 16px; border-radius: 16px; display: grid; gap: 8px; }
    .feedback.good { background: var(--correct-bg); color: var(--fg); }
    .feedback.bad { background: var(--retry-bg); color: var(--fg); }
    .feedback p { margin: 0; }
    .reward { color: var(--correct); font-weight: 700; }
    .btn.block { width: 100%; }
    .btn.ghost { margin-top: 8px; }
    .done { text-align: center; display: grid; gap: 10px; }
    .done h1 { font-family: var(--display); font-size: 28px; margin: 0; }
    .trophy { font-size: 56px; }
    .error { color: var(--retry); }
  `],
})
export class WmQuizPlayPage implements OnChanges {
  readonly learn = learnBase(inject(TenantService));
  readonly hub = this.learn + '/study-hub';
  chapter = '';
  private api = inject(StudyHubApi);
  private player = inject(PlayerService);
  letters = LETTERS;
  questions = signal<WmQuestion[]>([]);
  index = signal(0);
  selected = signal<number | null>(null);
  result = signal<WmAnswerResult | null>(null);
  busy = signal(false);
  loading = signal(true);
  error = signal('');
  code = computed(() => this.player.profile()?.code ?? this.player.savedCode());
  current = computed(() => this.questions()[this.index()] ?? null);
  finished = computed(() => this.questions().length > 0 && this.index() >= this.questions().length);
  answeredCount = computed(() => this.questions().filter((q) => q.done).length);

  constructor() {
    // The chapter number is in the address. Read it when the page opens, and again when it changes.
    inject(ActivatedRoute).paramMap.subscribe((p) => {
      this.chapter = p.get('chapter') ?? '';
      this.ngOnChanges();
    });
  }

  ngOnChanges() {
    const code = this.code();
    const chapter = Number(this.chapter);
    if (!code) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.wmQuestions(code, chapter).subscribe({
      next: (r) => {
        this.questions.set(r.questions);
        // Start at the first question not yet answered, so a child can resume.
        const firstOpen = r.questions.findIndex((q) => !q.done);
        this.index.set(firstOpen === -1 ? 0 : firstOpen);
        this.selected.set(null);
        this.result.set(null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load this chapter. Please try again.');
        this.loading.set(false);
      },
    });
  }

  choose(i: number) {
    const code = this.code();
    const q = this.current();
    if (!code || !q || this.busy()) return;
    this.busy.set(true);
    this.selected.set(i);
    this.api.wmAnswer(code, Number(this.chapter), q.id, i).subscribe({
      next: (r) => {
        this.result.set(r);
        if (r.correct) {
          this.questions.update((list) => list.map((x) => (x.id === q.id ? { ...x, done: true } : x)));
        }
        const profile = this.player.profile();
        if (profile) {
          this.player.update({ ...profile, points: r.points, candies: r.candies, streak: r.streak });
        }
        this.busy.set(false);
      },
      error: () => {
        this.error.set('Something went wrong. Please try again.');
        this.busy.set(false);
      },
    });
  }

  next() {
    this.index.update((n) => n + 1);
    this.selected.set(null);
    this.result.set(null);
  }
}

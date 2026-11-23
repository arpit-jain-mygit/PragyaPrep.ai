import { Component, OnInit, inject, signal } from '@angular/core';
import { StudyHubApi } from './api';
import { WmChapter, WmTestItem, WmTestResult } from './models';

// Student-made test: pick chapters and question types, take the test, then see the marks.
// Nothing is saved. Setup -> test -> result, all on this page.
type Stage = 'setup' | 'test' | 'result';

const FORMAT_NAMES: Record<string, string> = {
  A: 'Multiple choice',
  B: 'Fill in the blank',
  C: 'True or false',
  D: 'Write the answer',
};

@Component({
  selector: 'app-wm-test',
  standalone: true,
  template: `
    <h1>✍️ Create a test</h1>
    <p class="sub">Pick the chapters and question types you want. Then take the test and see your marks.</p>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (stage() === 'setup') {
      <section class="card">
        <h2>1. Chapters</h2>
        @if (loading()) {
          <p class="sub">Loading the chapters...</p>
        } @else {
          <label class="check all">
            <input type="checkbox" [checked]="allChapters()" (change)="toggleAll($event)" />
            <span>All chapters</span>
          </label>
          <div class="grid">
            @for (ch of chapters(); track ch.chapter) {
              <label class="check">
                <input type="checkbox" [checked]="picked().has(ch.chapter)" (change)="toggleChapter(ch.chapter)" />
                <span>Ch {{ ch.chapter }}: {{ ch.title }}</span>
              </label>
            }
          </div>
        }

        <h2>2. Question types</h2>
        <div class="grid">
          @for (fmt of formatKeys; track fmt) {
            <label class="check">
              <input type="checkbox" [checked]="formats().has(fmt)" (change)="toggleFormat(fmt)" />
              <span>{{ fmt }}. {{ formatName(fmt) }}</span>
            </label>
          }
        </div>

        <h2>3. How many questions</h2>
        <div class="counts" role="radiogroup" aria-label="Number of questions">
          @for (n of counts; track n) {
            <button type="button" class="pill" role="radio" [attr.aria-checked]="count() === n"
                    [class.on]="count() === n" (click)="count.set(n)">{{ n }}</button>
          }
        </div>

        <button type="button" class="go" (click)="start()" [disabled]="busy()">
          {{ busy() ? 'Making your test...' : 'Start test' }}
        </button>
      </section>
    }

    @if (stage() === 'test') {
      <section class="card">
        <p class="sub">{{ items().length }} questions. Answer them all, then press Check my test.</p>
        @for (item of items(); track item.id; let i = $index) {
          <div class="q">
            <p class="qhead"><span class="qno">{{ i + 1 }}</span> <span class="tag">Ch {{ item.chapter }} · {{ formatName(item.format) }}</span></p>
            <p class="stem">{{ item.stem }}</p>

            @if (item.format === 'A') {
              <div class="options">
                @for (opt of item.options; track $index; let o = $index) {
                  <button type="button" class="opt" [class.picked]="answers()[item.id] === letters[o]"
                          (click)="setAnswer(item.id, letters[o])">
                    <strong>{{ letters[o] }}.</strong> {{ opt }}
                  </button>
                }
              </div>
            } @else if (item.format === 'C') {
              <div class="options tf">
                @for (value of ['True', 'False']; track value) {
                  <button type="button" class="opt" [class.picked]="answers()[item.id] === value"
                          (click)="setAnswer(item.id, value)">{{ value }}</button>
                }
              </div>
            } @else {
              <input class="answer" type="text" autocomplete="off" placeholder="Type your answer"
                     [attr.aria-label]="'Answer for question ' + (i + 1)"
                     [value]="answers()[item.id] || ''"
                     (input)="setAnswer(item.id, $any($event.target).value)" />
            }
          </div>
        }

        <div class="actions">
          <button type="button" class="go" (click)="check()" [disabled]="busy()">
            {{ busy() ? 'Checking...' : 'Check my test' }}
          </button>
          <button type="button" class="ghost" (click)="backToSetup()">Cancel</button>
        </div>
      </section>
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
            <p class="stem">{{ items()[i].stem }}</p>
            <p class="given">Your answer: <strong>{{ answers()[row.id] || '(no answer)' }}</strong></p>
            @if (!row.correct) {
              <p class="given">Right answer: <strong>{{ row.expected }}</strong></p>
            }
            @if (row.explanation) {
              <p class="why">{{ row.explanation }}</p>
            }
          </div>
        }
        <div class="actions">
          <button type="button" class="go" (click)="backToSetup()">Make another test</button>
        </div>
      </section>
    }
  `,
  styles: [`
    h1 { font-family: var(--display); font-size: 30px; margin: 8px 0 4px; }
    h2 { font-size: 16px; margin: 18px 0 8px; }
    .sub { color: var(--muted); margin: 0 0 16px; }
    .error { color: var(--retry); }
    .card { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; min-width: 0; }
    .check { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 12px; border: 1px solid var(--line); min-width: 0; }
    .check span { min-width: 0; overflow-wrap: anywhere; }
    .check.all { margin-bottom: 8px; font-weight: 600; }
    .counts { display: flex; gap: 8px; }
    .pill { padding: 8px 16px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); min-height: 44px; font: inherit; }
    .pill.on { border-color: var(--accent); background: var(--accent); color: #fff; }
    .go { margin-top: 18px; padding: 12px 20px; border-radius: 14px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 700; min-height: 46px; }
    .go:disabled { opacity: 0.6; }
    .ghost { margin-top: 18px; padding: 12px 16px; border-radius: 14px; border: 1px solid var(--line); background: transparent; color: var(--fg); font: inherit; min-height: 46px; }
    .q { border-top: 1px solid var(--line); padding: 14px 0; min-width: 0; }
    .q:first-child { border-top: 0; padding-top: 0; }
    .qhead { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; flex-wrap: wrap; font-size: 13px; }
    .qno { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--bg); border: 1px solid var(--line); font-weight: 700; }
    .tag, .mark { color: var(--muted); }
    .stem { margin: 0 0 10px; font-size: 16px; overflow-wrap: anywhere; }
    .options { display: grid; gap: 8px; }
    .options.tf { grid-template-columns: 1fr 1fr; }
    .opt { text-align: left; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); font: inherit; min-height: 44px; overflow-wrap: anywhere; }
    .opt.picked { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
    .answer { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); font: inherit; min-height: 44px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .score { font-family: var(--display); font-size: 26px; margin: 0 0 8px; }
    .q.right .mark { color: var(--correct); }
    .q.wrong .mark { color: var(--retry); }
    .given { margin: 2px 0; font-size: 14px; }
    .why { margin: 6px 0 0; color: var(--muted); font-size: 14px; overflow-wrap: anywhere; }
    @media (max-width: 480px) { .grid, .options.tf { grid-template-columns: 1fr; } }
  `],
})
export class WmTestPage implements OnInit {
  private api = inject(StudyHubApi);

  readonly letters = 'ABCD';
  readonly formatKeys = ['A', 'B', 'C', 'D'];
  readonly counts = [5, 10, 20];

  chapters = signal<WmChapter[]>([]);
  picked = signal<Set<number>>(new Set());
  formats = signal<Set<string>>(new Set(['A', 'B', 'C', 'D']));
  count = signal(10);

  stage = signal<Stage>('setup');
  items = signal<WmTestItem[]>([]);
  answers = signal<Record<string, string>>({});
  result = signal<WmTestResult | null>(null);

  loading = signal(true);
  busy = signal(false);
  error = signal('');

  ngOnInit(): void {
    this.api.wmChapters().subscribe({
      next: (res) => {
        this.chapters.set(res.chapters);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load the chapters. Try again in a moment.');
        this.loading.set(false);
      },
    });
  }

  formatName(fmt: string): string {
    return FORMAT_NAMES[fmt] ?? fmt;
  }

  allChapters(): boolean {
    return this.chapters().length > 0 && this.picked().size === this.chapters().length;
  }

  toggleAll(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.picked.set(on ? new Set(this.chapters().map((c) => c.chapter)) : new Set());
  }

  toggleChapter(chapter: number): void {
    const next = new Set(this.picked());
    next.has(chapter) ? next.delete(chapter) : next.add(chapter);
    this.picked.set(next);
  }

  toggleFormat(fmt: string): void {
    const next = new Set(this.formats());
    next.has(fmt) ? next.delete(fmt) : next.add(fmt);
    this.formats.set(next);
  }

  start(): void {
    this.error.set('');
    if (this.picked().size === 0) {
      this.error.set('Pick at least one chapter, or choose All chapters.');
      return;
    }
    if (this.formats().size === 0) {
      this.error.set('Pick at least one question type.');
      return;
    }
    // "All chapters" sends an empty list so the server uses every chapter.
    const chapters = this.allChapters() ? [] : [...this.picked()].sort((a, b) => a - b);
    const formats = this.formatKeys.filter((f) => this.formats().has(f));
    this.busy.set(true);
    this.api.wmBuildTest(chapters, formats, this.count()).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.answers.set({});
        this.result.set(null);
        this.stage.set('test');
        this.busy.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Could not make a test. Try different choices.');
        this.busy.set(false);
      },
    });
  }

  setAnswer(id: string, value: string): void {
    this.answers.set({ ...this.answers(), [id]: value });
  }

  check(): void {
    this.busy.set(true);
    const payload = this.items().map((item) => ({ id: item.id, answer: this.answers()[item.id] ?? '' }));
    this.api.wmGradeTest(payload).subscribe({
      next: (res) => {
        this.result.set(res);
        this.stage.set('result');
        this.busy.set(false);
        window.scrollTo({ top: 0 });
      },
      error: () => {
        this.error.set('Could not check the test. Try again.');
        this.busy.set(false);
      },
    });
  }

  backToSetup(): void {
    this.error.set('');
    this.stage.set('setup');
  }
}

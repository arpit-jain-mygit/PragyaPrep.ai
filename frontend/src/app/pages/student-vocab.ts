import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { ApiService } from '../core/api.service';
import { ApiError, VocabMarked, VocabPack, VocabQuestion } from '../core/models';

const HEADINGS: Record<'vocabulary' | 'idioms', { heading: string; hint: string; test: string; item: string }> = {
  vocabulary: { heading: 'Vocabulary', hint: "Today's pack of words. Learn them, then take the short test.", test: "Today's vocabulary test", item: 'word' },
  idioms: { heading: 'Idioms', hint: "Today's pack of idioms. Learn what each one means, then take the short test.", test: "Today's idioms test", item: 'idiom' },
};

/**
 * Vocabulary and Idioms: today's pack, a calendar of the days around it, and today's test. The test is marked on the server,
 * and each word's right meaning is shown after the test.
 */
@Component({
  selector: 'app-student-vocab',
  imports: [DatePipe],
  template: `
    <div class="page-head"><h1>{{ heading() }}</h1></div>
    <p class="hint">{{ hint() }}</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="vocab-error">{{ problem.detail }}</div> }
    @if (pack(); as p) {
      @if (p.today) {
        <ol class="vocab-calendar" id="vocab-calendar" aria-label="Packs this week">
          @for (day of p.days; track day.date) {
            <li class="card day-tile" [class.today]="isToday(day.date)" [attr.data-date]="day.date">
              <span class="muted small">{{ day.date | date: 'EEE d MMM' }}</span>
              <strong>Pack {{ day.pack }}</strong>
            </li>
          }
        </ol>

        <section class="card" id="vocab-today">
          <h2>Pack {{ p.today.pack }} of {{ p.packs }}</h2>
          <ul class="plain-list">
            @for (entry of p.today.items; track entry.word) {
              <li class="vocab-entry" [attr.data-word]="entry.word">
                <strong>{{ entry.word }}</strong> {{ entry.meaning }}
                @if (entry.example) { <div class="muted small"><em>{{ entry.example }}</em></div> }
              </li>
            }
          </ul>
        </section>

        <section class="card" id="vocab-test">
          <h2>{{ testTitle() }}</h2>
          @if (!questions()) {
            <button class="btn" type="button" id="vocab-start" [disabled]="busy()" (click)="start()">Start the test</button>
          } @else if (!marked()) {
            <ol class="vocab-questions">
              @for (item of questions()!; track item.word; let i = $index) {
                <li class="question" [attr.data-word]="item.word">
                  <p>What does <strong>{{ item.word }}</strong> mean?</p>
                  @for (option of item.options; track option; let j = $index) {
                    <label class="choice"><input type="radio" [name]="'q' + i" [value]="j" [checked]="chosen()[i] === j" (change)="choose(i, j)" /> {{ option }}</label>
                  }
                </li>
              }
            </ol>
            <button class="btn" type="button" id="vocab-submit" [disabled]="busy()" (click)="submit()">Submit the test</button>
          } @else {
            <p class="alert ok" id="vocab-score" role="status">You got {{ marked()!.score }} of {{ marked()!.total }} right.</p>
            <ul class="plain-list">
              @for (row of marked()!.results; track row.word) {
                <li [attr.data-word]="row.word" [class.right]="row.right" [class.wrong]="!row.right">
                  <strong>{{ row.word }}</strong>: {{ row.meaning }} {{ row.right ? '✓' : '✗' }}
                </li>
              }
            </ul>
          }
        </section>
      } @else {
        <p class="muted" id="vocab-empty">No {{ itemPlural() }} have been added yet.</p>
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
  styles: `
    .vocab-calendar { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); gap: 0.5rem; margin: 0 0 1rem; }
    .day-tile { display: flex; flex-direction: column; gap: 0.25rem; }
    .day-tile.today { border-color: var(--brand); }
    .choice { display: block; margin: 0.25rem 0; }
    .right { color: var(--ok); }
    .wrong { color: var(--danger); }
  `,
})
export class StudentVocab implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly kind: 'vocabulary' | 'idioms' = this.route.snapshot.data?.['kind'] === 'idioms' ? 'idioms' : 'vocabulary';
  readonly heading = computed(() => HEADINGS[this.kind].heading);
  readonly hint = computed(() => HEADINGS[this.kind].hint);
  readonly testTitle = computed(() => HEADINGS[this.kind].test);
  readonly itemPlural = computed(() => (this.kind === 'idioms' ? 'idioms' : 'words'));

  readonly pack = signal<VocabPack | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly questions = signal<VocabQuestion[] | null>(null);
  readonly chosen = signal<(number | null)[]>([]);
  readonly marked = signal<VocabMarked | null>(null);
  readonly busy = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.pack.set(await this.api.myVocab(this.kind));
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  /** The calendar marks today: the middle of the seven days the server sends. */
  isToday(day: string): boolean {
    return day === this.pack()?.days[3]?.date;
  }

  async start(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const made = await this.api.vocabTest(this.kind);
      this.questions.set(made.questions);
      this.chosen.set(made.questions.map(() => null));
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  choose(question: number, option: number): void {
    this.chosen.set(this.chosen().map((value, index) => (index === question ? option : value)));
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.marked.set(await this.api.vocabMark(this.kind, this.chosen()));
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }
}

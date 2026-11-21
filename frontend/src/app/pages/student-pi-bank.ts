import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, PiBankView, PiQuestion } from '../core/models';

/**
 * PI question bank for the student. Two views of the same questions: a list, or one flashcard at a time with the hint
 * hidden until asked for. Filter by topic and subtopic. Questions not yet done come first; done ones sink to the bottom.
 */
@Component({
  selector: 'app-student-pi-bank',
  template: `
    <div class="page-head"><h1>PI Question Bank</h1></div>
    <p class="hint">Practise personal interview questions, by topic and subtopic. New questions come first; done ones sink to the bottom.</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="pi-error">{{ problem.detail }}</div> }

    @if (view(); as bank) {
      <div class="toolbar">
        <div class="tabs" role="group" aria-label="How to look at the questions">
          <button type="button" class="tab" id="view-list" [attr.aria-pressed]="mode() === 'list'" (click)="mode.set('list')">List</button>
          <button type="button" class="tab" id="view-flashcard" [attr.aria-pressed]="mode() === 'flashcard'" (click)="mode.set('flashcard')">Flashcard</button>
        </div>
      </div>

      <div class="filters">
        <label>Topic
          <select id="topic-filter" [value]="topic()" (change)="chooseTopic(read($event))">
            <option value="">All</option>
            @for (group of bank.topics; track group.name) { <option [value]="group.name">{{ group.name }}</option> }
          </select>
        </label>
        <label>Subtopic
          <select id="subtopic-filter" [value]="subtopic()" (change)="subtopic.set(read($event))">
            <option value="">All</option>
            @for (name of subtopics(); track name) { <option [value]="name">{{ name }}</option> }
          </select>
        </label>
      </div>

      <p class="muted small" id="pi-counts">{{ bank.counts.new }} new · {{ bank.counts.done }} done · {{ bank.counts.total }} total</p>

      @if (!shown().length) {
        <p class="muted" id="pi-empty">{{ bank.questions.length ? 'No questions match these filters.' : 'No questions yet. Your institute will add them here.' }}</p>
      } @else if (mode() === 'list') {
        <ol class="question-list" id="pi-list">
          @for (row of shown(); track row.id) {
            <li class="card question-row" [attr.data-question]="row.id" [class.done]="row.done">
              <span class="question-text">
                <span class="muted small">{{ row.topic }} · {{ row.subtopic }}</span>
                <span>{{ row.question }}</span>
                @if (row.hint) { <span class="muted small">Hint: {{ row.hint }}</span> }
              </span>
              <button type="button" class="btn small" [attr.aria-label]="(row.done ? 'Undo done: ' : 'Mark done: ') + row.question" (click)="toggle(row)">{{ row.done ? 'Undo' : 'Mark done' }}</button>
            </li>
          }
        </ol>
      } @else {
        @let card = current();
        @if (card) {
          <section class="card flashcard" id="pi-card" [attr.data-question]="card.id">
            <p class="muted small">{{ card.topic }} · {{ card.subtopic }}</p>
            <p class="flash-question" id="flash-question">{{ card.question }}</p>
            @if (showHint() && card.hint) {
              <p class="hint" id="flash-hint">{{ card.hint }}</p>
            }
            <div class="row-actions">
              @if (card.hint) { <button type="button" class="btn ghost" id="show-hint" (click)="showHint.set(!showHint())">{{ showHint() ? 'Hide hint' : 'Show hint' }}</button> }
              <button type="button" class="btn small" id="flash-done" (click)="toggle(card)">{{ card.done ? 'Undo' : 'Mark done' }}</button>
            </div>
          </section>
          <div class="row-actions">
            <button type="button" class="btn ghost" id="prev-card" [disabled]="index() === 0" (click)="go(-1)">Previous</button>
            <span class="muted small" id="card-position">{{ index() + 1 }} of {{ shown().length }}</span>
            <button type="button" class="btn ghost" id="next-card" [disabled]="index() >= shown().length - 1" (click)="go(1)">Next</button>
          </div>
        }
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class StudentPiBank implements OnInit {
  private readonly api = inject(ApiService);

  readonly view = signal<PiBankView | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly mode = signal<'list' | 'flashcard'>('list');
  readonly topic = signal('');
  readonly subtopic = signal('');
  readonly index = signal(0);
  readonly showHint = signal(false);

  /** The subtopics of the topic chosen, if any. */
  readonly subtopics = computed(() => {
    const bank = this.view();
    const group = bank?.topics.find((item) => item.name === this.topic());
    return group ? group.subtopics : bank?.topics.flatMap((item) => item.subtopics) ?? [];
  });

  /** The questions after the filters, in list order. */
  readonly shown = computed<PiQuestion[]>(() => {
    const bank = this.view();
    if (!bank) return [];
    return bank.questions.filter(
      (row) => (!this.topic() || row.topic === this.topic()) && (!this.subtopic() || row.subtopic === this.subtopic()),
    );
  });

  /** The card on show in flashcard view, kept inside the list when the filters change. */
  readonly current = computed<PiQuestion | null>(() => {
    const rows = this.shown();
    if (!rows.length) return null;
    return rows[Math.min(this.index(), rows.length - 1)];
  });

  async ngOnInit(): Promise<void> {
    try {
      this.view.set(await this.api.piBank());
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  chooseTopic(name: string): void {
    this.topic.set(name);
    this.subtopic.set('');
    this.index.set(0);
    this.showHint.set(false);
  }

  go(step: number): void {
    this.index.set(Math.max(0, Math.min(this.shown().length - 1, this.index() + step)));
    this.showHint.set(false);
  }

  /** Mark a question done, or undo it, then move it to its place in the list. */
  async toggle(row: PiQuestion): Promise<void> {
    this.error.set(null);
    try {
      if (row.done) {
        await this.api.unmarkPiDone(row.id);
      } else {
        await this.api.markPiDone(row.id);
      }
      this.view.set(withDone(this.view()!, row.id, !row.done));
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  read(event: Event): string {
    return (event.target as HTMLSelectElement | HTMLInputElement).value;
  }
}

/** The bank with one question's done mark changed. Done questions sink to the bottom, and the counts are worked out again. */
export function withDone(bank: PiBankView, id: string, done: boolean): PiBankView {
  const questions = bank.questions.map((row) => (row.id === id ? { ...row, done } : row));
  questions.sort((a, b) => Number(a.done) - Number(b.done));
  const doneCount = questions.filter((row) => row.done).length;
  return { ...bank, questions, counts: { done: doneCount, new: questions.length - doneCount, total: questions.length } };
}

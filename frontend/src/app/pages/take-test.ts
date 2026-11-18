import { Component, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ApiError, AttemptQuestion, AttemptResult, AttemptView } from '../core/models';
import { Icon } from '../ui/icon';
import { Lightbox } from '../ui/lightbox';
import { Modal } from '../ui/modal';

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * A test being taken: a countdown, one question at a time with a numbered palette, answers saved as the student goes,
 * and Submit. The server decides when time is up; this screen only shows the clock and hands in at zero.
 */
@Component({
  selector: 'app-take-test',
  imports: [FormsModule, Icon, Lightbox, Modal],
  template: `
    <div class="take-bar" id="take-bar">
      <strong class="take-title">{{ attempt().title }}</strong>
      <span class="timer" id="timer" [class.low]="remaining() <= 300" role="timer" [attr.aria-label]="'Time left ' + clock()">
        <app-icon name="clock" [size]="18" /> {{ clock() }}
      </span>
      <span class="soft save-state" id="save-state">{{ saveLabel() }}</span>
      <button class="btn small" type="button" id="submit-test" [disabled]="submitting()" (click)="askSubmit()"><app-icon name="check" [size]="16" /> Submit</button>
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (confirming()) {
      <app-modal title="Submit the test?" boxId="submit-box" (close)="confirming.set(false)">
        <div class="summary-grid" id="submit-summary">
          <div><strong>{{ answeredCount() }}</strong> answered</div>
          <div [class.bad]="unanswered().length > 0"><strong>{{ unanswered().length }}</strong> not answered</div>
          <div><strong>{{ flagged().size }}</strong> for review</div>
        </div>
        @if (unanswered().length) {
          <p id="unanswered-list">Not answered:
            @for (n of unanswered(); track n) { <button type="button" class="chip-btn" [attr.data-jump]="n" (click)="jump(n)">{{ n }}</button> }
          </p>
        }
        <p class="muted">Time left: {{ clock() }}. You can't change your answers after you submit.</p>
        <ng-container slot="footer">
          <button class="btn secondary" type="button" id="keep-going" (click)="confirming.set(false)">Keep going</button>
          <button class="btn" type="button" id="confirm-submit" [disabled]="submitting()" (click)="submit()">{{ submitting() ? 'Submitting…' : 'Yes, submit' }}</button>
        </ng-container>
      </app-modal>
    }
    <app-lightbox />

    <div class="take-layout">
      <nav class="palette" aria-label="Questions" id="palette">
        @for (item of attempt().questions; track item.id; let i = $index) {
          <button
            type="button" class="pal" [attr.data-q]="i + 1"
            [class.answered]="isAnswered(item.id)" [class.current]="i === index()" [class.flag]="flagged().has(item.id)"
            [attr.aria-label]="'Question ' + (i + 1) + (isAnswered(item.id) ? ', answered' : ', not answered') + (flagged().has(item.id) ? ', marked for review' : '')"
            (click)="go(i)"
          >{{ i + 1 }}</button>
        }
      </nav>

      @if (current(); as q) {
        <section class="take-question" id="take-question" [attr.data-question]="q.id">
          <p class="soft">Question {{ index() + 1 }} of {{ attempt().questions.length }}</p>
          @if (q.passage_text) {
            <div class="passage-head" id="take-passage"><strong><app-icon name="file" [size]="16" /> Passage</strong><p class="passage-text">{{ q.passage_text }}</p></div>
          }
          <p class="take-text"><strong>{{ q.text }}</strong></p>
          @if (q.images['question']; as picture) { <img class="qimg" [src]="picture" alt="Picture for the question" /> }

          @if (q.kind === 'mcq') {
            <div class="choices" role="radiogroup" aria-label="Options">
              @for (option of q.options; track $index) {
                <label class="choice" [class.chosen]="answers()[q.id] === $index" [attr.data-option]="$index">
                  <input type="radio" [name]="'q-' + q.id" [checked]="answers()[q.id] === $index" (change)="choose(q.id, $index)" />
                  <span class="letter">{{ letters[$index] }}</span>
                  <span class="choice-body">
                    {{ option.text }}
                    @if (q.images[letters[$index]]; as picture) { <img class="qimg" [src]="picture" [alt]="'Picture for option ' + letters[$index]" /> }
                  </span>
                </label>
              }
            </div>
          } @else {
            <div class="field">
              <label for="typed-answer">Your answer</label>
              <input id="typed-answer" name="typed" type="text" autocomplete="off" [ngModel]="typed(q.id)" (ngModelChange)="type(q.id, $event)" />
            </div>
          }

          <div class="form-actions take-actions">
            <button class="btn secondary small" type="button" id="prev" [disabled]="index() === 0" (click)="go(index() - 1)"><app-icon name="arrow-left" [size]="16" /> Previous</button>
            <button class="btn secondary small" type="button" id="next" [disabled]="index() === attempt().questions.length - 1" (click)="go(index() + 1)">Next <span class="flip"><app-icon name="arrow-left" [size]="16" /></span></button>
            <button class="btn secondary small" type="button" id="clear" [disabled]="!isAnswered(q.id)" (click)="clear(q.id)"><app-icon name="x" [size]="16" /> Clear answer</button>
            <button class="btn secondary small" type="button" id="flag" [class.on]="flagged().has(q.id)" (click)="toggleFlag(q.id)"><app-icon name="flag" [size]="16" /> {{ flagged().has(q.id) ? 'Unmark' : 'Mark for review' }}</button>
          </div>
        </section>
      }
    </div>
  `,
})
export class TakeTest implements OnInit, OnDestroy {
  /** How long to wait after typing before saving, and before trying a failed save again (milliseconds). Tests shorten them. */
  static timing = { typingPause: 500, retry: 5000 };

  private readonly api = inject(ApiService);
  readonly letters = LETTERS;

  readonly attempt = input.required<AttemptView>();
  /** Said when the attempt is over (handed in, or the time ran out) with its result. */
  readonly finished = output<AttemptResult>();

  readonly index = signal(0);
  readonly answers = signal<Record<string, number | string>>({});
  readonly flagged = signal<Set<string>>(new Set());
  readonly remaining = signal(0);
  readonly confirming = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly saveState = signal<'saved' | 'saving' | 'failed'>('saved');

  readonly current = computed<AttemptQuestion | undefined>(() => this.attempt().questions[this.index()]);
  /** The numbers (1, 2, ...) of the questions without an answer, in order. */
  readonly unanswered = computed(() => this.attempt().questions.map((q, i) => (this.isAnswered(q.id) ? 0 : i + 1)).filter((n) => n > 0));

  /** Close the summary and go to that question. */
  jump(number: number): void {
    this.confirming.set(false);
    this.go(number - 1);
  }

  readonly answeredCount = computed(() => this.attempt().questions.filter((q) => this.isAnswered(q.id)).length);
  readonly clock = computed(() => {
    const total = this.remaining();
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const two = (n: number) => String(n).padStart(2, '0');
    return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
  });
  readonly saveLabel = computed(() => ({ saved: '', saving: 'Saving…', failed: 'Not saved yet. Trying again…' })[this.saveState()]);

  private timer: ReturnType<typeof setInterval> | undefined;
  private typingTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private dirty: Record<string, number | string | null> = {};
  private flushing = false;
  private over = false;

  ngOnInit(): void {
    this.answers.set({ ...this.attempt().answers });
    this.remaining.set(this.attempt().remaining_seconds);
    this.timer = setInterval(() => this.tick(), 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    clearTimeout(this.typingTimer);
    clearTimeout(this.retryTimer);
  }

  private tick(): void {
    if (this.over) return;
    this.remaining.update((n) => Math.max(0, n - 1));
    if (this.remaining() === 0) void this.timeUp();
  }

  /** The clock reached zero: hand in what is saved. The server has the final word on the time. */
  private async timeUp(): Promise<void> {
    if (this.over || this.submitting()) return;
    await this.submit(true);
  }

  isAnswered(id: string): boolean {
    const value = this.answers()[id];
    return value !== undefined && value !== null && value !== '';
  }

  typed(id: string): string {
    const value = this.answers()[id];
    return typeof value === 'string' ? value : '';
  }

  go(position: number): void {
    if (position >= 0 && position < this.attempt().questions.length) this.index.set(position);
  }

  toggleFlag(id: string): void {
    this.flagged.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  choose(id: string, option: number): void {
    this.setAnswer(id, option);
    void this.flush();
  }

  type(id: string, text: string): void {
    this.setAnswer(id, text);
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => void this.flush(), TakeTest.timing.typingPause);
  }

  clear(id: string): void {
    this.setAnswer(id, null);
    void this.flush();
  }

  private setAnswer(id: string, value: number | string | null): void {
    this.answers.update((all) => {
      const next = { ...all };
      if (value === null || value === '') delete next[id];
      else next[id] = value;
      return next;
    });
    this.dirty[id] = value === '' ? null : value;
  }

  /** Send what hasn't been saved yet. Failures are kept and tried again, so a bad connection loses nothing. */
  private async flush(): Promise<boolean> {
    if (this.flushing || this.over) return false;
    this.flushing = true;
    let ok = true;
    try {
      while (Object.keys(this.dirty).length && !this.over) {
        const batch = this.dirty;
        this.dirty = {};
        this.saveState.set('saving');
        try {
          const reply = await this.api.saveAnswers(this.attempt().test_id, this.attempt().number, batch);
          this.remaining.set(reply.remaining_seconds);
        } catch (error) {
          const problem = error as ApiError;
          const result = problem.status === 409 ? (problem.body?.['result'] as AttemptResult | undefined) : undefined;
          if (result) {
            this.over = true;
            this.finished.emit(result);
            return true;
          }
          // Keep what failed, unless a newer answer for the same question has arrived meanwhile.
          this.dirty = { ...batch, ...this.dirty };
          this.saveState.set('failed');
          ok = false;
          clearTimeout(this.retryTimer);
          this.retryTimer = setTimeout(() => void this.flush(), TakeTest.timing.retry);
          return false;
        }
      }
      this.saveState.set('saved');
    } finally {
      this.flushing = false;
    }
    return ok;
  }

  askSubmit(): void {
    this.confirming.set(true);
  }

  async submit(timeIsUp = false): Promise<void> {
    if (this.over || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    clearTimeout(this.typingTimer);
    try {
      // Wait for any save already on its way, then send the rest, so nothing is left behind.
      for (let i = 0; i < 50 && this.flushing; i++) await new Promise((resolve) => setTimeout(resolve, 20));
      const saved = await this.flush();
      if (this.over) return;
      if (!saved && !timeIsUp) {
        this.error.set({ status: 0, detail: "We couldn't save your last answers. Check your connection and try again." });
        return;
      }
      const result = await this.api.submitAttempt(this.attempt().test_id, this.attempt().number);
      this.over = true;
      this.finished.emit(result);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.submitting.set(false);
    }
  }
}

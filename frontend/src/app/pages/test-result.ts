import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AttemptResult, ReviewItem } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';

const LETTERS = ['A', 'B', 'C', 'D'];

/** The result of a finished attempt: the score and, when the test allows it, every question with the right answer and the reasons. */
@Component({
  selector: 'app-test-result',
  imports: [RouterLink, Icon],
  template: `
    @let r = result();
    @if (!embedded()) {
      <div class="page-head">
        <h1>{{ r.title }}</h1>
        <div class="tools">
          <a class="btn secondary small" [routerLink]="['/', tenants.slug(), 'tests', r.test_id]"><app-icon name="arrow-left" [size]="16" /> Test</a>
          <a class="btn secondary small" [routerLink]="['/', tenants.slug(), 'tests']">All tests</a>
        </div>
      </div>
    }

    <div class="card" id="result-card">
      <div class="row q-head">
        <span class="score" id="score">{{ r.marks }} <span class="soft">/ {{ r.total_marks }}</span></span>
        <span class="status big" [class.ok]="r.passed" [class.bad]="!r.passed" id="verdict">{{ r.passed ? 'Passed' : 'Not passed' }}</span>
        <span class="soft" id="percentage">{{ r.percentage }}% (pass mark {{ r.pass_percentage }}%)</span>
      </div>
      <div class="row counts" id="counts">
        <span class="chip open"><app-icon name="check" [size]="12" /> {{ r.correct }} correct</span>
        <span class="chip rejected"><app-icon name="x" [size]="12" /> {{ r.wrong }} wrong</span>
        <span class="chip hidden"><app-icon name="minus" [size]="12" /> {{ r.unanswered }} not answered</span>
      </div>
      @if (r.auto_submitted) { <p class="soft" id="auto-note" style="margin: 0.5rem 0 0">Time ran out, so your test was handed in for you.</p> }
      @if (!r.show_answers && !r.review) { <p class="soft" id="no-review" style="margin: 0.5rem 0 0">The correct answers are not shown for this test.</p> }
    </div>

    @if (r.review; as items) {
      <div class="tabs" role="tablist" aria-label="Show questions">
        <button class="tab" role="tab" type="button" [attr.aria-selected]="filter() === 'all'" (click)="filter.set('all')">All {{ items.length }}</button>
        <button class="tab" role="tab" type="button" [attr.aria-selected]="filter() === 'w'" (click)="filter.set('w')">Wrong {{ r.wrong }}</button>
        <button class="tab" role="tab" type="button" [attr.aria-selected]="filter() === 'u'" (click)="filter.set('u')">Not answered {{ r.unanswered }}</button>
      </div>
      @for (item of shown(); track item.id) {
        @if (item.passage_text && showPassage(item)) {
          <div class="passage-head"><strong><app-icon name="file" [size]="16" /> Passage</strong><p class="passage-text">{{ item.passage_text }}</p></div>
        }
        <article class="card review" [attr.data-review]="item.id" [attr.data-result]="item.result">
          <div class="row q-head">
            <span class="status" [class.ok]="item.result === 'c'" [class.bad]="item.result === 'w'">{{ item.result === 'c' ? 'Correct' : item.result === 'w' ? 'Wrong' : 'Not answered' }}</span>
            <span class="soft">Question {{ numberOf(item) }}</span>
          </div>
          <p><strong>{{ item.text }}</strong></p>
          @if (item.images['question']; as picture) { <img class="qimg" [src]="picture" alt="Picture for the question" /> }
          @if (item.kind === 'mcq') {
            @for (option of item.options; track $index) {
              <div class="rev-opt" [class.is-correct]="$index === item.correct" [class.is-wrong]="$index === item.given && $index !== item.correct" [attr.data-opt]="$index">
                <div class="row">
                  <span class="letter">{{ letters[$index] }}</span>
                  <span>{{ option.text }}</span>
                  @if ($index === item.correct) { <span class="chip open">correct answer</span> }
                  @if ($index === item.given) { <span class="chip pictures">your answer</span> }
                </div>
                @if (item.images[letters[$index]]; as picture) { <img class="qimg" [src]="picture" [alt]="'Picture for option ' + letters[$index]" /> }
                @if (item.reasons[$index]) { <div class="soft rev-why">{{ item.reasons[$index] }}</div> }
              </div>
            }
          } @else {
            <p class="rev-typed"><strong>Your answer:</strong> {{ item.given ?? 'none' }}</p>
            <p class="rev-typed"><strong>Correct answer:</strong> {{ item.answer }}</p>
            @if (item.explanation) { <div class="soft rev-why">{{ item.explanation }}</div> }
          }
        </article>
      } @empty {
        <div class="empty-state"><app-icon name="check" [size]="28" /><p>Nothing here</p></div>
      }
    }
  `,
})
export class TestResult {
  readonly tenants = inject(TenantService);
  readonly letters = LETTERS;
  readonly result = input.required<AttemptResult>();
  /** Shown inside another page (the admin's results), so without its own heading and links. */
  readonly embedded = input(false);
  readonly filter = signal<'all' | 'w' | 'u'>('all');

  readonly shown = computed<ReviewItem[]>(() => {
    const items = this.result().review ?? [];
    const f = this.filter();
    return f === 'all' ? items : items.filter((item) => item.result === f);
  });

  numberOf(item: ReviewItem): number {
    return (this.result().review ?? []).findIndex((x) => x.id === item.id) + 1;
  }

  /** A passage is shown once, above the first of its questions that is on the screen. */
  showPassage(item: ReviewItem): boolean {
    const list = this.shown();
    const position = list.findIndex((x) => x.id === item.id);
    return position === 0 || list[position - 1].passage !== item.passage;
  }
}

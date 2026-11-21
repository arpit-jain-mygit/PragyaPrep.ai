import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ApiError } from '../core/models';
import { Icon } from '../ui/icon';

/** How many stars a student can give. The server checks the same range. */
const STARS = [1, 2, 3, 4, 5];

/**
 * Feedback: a student rates the app from one to five stars and writes what they think. It is emailed to the
 * platform admin with the rating, the same way as a support message, so nothing is lost if it can't go out.
 */
@Component({
  selector: 'app-student-feedback',
  imports: [FormsModule, Icon],
  template: `
    <div class="page-head"><h1>Feedback</h1></div>
    <p class="hint">We would love to hear from you.</p>

    @if (sent()) {
      <div class="alert ok" id="feedback-sent" role="status">Thank you. Your feedback has been sent.</div>
    } @else {
      <section class="card" id="feedback-form">
        @if (error(); as problem) { <div class="alert error" role="alert" id="feedback-error">{{ problem.detail }}</div> }
        <form (ngSubmit)="send()">
          <div class="field">
            <span class="field-label">How would you rate PragyaPrep?</span>
            <div class="stars" role="radiogroup" aria-label="Rating">
              @for (star of stars; track star) {
                <button class="star" type="button" role="radio" [attr.aria-checked]="rating() === star" [attr.data-star]="star" [class.on]="rating() >= star" (click)="rating.set(star)">
                  <app-icon name="star" [size]="22" /><span class="sr-only">{{ star }} {{ star === 1 ? 'star' : 'stars' }}</span>
                </button>
              }
            </div>
          </div>
          <div class="field">
            <label for="feedback-message">Your feedback</label>
            <textarea id="feedback-message" name="message" rows="5" maxlength="2000" [(ngModel)]="message"></textarea>
          </div>
          <button class="btn" type="submit" id="feedback-send" [disabled]="busy()">{{ busy() ? 'Sending…' : 'Send feedback' }}</button>
        </form>
      </section>
    }
  `,
  styles: `
    .stars { display: flex; gap: 0.3rem; }
    .star { border: 0; background: none; color: var(--muted, #94a3b8); cursor: pointer; padding: 0.2rem; }
    .star.on { color: #f59e0b; }
  `,
})
export class StudentFeedback {
  private readonly api = inject(ApiService);

  readonly stars = STARS;
  readonly rating = signal(0);
  message = '';
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly error = signal<ApiError | null>(null);

  async send(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.sendSupport({ kind: 'feedback', rating: this.rating(), message: this.message });
      this.sent.set(true);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }
}

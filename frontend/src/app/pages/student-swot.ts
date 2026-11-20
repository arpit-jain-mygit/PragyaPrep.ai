import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, SwotView } from '../core/models';

/**
 * SWOT analysis: your strengths and weaknesses from your last ten sectionals and mocks. Topics need a few questions
 * before they count, and the page waits for a few attempts before it judges at all.
 */
@Component({
  selector: 'app-student-swot',
  template: `
    <div class="page-head"><h1>SWOT analysis</h1></div>
    <p class="hint">Your last ten sectionals and mocks, looked at by topic. Work on the weak areas first.</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="swot-error">{{ problem.detail }}</div> }
    @if (swot(); as s) {
      @if (!s.enough) {
        <p class="muted" id="swot-insufficient">Insufficient data for SWOT analysis. Please attempt more sectionals or mocks ({{ s.attempts }} so far, at least 3 needed).</p>
      } @else {
        <section class="card" id="swot-strengths">
          <h2>Strengths</h2>
          @if (s.strengths.length) {
            <ul class="plain-list">
              @for (row of s.strengths; track row.topic) { <li [attr.data-topic]="row.topic">{{ row.topic }} <span class="muted small">{{ row.subject }} · {{ row.accuracy }}%</span></li> }
            </ul>
          } @else { <p class="muted">No topic is strong enough yet.</p> }
        </section>
        <section class="card" id="swot-weaknesses">
          <h2>Weaknesses</h2>
          @if (s.weaknesses.length) {
            <ul class="plain-list">
              @for (row of s.weaknesses; track row.topic) { <li [attr.data-topic]="row.topic">{{ row.topic }} <span class="muted small">{{ row.subject }} · {{ row.accuracy }}%</span></li> }
            </ul>
          } @else { <p class="muted">No weak topics in these attempts.</p> }
        </section>
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class StudentSwot implements OnInit {
  private readonly api = inject(ApiService);
  readonly swot = signal<SwotView | null>(null);
  readonly error = signal<ApiError | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.swot.set(await this.api.mySwot());
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }
}

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { check, EligibilityDetails, ruleLabel, Verdict } from '../core/eligibility';
import { ApiService } from '../core/api.service';
import { ApiError, EligibilityCollege } from '../core/models';

const BLANK: EligibilityDetails = { dob: '', tenthYear: '', tenthPercent: '', twelfthYear: '', twelfthPercent: '', twelfthMaths: '' };
const WORDS: Record<Verdict, string> = { eligible: 'Eligible', not_eligible: 'Not eligible', pending: 'Pending' };

/**
 * Eligibility checker: type your details once, and see each college's rules checked against them. What you type is
 * kept only on this page; it is never saved.
 */
@Component({
  selector: 'app-student-eligibility',
  imports: [FormsModule],
  template: `
    <div class="page-head"><h1>Eligibility checker</h1></div>
    <p class="hint">Your details stay on this page. We don't store any of them.</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="eligibility-error">{{ problem.detail }}</div> }

    <form class="card" id="details-form" (submit)="$event.preventDefault()">
      <h2>Your details</h2>
      <label>Date of birth <input id="dob" type="date" name="dob" [ngModel]="details.dob" (ngModelChange)="set('dob', $event)" /></label>
      <label>10th passed in <input id="tenth-year" type="number" name="tenthYear" min="1990" max="2100" [ngModel]="details.tenthYear" (ngModelChange)="set('tenthYear', $event)" /></label>
      <label>10th overall marks (%) <input id="tenth-percent" type="number" name="tenthPercent" min="0" max="100" [ngModel]="details.tenthPercent" (ngModelChange)="set('tenthPercent', $event)" /></label>
      <label>12th passed in <input id="twelfth-year" type="number" name="twelfthYear" min="1990" max="2100" [ngModel]="details.twelfthYear" (ngModelChange)="set('twelfthYear', $event)" /></label>
      <label>12th overall marks (%) <input id="twelfth-percent" type="number" name="twelfthPercent" min="0" max="100" [ngModel]="details.twelfthPercent" (ngModelChange)="set('twelfthPercent', $event)" /></label>
      <label>Maths in 12th
        <select id="twelfth-maths" name="twelfthMaths" [ngModel]="details.twelfthMaths" (ngModelChange)="set('twelfthMaths', $event)">
          <option value="">Select</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
    </form>

    @if (colleges(); as list) {
      @if (list.length) {
        <div class="grid-cards" id="college-cards">
          @for (item of checks(); track item.college.id) {
            <section class="card college" [attr.data-college]="item.college.id" [attr.data-verdict]="item.verdict">
              <header class="row-actions">
                <h2>{{ item.college.name }}</h2>
                <span class="pill" [class.ok]="item.verdict === 'eligible'" [class.no]="item.verdict === 'not_eligible'">{{ words[item.verdict] }}</span>
              </header>
              <ul class="plain-list">
                @for (rule of item.college.rules; track $index) {
                  <li [class.muted]="item.missingLabels.includes(ruleText(rule))" [class.fail]="item.failedLabels.includes(ruleText(rule))">{{ ruleText(rule) }}</li>
                }
              </ul>
              @if (item.failed.length) { <p class="small">Not met: {{ item.failed.join(', ') }}</p> }
            </section>
          }
        </div>
      } @else {
        <p class="muted" id="no-colleges">No colleges have been added yet.</p>
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class StudentEligibility implements OnInit {
  private readonly api = inject(ApiService);

  readonly words = WORDS;
  readonly colleges = signal<EligibilityCollege[] | null>(null);
  readonly error = signal<ApiError | null>(null);
  details: EligibilityDetails = { ...BLANK };
  /** The details as a signal, so the verdicts follow each change. */
  readonly live = signal<EligibilityDetails>({ ...BLANK });

  /** Each college with its verdict, recalculated when the details change. */
  readonly checks = computed(() => {
    const details = this.live();
    return (this.colleges() ?? []).map((college) => {
      const result = check(college.rules, details);
      return {
        college,
        verdict: result.verdict,
        failed: result.failed,
        failedLabels: result.failed,
        missingLabels: result.missing,
      };
    });
  });

  async ngOnInit(): Promise<void> {
    try {
      this.colleges.set(await this.api.myEligibility());
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  /** The words for one rule, for the list. */
  ruleText(rule: EligibilityCollege['rules'][number]): string {
    return ruleLabel(rule);
  }

  /** One field changed: keep it, and let the verdicts follow. The details stay in memory on this page only. */
  set(field: keyof EligibilityDetails, value: string): void {
    this.details = { ...this.details, [field]: value };
    this.live.set(this.details);
  }
}

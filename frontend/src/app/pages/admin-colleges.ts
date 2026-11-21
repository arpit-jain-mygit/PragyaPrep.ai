import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ruleLabel } from '../core/eligibility';
import { AdminCollege, ApiError, CollegeRule, CollegeRuleType, CutoffRow, CutoffView } from '../core/models';

const RULE_NAMES: Record<CollegeRuleType, string> = {
  dob_on_or_after: 'Born on or after (date)',
  min_tenth_percent: '10th overall at least (%)',
  min_twelfth_percent: '12th overall at least (%)',
  tenth_year_or_later: '10th passed in or after (year)',
  twelfth_year_or_later: '12th passed in or after (year)',
  twelfth_maths: 'Maths in 12th is required',
};
const CATEGORIES = ['General', 'EWS', 'NC-OBC', 'SC', 'ST', 'PwD'];
const SECTIONS = ['Exam', 'SA', 'MCQ', 'VA'];

/**
 * The institute's college data for the Tools screens: each college's eligibility rules, and its cutoffs by year,
 * category and section. Students see these on the Eligibility checker and the Cutoffs page.
 */
@Component({
  selector: 'app-admin-colleges',
  template: `
    <div class="page-head"><h1>Colleges and cutoffs</h1></div>
    <p class="hint">Enter each college's eligibility rules and its cutoffs. Students see them on the Eligibility checker and the Cutoffs page.</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="colleges-error">{{ problem.detail }}</div> }

    <section class="card">
      <h2>Add a college</h2>
      <label class="field">College name <input id="college-name" type="text" maxlength="80" [value]="name()" (input)="name.set(read($event))" /></label>
      <h3>Eligibility rules</h3>
      @for (rule of draftRules(); track $index) {
        <div class="row-actions">
          <span>{{ ruleText(rule) }}</span>
          <button type="button" class="link" [attr.aria-label]="'Remove rule ' + ruleText(rule)" (click)="removeRule($index)">Remove</button>
        </div>
      }
      <div class="row-actions">
        <select id="rule-type" [value]="ruleType()" (change)="ruleType.set(readType($event))">
          @for (kind of ruleKinds; track kind) { <option [value]="kind">{{ names[kind] }}</option> }
        </select>
        @if (needsValue()) {
          <input id="rule-value" [attr.type]="valueType()" [value]="ruleValue()" (input)="ruleValue.set(read($event))" />
        }
        <button type="button" class="btn ghost" id="add-rule" (click)="addRule()">Add rule</button>
      </div>
      <button class="btn" id="add-college" type="button" [disabled]="busy()" (click)="addCollege()">Add college</button>
    </section>

    @if (colleges().length) {
      <section class="card">
        <h2>Colleges</h2>
        <table class="compact" id="colleges-table">
          <thead><tr><th>College</th><th>Rules</th><th></th></tr></thead>
          <tbody>
            @for (college of colleges(); track college.id) {
              <tr [attr.data-college]="college.id">
                <td><button type="button" class="link" (click)="pick(college.id)">{{ college.name }}</button></td>
                <td class="small">{{ college.rules.length ? college.rules.length + ' rules' : 'No rules' }}</td>
                <td><button type="button" class="link" [attr.aria-label]="'Remove ' + college.name" (click)="removeCollege(college)">Remove</button></td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    }

    @if (picked(); as college) {
      <section class="card" id="cutoff-section">
        <h2>Cutoffs for {{ college.name }}</h2>
        <div class="row-actions">
          <label>Year <input id="cutoff-year" type="number" min="2000" max="2100" [value]="year()" (input)="year.set(read($event))" /></label>
          <label>Category
            <select id="cutoff-category" [value]="category()" (change)="category.set(read($event))">
              @for (item of categories; track item) { <option [value]="item">{{ item }}</option> }
            </select>
          </label>
          <label>Section
            <select id="cutoff-section-pick" [value]="section()" (change)="section.set(read($event))">
              @for (item of sections; track item) { <option [value]="item">{{ item }}</option> }
            </select>
          </label>
          <label>Cutoff <input id="cutoff-mark" type="number" min="0" max="1000" [value]="mark()" (input)="mark.set(read($event))" /></label>
          <label>Seats <input id="cutoff-seats" type="number" min="0" [value]="seats()" (input)="seats.set(read($event))" /></label>
          <label>Applicants <input id="cutoff-applicants" type="number" min="0" [value]="applicants()" (input)="applicants.set(read($event))" /></label>
          <label>Qualified <input id="cutoff-qualified" type="number" min="0" [value]="qualified()" (input)="qualified.set(read($event))" /></label>
          <button class="btn" id="save-cutoff" type="button" (click)="saveCutoff(college.id)">Save cutoff</button>
        </div>

        @if (cutoffs(); as view) {
          @if (view.rows.length) {
            <table class="compact" id="admin-cutoff-table">
              <thead><tr><th>Year</th><th>Category</th><th>Section</th><th>Cutoff</th><th>Seats</th><th>Applicants</th><th>Qualified</th><th></th></tr></thead>
              <tbody>
                @for (row of view.rows; track row.id) {
                  <tr [attr.data-row]="row.id">
                    <td>{{ row.year }}</td><td>{{ row.category }}</td><td>{{ row.section }}</td><td>{{ row.cutoff }}</td>
                    <td>{{ row.seats ?? '—' }}</td><td>{{ row.applicants ?? '—' }}</td><td>{{ row.qualified ?? '—' }}</td>
                    <td><button type="button" class="link" [attr.aria-label]="'Remove cutoff ' + row.id" (click)="removeCutoff(college.id, row)">Remove</button></td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="muted" id="admin-cutoffs-empty">No cutoffs yet for this college.</p>
          }
        }
      </section>
    }
  `,
})
export class AdminCollegesPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly names = RULE_NAMES;
  readonly ruleKinds = Object.keys(RULE_NAMES) as CollegeRuleType[];
  readonly categories = CATEGORIES;
  readonly sections = SECTIONS;

  readonly colleges = signal<AdminCollege[]>([]);
  readonly error = signal<ApiError | null>(null);
  readonly busy = signal(false);

  readonly name = signal('');
  readonly draftRules = signal<CollegeRule[]>([]);
  readonly ruleType = signal<CollegeRuleType>('dob_on_or_after');
  readonly ruleValue = signal('');

  readonly picked = signal<AdminCollege | null>(null);
  readonly cutoffs = signal<CutoffView | null>(null);
  readonly year = signal(String(new Date().getFullYear()));
  readonly category = signal('General');
  readonly section = signal('SA');
  readonly mark = signal('');
  readonly seats = signal('');
  readonly applicants = signal('');
  readonly qualified = signal('');

  /** Whether the rule being added needs a value typed in, and what kind of input to show. */
  readonly needsValue = computed(() => this.ruleType() !== 'twelfth_maths');
  readonly valueType = computed(() => {
    const kind = this.ruleType();
    if (kind === 'dob_on_or_after') return 'date';
    return 'number';
  });

  async ngOnInit(): Promise<void> {
    try {
      this.colleges.set(await this.api.adminColleges());
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  ruleText(rule: CollegeRule): string {
    return ruleLabel(rule);
  }

  addRule(): void {
    const value = this.needsValue() ? this.ruleValue() : null;
    this.draftRules.update((rules) => [...rules, { type: this.ruleType(), value: this.needsValue() ? value : null }]);
    this.ruleValue.set('');
  }

  removeRule(index: number): void {
    this.draftRules.update((rules) => rules.filter((_, i) => i !== index));
  }

  async addCollege(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const added = await this.api.addCollege({ name: this.name(), rules: this.draftRules() });
      this.colleges.update((list) => [...list, added]);
      this.name.set('');
      this.draftRules.set([]);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async removeCollege(college: AdminCollege): Promise<void> {
    this.error.set(null);
    try {
      await this.api.removeCollege(college.id);
      this.colleges.update((list) => list.filter((item) => item.id !== college.id));
      if (this.picked()?.id === college.id) {
        this.picked.set(null);
        this.cutoffs.set(null);
      }
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async pick(id: string): Promise<void> {
    this.error.set(null);
    const college = this.colleges().find((item) => item.id === id) ?? null;
    this.picked.set(college);
    await this.loadCutoffs(id);
  }

  async saveCutoff(collegeId: string): Promise<void> {
    this.error.set(null);
    try {
      await this.api.saveCutoff(collegeId, {
        year: Number(this.year()),
        category: this.category(),
        section: this.section(),
        cutoff: Number(this.mark()),
        seats: this.seats() === '' ? null : Number(this.seats()),
        applicants: this.applicants() === '' ? null : Number(this.applicants()),
        qualified: this.qualified() === '' ? null : Number(this.qualified()),
      });
      this.mark.set('');
      await this.loadCutoffs(collegeId);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async removeCutoff(collegeId: string, row: CutoffRow): Promise<void> {
    this.error.set(null);
    try {
      await this.api.removeCutoff(collegeId, row.id);
      await this.loadCutoffs(collegeId);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  readType(event: Event): CollegeRuleType {
    return (event.target as HTMLSelectElement).value as CollegeRuleType;
  }

  private async loadCutoffs(collegeId: string): Promise<void> {
    try {
      this.cutoffs.set(await this.api.adminCutoffs(collegeId));
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }
}

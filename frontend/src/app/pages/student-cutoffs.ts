import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, CutoffRow, CutoffView } from '../core/models';

/** The categories and sections, in the order the table shows them. */
const CATEGORIES = ['General', 'EWS', 'NC-OBC', 'SC', 'ST', 'PwD'];
const SECTIONS = ['SA', 'MCQ', 'VA', 'Exam'];

/**
 * Cutoffs: a college's cut-off marks for a year, by category and section, with seats and applicant numbers when the
 * institute has entered them.
 */
@Component({
  selector: 'app-student-cutoffs',
  template: `
    <div class="page-head"><h1>Cutoffs</h1></div>
    <p class="hint">Cut-off marks for each college, by category and section, for the year you pick.</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="cutoffs-error">{{ problem.detail }}</div> }

    @if (colleges().length) {
      <div class="filters">
        <label>College
          <select id="college-pick" [value]="college()" (change)="chooseCollege(read($event))">
            @for (item of colleges(); track item.id) { <option [value]="item.id">{{ item.name }}</option> }
          </select>
        </label>
        @if (view(); as v) {
          <label>Year
            <select id="year-pick" [value]="year()" (change)="chooseYear(read($event))">
              @for (y of v.years; track y) { <option [value]="y">{{ y }}</option> }
            </select>
          </label>
        }
      </div>

      @if (view(); as v) {
        @if (v.rows.length) {
          <div class="table-wrap">
            <table class="compact" id="cutoff-table">
              <thead>
                <tr><th>Category</th>@for (section of sections; track section) { <th>{{ section }}</th> }<th>Seats</th><th>Applicants</th><th>Qualified</th></tr>
              </thead>
              <tbody>
                @for (category of categories(); track category) {
                  <tr [attr.data-category]="category">
                    <td>{{ category }}</td>
                    @for (section of sections; track section) {
                      <td>{{ cell(category, section)?.cutoff ?? '—' }}</td>
                    }
                    <td>{{ seats(category) ?? '—' }}</td>
                    <td>{{ applicants(category) ?? '—' }}</td>
                    <td>{{ qualified(category) ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="muted" id="cutoffs-empty">No cutoffs have been entered for this college yet.</p>
        }
      }
    } @else if (loaded()) {
      <p class="muted" id="no-cutoffs">No colleges have cutoffs yet.</p>
    }
  `,
})
export class StudentCutoffs implements OnInit {
  private readonly api = inject(ApiService);

  readonly sections = SECTIONS;
  readonly colleges = signal<{ id: string; name: string; years: number[] }[]>([]);
  readonly loaded = signal(false);
  readonly college = signal('');
  readonly year = signal<number | null>(null);
  readonly view = signal<CutoffView | null>(null);
  readonly error = signal<ApiError | null>(null);

  /** The categories that have at least one row, in the usual order. */
  readonly categories = computed(() => {
    const present = new Set((this.view()?.rows ?? []).map((row) => row.category));
    return CATEGORIES.filter((category) => present.has(category));
  });

  async ngOnInit(): Promise<void> {
    try {
      const list = await this.api.myColleges();
      this.colleges.set(list);
      if (list.length) {
        this.college.set(list[0].id);
        await this.load();
      }
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loaded.set(true);
    }
  }

  async chooseCollege(id: string): Promise<void> {
    this.college.set(id);
    this.year.set(null);
    await this.load();
  }

  async chooseYear(value: string): Promise<void> {
    this.year.set(Number(value));
    await this.load();
  }

  cell(category: string, section: string): CutoffRow | undefined {
    return this.view()?.rows.find((row) => row.category === category && row.section === section);
  }

  seats(category: string): number | null | undefined {
    return this.firstRow(category)?.seats;
  }

  applicants(category: string): number | null | undefined {
    return this.firstRow(category)?.applicants;
  }

  qualified(category: string): number | null | undefined {
    return this.firstRow(category)?.qualified;
  }

  read(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  private firstRow(category: string): CutoffRow | undefined {
    return this.view()?.rows.find((row) => row.category === category);
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      const next = await this.api.myCutoffs(this.college(), this.year() ?? undefined);
      this.view.set(next);
      this.year.set(next.year);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }
}

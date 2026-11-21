import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ApiError, Application, ApplicationInput, ApplicationStatus } from '../core/models';

/** The stages in the order a student moves through them, with the words the student sees. */
export const STAGES: { value: ApplicationStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'applied', label: 'Applied' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

/**
 * Application tracker: the colleges this student is applying to. Add a college with its programme, pick its stage,
 * and keep a deadline and a note. The list shows the nearest deadline first.
 */
@Component({
  selector: 'app-student-applications',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="page-head"><h1>Applications</h1></div>
    <p class="hint">Keep track of every college you are applying to, where each one stands, and when it is due.</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="application-error">{{ problem.detail }}</div> }

    <form class="card" id="application-form" (ngSubmit)="add()">
      <h2>Add a college</h2>
      <label>College <input id="college" name="college" [(ngModel)]="draft.college" maxlength="80" /></label>
      <label>Programme <input id="programme" name="programme" [(ngModel)]="draft.programme" maxlength="80" /></label>
      <label>Stage
        <select id="status" name="status" [(ngModel)]="draft.status">
          @for (stage of stages; track stage.value) { <option [value]="stage.value">{{ stage.label }}</option> }
        </select>
      </label>
      <label>Deadline <input id="deadline" name="deadline" type="date" [(ngModel)]="draft.deadline" /></label>
      <label>Note <textarea id="notes" name="notes" rows="2" maxlength="300" [(ngModel)]="draft.notes"></textarea></label>
      <button id="add-application" type="submit" [disabled]="busy()">Add</button>
    </form>

    @if (rows().length) {
      <div class="table-wrap">
        <table class="compact" id="applications-table">
          <thead>
            <tr><th>College</th><th>Programme</th><th>Stage</th><th>Deadline</th><th>Note</th><th></th></tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr [attr.data-application]="row.id">
                <td>{{ row.college }}</td>
                <td>{{ row.programme }}</td>
                <td>
                  <select [attr.aria-label]="'Stage for ' + row.college" [ngModel]="row.status" (ngModelChange)="changeStage(row, $event)">
                    @for (stage of stages; track stage.value) { <option [value]="stage.value">{{ stage.label }}</option> }
                  </select>
                </td>
                <td>{{ row.deadline ? (row.deadline | date: 'd MMM y') : '—' }}</td>
                <td class="muted small">{{ row.notes }}</td>
                <td><button type="button" class="link" [attr.aria-label]="'Delete ' + row.college" (click)="remove(row)">Delete</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else if (loaded()) {
      <p class="muted" id="applications-empty">No applications yet. Add the first college above.</p>
    }
  `,
})
export class StudentApplications implements OnInit {
  private readonly api = inject(ApiService);

  readonly stages = STAGES;
  readonly rows = signal<Application[]>([]);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly count = computed(() => this.rows().length);

  draft: ApplicationInput = blankDraft();

  async ngOnInit(): Promise<void> {
    try {
      this.rows.set(await this.api.myApplications());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loaded.set(true);
    }
  }

  async add(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const added = await this.api.addApplication(this.payload(this.draft));
      this.rows.set(sorted([...this.rows(), added]));
      this.draft = blankDraft();
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async changeStage(row: Application, status: ApplicationStatus): Promise<void> {
    this.error.set(null);
    try {
      const changed = await this.api.changeApplication(row.id, { ...this.payload(row), status });
      this.rows.set(sorted(this.rows().map((item) => (item.id === row.id ? changed : item))));
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async remove(row: Application): Promise<void> {
    this.error.set(null);
    try {
      await this.api.removeApplication(row.id);
      this.rows.set(this.rows().filter((item) => item.id !== row.id));
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  /** The fields the server takes, with an empty deadline sent as no deadline. */
  private payload(source: ApplicationInput): ApplicationInput {
    return {
      college: source.college ?? '',
      programme: source.programme ?? '',
      status: source.status,
      deadline: source.deadline || null,
      notes: source.notes ?? '',
    };
  }
}

function blankDraft(): ApplicationInput {
  return { college: '', programme: '', status: 'planning', deadline: null, notes: '' };
}

/** Nearest deadline first, rows without a deadline last. Matches the order the server sends. */
function sorted(rows: Application[]): Application[] {
  return [...rows].sort((a, b) => {
    if (!a.deadline !== !b.deadline) return a.deadline ? -1 : 1;
    return (a.deadline ?? '').localeCompare(b.deadline ?? '') || a.college.localeCompare(b.college);
  });
}

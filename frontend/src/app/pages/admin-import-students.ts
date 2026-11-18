import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ApiError, ImportRow, StudentImport } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

/** The server takes this many welcome emails at a time. */
export const WELCOME_CHUNK = 25;

const LABELS: Record<ImportRow['status'], string> = { ready: 'Ready', skipped: 'Already registered', error: 'Problem', created: 'Created' };

/**
 * Bulk onboarding: download the Excel template, fill it in, choose it to see a preview of every row, then import.
 * Each student is approved at once with their courses; a welcome email can go out too.
 */
@Component({
  selector: 'app-admin-import-students',
  imports: [FormsModule, RouterLink, Icon, InfoTip],
  template: `
    <div class="page-head">
      <h1>
        Import students
        <app-info text="Download the template, fill in one row per student, then choose the file here. You see every row checked before anything is saved. Each student is approved at once with their courses and can log in with an emailed code. Students already registered are left as they are." />
      </h1>
      <span class="row">
        <button class="btn secondary small" type="button" id="template" [disabled]="busy()" (click)="download()"><app-icon name="download" [size]="16" /> Template</button>
        <a class="btn secondary small" [routerLink]="['/', tenants.slug(), 'admin', 'registrations']"><app-icon name="arrow-left" [size]="16" /> Registrations</a>
      </span>
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (!result()) {
      <div class="form-panel">
        <div class="field">
          <label for="file">Excel file <app-info text="The filled-in template (.xlsx), up to 500 students." /></label>
          <input id="file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" (change)="chosen($event)" [disabled]="busy()" />
        </div>
        @if (busy() && !preview()) { <p class="muted" role="status">Checking…</p> }
      </div>
    }

    @if (shown(); as data) {
      <div class="stat-grid" id="summary">
        <div class="stat"><div class="num" id="s-total">{{ data.summary.total }}</div><div class="label">Rows</div></div>
        <div class="stat"><div class="num ok-num" id="s-ready">{{ result() ? data.summary.created ?? 0 : data.summary.ready }}</div><div class="label">{{ result() ? 'Created' : 'Ready' }}</div></div>
        <div class="stat"><div class="num" id="s-skipped">{{ data.summary.skipped }}</div><div class="label">Already registered</div></div>
        <div class="stat"><div class="num bad-num" id="s-errors">{{ data.summary.errors }}</div><div class="label">Problems</div></div>
      </div>

      @if (!result()) {
        <div class="row cw-copy-actions" id="actions">
          <label class="cw-check"><input type="checkbox" id="welcome" [(ngModel)]="welcome" [ngModelOptions]="{ standalone: true }" /> Email each a welcome</label>
          <button class="btn" type="button" id="import" [disabled]="busy() || data.summary.ready === 0" (click)="run()">
            <app-icon name="upload" [size]="16" /> {{ busy() ? 'Importing…' : 'Import ' + data.summary.ready + (data.summary.ready === 1 ? ' student' : ' students') }}
          </button>
          @if (data.summary.errors > 0) { <span class="soft" id="note">Rows with problems are not imported. Fix them in the file and import it again.</span> }
        </div>
      }

      @if (welcomeProgress(); as w) {
        <div class="alert" [class.ok]="w.done" role="status" id="welcome-status">
          @if (w.done) { Welcome emails: {{ w.sent }} sent@if (w.failed) {, {{ w.failed }} could not be sent} } @else { Emailing welcomes… {{ w.sent + w.failed }} of {{ w.total }} }
        </div>
      }
      @if (result() && !welcomeProgress()) {
        <div class="alert ok" role="status" id="done">Imported {{ data.summary.created ?? 0 }} {{ (data.summary.created ?? 0) === 1 ? 'student' : 'students' }}.</div>
      }

      @if (data.summary.errors + data.summary.skipped > 0) {
        <div class="filters">
          <label class="cw-check"><input type="checkbox" id="problems-only" [(ngModel)]="problemsOnly" [ngModelOptions]="{ standalone: true }" /> Show only rows that need attention</label>
        </div>
      }

      <div class="table-wrap">
        <table class="compact" id="rows">
          <thead><tr><th>Row</th><th>Student</th><th class="hide-sm">Courses</th><th>Result</th></tr></thead>
          <tbody>
            @for (item of visible(); track item.row) {
              <tr [attr.data-row]="item.row">
                <td class="soft">{{ item.row }}</td>
                <td><strong>{{ item.name || '-' }}</strong><div class="soft">{{ item.email }}</div></td>
                <td class="soft hide-sm">{{ item.courses.join(', ') }}</td>
                <td>
                  <span class="status" [class.ok]="item.status === 'ready' || item.status === 'created'" [class.bad]="item.status === 'error'">{{ label(item.status) }}</span>
                  @for (entry of problems(item); track entry[0]) { <div class="soft problem" [attr.data-problem]="entry[0]"><strong>{{ entry[0] }}:</strong> {{ entry[1] }}</div> }
                  @if (item.message) { <div class="soft">{{ item.message }}</div> }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="4"><div class="empty-state"><app-icon name="check" [size]="32" /><p>Nothing here needs attention</p></div></td></tr>
            }
          </tbody>
        </table>
      </div>

      @if (result()) {
        <p><button class="btn secondary" type="button" id="again" (click)="reset()"><app-icon name="rotate" [size]="16" /> Import another file</button></p>
      }
    }
  `,
})
export class AdminImportStudents {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);

  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly preview = signal<StudentImport | null>(null);
  readonly result = signal<StudentImport | null>(null);
  readonly welcomeProgress = signal<{ total: number; sent: number; failed: number; done: boolean } | null>(null);
  private file: File | null = null;

  welcome = true;
  problemsOnly = true;

  /** What the table shows: the finished import if there is one, else the preview. */
  shown(): StudentImport | null {
    return this.result() ?? this.preview();
  }

  visible(): ImportRow[] {
    const data = this.shown();
    if (!data) return [];
    const needAttention = this.problemsOnly && data.summary.errors + data.summary.skipped > 0;
    return needAttention ? data.rows.filter((r) => r.status === 'error' || r.status === 'skipped' || !!r.message) : data.rows;
  }

  problems(item: ImportRow): [string, string][] {
    return Object.entries(item.problems ?? {});
  }

  label(status: ImportRow['status']): string {
    return LABELS[status];
  }

  async download(): Promise<void> {
    this.error.set(null);
    try {
      const blob = await this.api.studentImportTemplate();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'student-import-template.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async chosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.busy()) return;
    this.error.set(null);
    this.preview.set(null);
    this.file = file;
    this.busy.set(true);
    try {
      this.preview.set(await this.api.importStudents(file, false));
      this.problemsOnly = true;
    } catch (error) {
      this.error.set(error as ApiError);
      this.file = null;
    } finally {
      this.busy.set(false);
    }
  }

  /** Create the ready students, then (if ticked) email each a welcome, a few at a time. */
  async run(): Promise<void> {
    if (!this.file || this.busy()) return;
    this.error.set(null);
    this.busy.set(true);
    try {
      const done = await this.api.importStudents(this.file, true);
      this.result.set(done);
      this.problemsOnly = true;
      if (this.welcome && done.created.length) await this.sendWelcomes(done.created);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  private async sendWelcomes(emails: string[]): Promise<void> {
    const progress = { total: emails.length, sent: 0, failed: 0, done: false };
    this.welcomeProgress.set({ ...progress });
    for (let at = 0; at < emails.length; at += WELCOME_CHUNK) {
      const chunk = emails.slice(at, at + WELCOME_CHUNK);
      try {
        const answer = await this.api.sendWelcome(chunk);
        progress.sent += answer.sent;
        progress.failed += answer.failed;
      } catch {
        progress.failed += chunk.length;
      }
      this.welcomeProgress.set({ ...progress });
    }
    this.welcomeProgress.set({ ...progress, done: true });
  }

  reset(): void {
    this.file = null;
    this.preview.set(null);
    this.result.set(null);
    this.welcomeProgress.set(null);
    this.error.set(null);
  }
}

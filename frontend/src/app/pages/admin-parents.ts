import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AdminParent, ApiError, ParentImport, ParentInput } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

const blank = (): ParentInput => ({ first_name: '', last_name: '', email: '', mobile: '', student_email: '' });

/** Parents: add one with the email of their child, or many from an Excel sheet. A parent sees their child's progress and can set practice tests. */
@Component({
  selector: 'app-admin-parents',
  imports: [FormsModule, RouterLink, Icon, InfoTip],
  template: `
    <div class="page-head">
      <h1>Parents <app-info text="A parent logs in with their email and sees how their child is doing. Add each parent with their child's email (the child must already be a student here), one by one or from an Excel sheet." /></h1>
      <span class="row">
        <button class="btn small" type="button" id="add-parent" [disabled]="busy() || !!form()" (click)="form.set(blank()); fieldErrors.set({})"><app-icon name="plus" [size]="16" /> Add parent</button>
        <button class="btn secondary small" type="button" id="parent-template" [disabled]="busy()" (click)="downloadTemplate()"><app-icon name="download" [size]="16" /> Template</button>
        <label class="btn secondary small">
          <input type="file" id="parent-sheet" class="sr-only" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" [disabled]="busy()" (change)="sheetChosen($event)" />
          <app-icon name="upload" [size]="16" /> Upload sheet
        </label>
        <a class="btn secondary small" [routerLink]="['/', tenants.slug(), 'admin', 'registrations']"><app-icon name="arrow-left" [size]="16" /> Registrations</a>
      </span>
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
    @if (notice(); as n) { <div class="alert ok" role="status" id="notice">{{ n }}</div> }

    @if (preview(); as p) {
      <section class="card" id="import-panel">
        <div class="stat-grid" id="import-summary">
          <div class="stat"><div class="num" id="i-total">{{ p.summary.total }}</div><div class="label">Rows</div></div>
          <div class="stat"><div class="num ok-num" id="i-ready">{{ p.confirmed ? (p.summary.created ?? 0) + (p.summary.linked ?? 0) : p.summary.ready }}</div><div class="label">{{ p.confirmed ? 'Added' : 'Ready' }}</div></div>
          <div class="stat"><div class="num" id="i-skipped">{{ p.summary.skipped }}</div><div class="label">Already linked</div></div>
          <div class="stat"><div class="num bad-num" id="i-errors">{{ p.summary.errors }}</div><div class="label">Problems</div></div>
        </div>
        @if (!p.confirmed) {
          <div class="row">
            <button class="btn" type="button" id="import-confirm" [disabled]="busy() || p.summary.ready === 0" (click)="confirmImport()"><app-icon name="check" [size]="16" /> Add {{ p.summary.ready }} {{ p.summary.ready === 1 ? 'row' : 'rows' }}</button>
            <button class="btn secondary" type="button" id="import-cancel" (click)="preview.set(null)">Cancel</button>
            @if (p.summary.errors) { <span class="soft">Rows with problems are not added. Fix them in the file and upload it again.</span> }
          </div>
        } @else {
          <button class="btn secondary" type="button" id="import-done" (click)="preview.set(null)">Done</button>
        }
        <div class="table-wrap">
          <table class="compact" id="import-rows">
            <thead><tr><th>Row</th><th>Parent</th><th>Result</th></tr></thead>
            <tbody>
              @for (r of p.rows; track r.row) {
                <tr [attr.data-row]="r.row">
                  <td class="soft">{{ r.row }}</td>
                  <td><strong>{{ r.name || '-' }}</strong><div class="soft">{{ r.email }}@if (r.children.length) { · {{ r.children.join(', ') }} }</div></td>
                  <td>
                    <span class="status" [class.ok]="r.status === 'ready' || r.status === 'created'" [class.bad]="r.status === 'error'">{{ label(r.status) }}</span>
                    @for (e of problems(r); track e[0]) { <div class="soft" [attr.data-problem]="e[0]"><strong>{{ e[0] }}:</strong> {{ e[1] }}</div> }
                    @if (r.message) { <div class="soft">{{ r.message }}</div> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }

    @if (form(); as f) {
      <section class="card" id="parent-form">
        <h2 style="margin-top: 0">Add a parent</h2>
        <form (ngSubmit)="save()">
          <div class="grid-2">
            <div class="field"><label for="p-first">First name</label><input id="p-first" name="first" type="text" [(ngModel)]="f.first_name" [attr.aria-invalid]="fieldErrors()['first_name'] ? 'true' : null" />@if (fieldErrors()['first_name']; as m) { <div class="error-text">{{ m }}</div> }</div>
            <div class="field"><label for="p-last">Last name</label><input id="p-last" name="last" type="text" [(ngModel)]="f.last_name" [attr.aria-invalid]="fieldErrors()['last_name'] ? 'true' : null" />@if (fieldErrors()['last_name']; as m) { <div class="error-text">{{ m }}</div> }</div>
            <div class="field"><label for="p-email">Parent's email</label><input id="p-email" name="email" type="email" [(ngModel)]="f.email" [attr.aria-invalid]="fieldErrors()['email'] ? 'true' : null" />@if (fieldErrors()['email']; as m) { <div class="error-text">{{ m }}</div> }</div>
            <div class="field"><label for="p-mobile">Mobile (optional)</label><input id="p-mobile" name="mobile" type="tel" [(ngModel)]="f.mobile" [attr.aria-invalid]="fieldErrors()['mobile'] ? 'true' : null" />@if (fieldErrors()['mobile']; as m) { <div class="error-text">{{ m }}</div> }</div>
            <div class="field" style="grid-column: 1 / -1"><label for="p-student">Child's email (a student here)</label><input id="p-student" name="student" type="email" [(ngModel)]="f.student_email" [attr.aria-invalid]="fieldErrors()['student_email'] ? 'true' : null" />@if (fieldErrors()['student_email']; as m) { <div class="error-text">{{ m }}</div> }</div>
          </div>
          <p class="soft">If this parent already exists, the child is added to them.</p>
          <div class="row">
            <button class="btn" type="submit" id="parent-save" [disabled]="busy()"><app-icon name="check" [size]="16" /> Add</button>
            <button class="btn secondary" type="button" id="parent-cancel" (click)="form.set(null)">Cancel</button>
          </div>
        </form>
      </section>
    }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (!parents().length) {
      <div class="empty-state" id="no-parents"><app-icon name="users" [size]="32" /><p>No parents yet</p></div>
    } @else {
      <div class="table-wrap">
        <table class="compact" id="parents">
          <thead><tr><th>Parent</th><th>Children</th><th></th></tr></thead>
          <tbody>
            @for (p of parents(); track p.email) {
              <tr [attr.data-parent]="p.email">
                <td><strong>{{ p.name }}</strong><div class="soft">{{ p.email }}@if (p.mobile) { · {{ p.mobile }} }</div></td>
                <td>
                  @for (c of p.children; track c.email) {
                    <span class="chip" [attr.data-child]="c.email">{{ c.name }}
                      <button class="icon-btn" type="button" [attr.title]="'Unlink ' + c.name" [disabled]="busy()" (click)="unlink(p, c.email)"><app-icon name="x" [size]="12" /></button>
                    </span>
                  } @empty { <span class="soft">No child linked</span> }
                </td>
                <td style="text-align: right">
                  @if (confirming() === p.email) {
                    <button class="btn small danger" type="button" [disabled]="busy()" (click)="remove(p)">Yes, remove</button>
                    <button class="btn small secondary" type="button" title="Keep" (click)="confirming.set(null)">No</button>
                  } @else {
                    <button class="icon-btn danger" type="button" title="Remove parent" [disabled]="busy()" (click)="confirming.set(p.email)"><app-icon name="trash" /></button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminParents implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);

  readonly parents = signal<AdminParent[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly notice = signal<string | null>(null);
  readonly form = signal<ParentInput | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly confirming = signal<string | null>(null);
  readonly preview = signal<ParentImport | null>(null);
  private sheet: File | null = null;
  blank = blank;

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.parents.set(await this.api.parents());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  label(status: string): string {
    return { ready: 'Ready', skipped: 'Already linked', error: 'Problem', created: 'Added' }[status] ?? status;
  }

  problems(row: { problems: Record<string, string> }): [string, string][] {
    return Object.entries(row.problems ?? {});
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await work();
    } catch (error) {
      const failure = error as ApiError;
      if (failure.errors) this.fieldErrors.set(failure.errors);
      else this.error.set(failure);
    } finally {
      this.busy.set(false);
    }
  }

  async save(): Promise<void> {
    const f = this.form();
    if (!f || this.busy()) return;
    this.fieldErrors.set({});
    await this.run(async () => {
      this.parents.set(await this.api.addParent(f));
      this.form.set(null);
      this.notice.set('Parent added. They have been emailed how to log in.');
    });
  }

  async remove(parent: AdminParent): Promise<void> {
    this.confirming.set(null);
    await this.run(async () => {
      this.parents.set(await this.api.removeParent(parent.email));
      this.notice.set(`Removed ${parent.name}.`);
    });
  }

  async unlink(parent: AdminParent, child: string): Promise<void> {
    await this.run(async () => {
      this.parents.set(await this.api.unlinkChild(parent.email, child));
      this.notice.set('Unlinked.');
    });
  }

  async downloadTemplate(): Promise<void> {
    this.error.set(null);
    try {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await this.api.parentTemplate());
      link.download = 'parents-template.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async sheetChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy()) return;
    this.sheet = file;
    this.preview.set(null);
    await this.run(async () => this.preview.set(await this.api.importParents(file, false)));
  }

  async confirmImport(): Promise<void> {
    if (!this.sheet) return;
    const file = this.sheet;
    await this.run(async () => {
      this.preview.set(await this.api.importParents(file, true));
      this.parents.set(await this.api.parents());
    });
  }
}

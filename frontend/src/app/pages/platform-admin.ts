import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { formatDate } from '../core/format';
import { ApiError, Institute, InstituteUpdate } from '../core/models';

interface Notice {
  kind: 'ok' | 'warn';
  text: string;
}

interface Draft {
  name: string;
  primary_color: string;
  status: string;
  admin_name: string;
  admin_email: string;
}

const DEFAULT_COLOR = '#2563eb';

function emptyForm() {
  return { slug: '', name: '', primary_color: DEFAULT_COLOR, admin_name: '', admin_email: '' };
}

function fullName(admin: { first_name: string; last_name: string } | null): string {
  return admin ? `${admin.first_name} ${admin.last_name}`.trim() : '';
}

/**
 * The platform admin's page: every institute with its admin. The platform admin can add an institute,
 * and change an institute's name, colour and status, or its admin. There is no way to delete anything here.
 */
@Component({
  selector: 'app-platform-admin',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="row spread">
      <div>
        <h1>Institutes</h1>
        <p class="muted">Every institute on PragyaPrep, and who runs it.</p>
      </div>
      @if (!adding()) {
        <button class="btn" type="button" (click)="startAdd()">Add an institute</button>
      }
    </div>

    @if (notice(); as n) {
      <div class="alert" [class]="'alert ' + n.kind" role="status">{{ n.text }}</div>
    }
    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (adding()) {
      <div class="card">
        <h2>Add an institute</h2>
        <form (ngSubmit)="create()" novalidate>
          <div class="grid-2">
            <div class="field">
              <label for="new-slug">Short name</label>
              <input id="new-slug" name="slug" type="text" [(ngModel)]="form.slug" autocomplete="off" autocapitalize="none" />
              <div class="hint">3 to 30 letters, digits or hyphens, starting with a letter. It is part of the web address and can't be changed later.</div>
            </div>
            <div class="field">
              <label for="new-name">Institute name</label>
              <input id="new-name" name="name" type="text" [(ngModel)]="form.name" />
            </div>
          </div>
          <div class="field">
            <label for="new-color">Main colour</label>
            <input id="new-color" name="color" type="color" [(ngModel)]="form.primary_color" />
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="new-admin-name">Admin's full name</label>
              <input id="new-admin-name" name="adminName" type="text" [(ngModel)]="form.admin_name" />
            </div>
            <div class="field">
              <label for="new-admin-email">Admin's email</label>
              <input id="new-admin-email" name="adminEmail" type="email" [(ngModel)]="form.admin_email" autocomplete="off" />
            </div>
          </div>
          <p class="hint">The admin is approved straight away and gets an email. They log in with a code sent to that address.</p>
          <div class="actions">
            <button class="btn" type="submit" [disabled]="saving()">{{ saving() ? 'Creating…' : 'Create institute' }}</button>
            <button class="btn secondary" type="button" (click)="adding.set(false)">Cancel</button>
          </div>
        </form>
      </div>
    }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else {
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Institute</th><th>Status</th><th>Admin</th><th>Created</th><th><span class="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            @for (institute of institutes(); track institute.slug) {
              @if (editing() === institute.slug) {
                <tr>
                  <td colspan="5">
                    <h2>Edit {{ institute.name }} <span class="muted small">({{ institute.slug }})</span></h2>
                    <div class="grid-2">
                      <div class="field">
                        <label [attr.for]="'name-' + institute.slug">Institute name</label>
                        <input [id]="'name-' + institute.slug" name="name" type="text" [(ngModel)]="draft.name" />
                      </div>
                      <div class="field">
                        <label [attr.for]="'color-' + institute.slug">Main colour</label>
                        <input [id]="'color-' + institute.slug" name="color" type="color" [(ngModel)]="draft.primary_color" />
                      </div>
                    </div>
                    <div class="field">
                      <label [attr.for]="'status-' + institute.slug">Status</label>
                      <select [id]="'status-' + institute.slug" name="status" [(ngModel)]="draft.status">
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                      @if (draft.status === 'suspended' && institute.status !== 'suspended') {
                        <div class="hint" role="note">Everyone at this institute will be locked out until you set it back to Active.</div>
                      }
                    </div>
                    <div class="grid-2">
                      <div class="field">
                        <label [attr.for]="'admin-name-' + institute.slug">Admin's full name</label>
                        <input [id]="'admin-name-' + institute.slug" name="adminName" type="text" [(ngModel)]="draft.admin_name" />
                      </div>
                      <div class="field">
                        <label [attr.for]="'admin-email-' + institute.slug">Admin's email</label>
                        <input [id]="'admin-email-' + institute.slug" name="adminEmail" type="email" [(ngModel)]="draft.admin_email" autocomplete="off" />
                      </div>
                    </div>
                    @if (replacingAdmin(institute)) {
                      <div class="alert warn" role="note">
                        <strong>{{ draft.admin_email.trim() }}</strong> will become the admin and get an email.
                        @if (institute.admin) { {{ institute.admin.email }} will be switched off. }
                        <div>They will be called <strong>{{ draft.admin_name.trim() || '(no name yet)' }}</strong>. Change the name above if this is a different person.</div>
                      </div>
                    }
                    <p class="hint">Institutes can't be deleted here. To pause one, set it to Suspended.</p>
                    <div class="actions">
                      <button class="btn" type="button" [disabled]="saving()" (click)="saveEdit(institute)">
                        {{ replacingAdmin(institute) ? 'Save and switch admin' : 'Save' }}
                      </button>
                      <button class="btn secondary" type="button" (click)="editing.set(null)">Cancel</button>
                    </div>
                  </td>
                </tr>
              } @else {
                <tr [attr.data-institute]="institute.slug">
                  <td>
                    <span class="swatch" [style.background]="institute.primary_color" aria-hidden="true"></span>
                    <strong>{{ institute.name }}</strong>
                    <div class="muted small">{{ institute.slug }}</div>
                  </td>
                  <td><span class="chip" [class]="'chip ' + (institute.status === 'active' ? 'open' : 'suspended')">{{ institute.status }}</span></td>
                  <td>
                    @if (institute.admin; as admin) {
                      {{ name(admin) }}
                      <div class="muted small">{{ admin.email }}</div>
                    } @else {
                      <span class="muted">No admin on record</span>
                    }
                  </td>
                  <td>{{ date(institute.created_at) }}</td>
                  <td>
                    <div class="row">
                      <button class="btn secondary small" type="button" (click)="startEdit(institute)">Edit</button>
                      <a class="btn secondary small" [routerLink]="['/', institute.slug, 'login']">Open page</a>
                    </div>
                  </td>
                </tr>
              }
            } @empty {
              <tr><td colspan="5" class="empty">No institutes yet. Add the first one.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class PlatformAdmin implements OnInit {
  private readonly api = inject(ApiService);

  readonly institutes = signal<Institute[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly adding = signal(false);
  readonly editing = signal<string | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly notice = signal<Notice | null>(null);

  form = emptyForm();
  draft: Draft = { name: '', primary_color: DEFAULT_COLOR, status: 'active', admin_name: '', admin_email: '' };

  readonly date = formatDate;
  readonly name = fullName;

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.institutes.set(await this.api.institutes());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  startAdd(): void {
    this.form = emptyForm();
    this.editing.set(null);
    this.error.set(null);
    this.notice.set(null);
    this.adding.set(true);
  }

  startEdit(institute: Institute): void {
    this.draft = {
      name: institute.name,
      primary_color: institute.primary_color,
      status: institute.status,
      admin_name: fullName(institute.admin),
      admin_email: institute.admin?.email ?? '',
    };
    this.adding.set(false);
    this.error.set(null);
    this.notice.set(null);
    this.editing.set(institute.slug);
  }

  /** True when the typed email is a different person from the current admin. */
  replacingAdmin(institute: Institute): boolean {
    const typed = this.draft.admin_email.trim().toLowerCase();
    return typed !== '' && typed !== (institute.admin?.email ?? '').toLowerCase();
  }

  async create(): Promise<void> {
    await this.run(async () => {
      const result = await this.api.createInstitute({ ...this.form, slug: this.form.slug.trim() });
      this.adding.set(false);
      this.notice.set(
        result.new_admin_notified
          ? { kind: 'ok', text: `Created ${result.institute.name}. We emailed ${result.institute.admin?.email}.` }
          : {
              kind: 'warn',
              text: `Created ${result.institute.name}, but the email to ${result.institute.admin?.email} could not be sent. Tell them they can log in with that address.`,
            },
      );
    });
  }

  async saveEdit(institute: Institute): Promise<void> {
    // Only what changed is sent, so a name change can't overwrite anything else.
    const changes: InstituteUpdate = {};
    const draft = this.draft;
    if (draft.name.trim() !== institute.name) changes.name = draft.name;
    if (draft.primary_color.toLowerCase() !== institute.primary_color.toLowerCase()) changes.primary_color = draft.primary_color;
    if (draft.status !== institute.status) changes.status = draft.status;
    const replacing = this.replacingAdmin(institute);
    // A new admin always gets the name shown on screen, so they can't silently inherit the old admin's.
    if (replacing || draft.admin_name.trim() !== fullName(institute.admin)) changes.admin_name = draft.admin_name;
    if (replacing) changes.admin_email = draft.admin_email;

    if (Object.keys(changes).length === 0) {
      this.editing.set(null);
      this.notice.set({ kind: 'ok', text: `No changes to ${institute.name}.` });
      return;
    }

    await this.run(async () => {
      const result = await this.api.updateInstitute(institute.slug, changes);
      this.editing.set(null);
      if (result.new_admin_notified === false) {
        this.notice.set({
          kind: 'warn',
          text: `Saved ${result.institute.name}, but the email to the new admin could not be sent. Tell them they can log in with ${result.institute.admin?.email}.`,
        });
      } else if (result.new_admin_notified) {
        this.notice.set({ kind: 'ok', text: `Saved ${result.institute.name}. We emailed the new admin, ${result.institute.admin?.email}.` });
      } else {
        this.notice.set({ kind: 'ok', text: `Saved ${result.institute.name}.` });
      }
    });
  }

  /** Do a change, then show the fresh list. A problem is shown at the top, and the form stays open so nothing is lost. */
  private async run(change: () => Promise<void>): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await change();
      this.institutes.set(await this.api.institutes());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.saving.set(false);
    }
  }
}

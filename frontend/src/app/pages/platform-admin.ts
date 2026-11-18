import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { formatDate, logoSrc } from '../core/format';
import { ApiError, Institute, InstituteUpdate } from '../core/models';
import { UploadService } from '../core/upload.service';

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
  plan: string;
}

const DEFAULT_COLOR = '#2563eb';

/** The plan an institute is on. An older one that says paid is premium. */
export function planOf(institute: { plan?: string }): string {
  return institute.plan === 'free' || institute.plan === 'popular' ? institute.plan : 'premium';
}

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
            <tr><th>Institute</th><th>Plan</th><th>Status</th><th>Admin</th><th>Created</th><th><span class="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            @for (institute of institutes(); track institute.slug) {
              @if (editing() === institute.slug) {
                <tr>
                  <td colspan="6">
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
                      <label [attr.for]="'plan-' + institute.slug">Plan</label>
                      <select [id]="'plan-' + institute.slug" name="plan" [(ngModel)]="draft.plan">
                        <option value="free">Free (1 student, 1 parent)</option>
                        <option value="popular">Popular</option>
                        <option value="premium">Premium</option>
                      </select>
                      <div class="hint">Moving to Free does not remove anyone already approved; it stops new approvals over the limit.</div>
                    </div>
                    @if (institute.profile; as p) {
                      <div class="field" [attr.data-details]="institute.slug">
                        <span class="label">Details the institute shows (they edit these)</span>
                        <p class="muted small">
                          {{ p.city || 'No city' }} · {{ p.contact_email || 'no email' }} · {{ p.contact_phone || 'no phone' }} · {{ p.website || 'no website' }}
                          @if (p.exam_categories.length) { · {{ p.exam_categories.join(', ') }} }
                        </p>
                        @if (p.description) { <p class="muted small">{{ p.description }}</p> }
                      </div>
                    }
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
                    <div class="field logo-field" [attr.data-logo]="institute.slug">
                      <span class="label">Logo</span>
                      @if (logo(institute.logo_url); as src) {
                        <div class="row">
                          <img class="logo-preview" [src]="src" [alt]="'Current logo of ' + institute.name" />
                          <button class="btn danger small" type="button" [disabled]="logoBusy()" (click)="removeLogo(institute)">Remove logo</button>
                        </div>
                      } @else {
                        <p class="muted small">No logo yet. The name is shown on its own.</p>
                      }
                      <label class="sr-only" [attr.for]="'logo-' + institute.slug">Choose a logo picture</label>
                      <input [id]="'logo-' + institute.slug" name="logo" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" (change)="logoPicked($event)" [disabled]="logoBusy()" />
                      @if (logoBusy()) {
                        <div role="status">
                          @if (logoStage() === 'sending') {
                            <label [attr.for]="'logo-bar-' + institute.slug">Uploading… {{ logoPercent() }}%</label>
                            <progress [id]="'logo-bar-' + institute.slug" max="100" [value]="logoPercent()" style="width: 100%"></progress>
                          } @else { <span class="muted">Checking the picture…</span> }
                        </div>
                      }
                      <div class="actions">
                        <button class="btn secondary small" type="button" [disabled]="logoBusy() || !logoFile" (click)="uploadLogo(institute)">{{ institute.logo_url ? 'Replace logo' : 'Upload logo' }}</button>
                      </div>
                      <div class="hint">A PNG or JPG picture, up to 1 MB. It shows next to the name at the top of every page. It is saved straight away, without pressing Save.</div>
                    </div>
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
                    @if (institute.counts; as c) { <div class="muted small" [attr.data-counts]="institute.slug">{{ c.students }} student{{ c.students === 1 ? '' : 's' }}, {{ c.parents }} parent{{ c.parents === 1 ? '' : 's' }}, {{ c.courses }} course{{ c.courses === 1 ? '' : 's' }}@if (c.pending) {, {{ c.pending }} waiting}</div> }
                  </td>
                  <td><span class="chip approved" [attr.data-plan]="institute.slug">{{ planOf(institute) }}</span></td>
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
  draft: Draft = { name: '', primary_color: DEFAULT_COLOR, status: 'active', admin_name: '', admin_email: '', plan: 'premium' };

  readonly logo = logoSrc;
  readonly planOf = planOf;
  private readonly uploader = inject(UploadService);
  readonly logoBusy = signal(false);
  readonly logoStage = signal<'sending' | 'checking'>('sending');
  readonly logoPercent = signal(0);
  logoFile: File | null = null;

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

  logoPicked(event: Event): void {
    this.logoFile = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  /** Three steps, like any upload: ask, send to storage, then have the API check the picture. It applies at once. */
  async uploadLogo(institute: Institute): Promise<void> {
    const file = this.logoFile;
    if (!file || this.logoBusy()) return;
    this.logoBusy.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.logoPercent.set(0);
    this.logoStage.set('sending');
    try {
      const started = await this.api.startLogoUpload(institute.slug, { filename: file.name, size: file.size });
      await this.uploader.send(started.upload, file, (percent) => this.logoPercent.set(percent));
      this.logoStage.set('checking');
      await this.api.finishLogoUpload(institute.slug);
      this.notice.set({ kind: 'ok', text: `Updated the logo of ${institute.name}.` });
      this.logoFile = null;
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.logoBusy.set(false);
    }
    await this.refreshList();
  }

  async removeLogo(institute: Institute): Promise<void> {
    if (this.logoBusy()) return;
    this.logoBusy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.api.removeLogo(institute.slug);
      this.notice.set({ kind: 'ok', text: `Removed the logo of ${institute.name}.` });
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.logoBusy.set(false);
    }
    await this.refreshList();
  }

  /** The edit form stays open, with what was typed, while the list behind it is refreshed. */
  private async refreshList(): Promise<void> {
    try {
      this.institutes.set(await this.api.institutes());
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  startEdit(institute: Institute): void {
    this.logoFile = null;
    this.draft = {
      name: institute.name,
      primary_color: institute.primary_color,
      status: institute.status,
      admin_name: fullName(institute.admin),
      admin_email: institute.admin?.email ?? '',
      plan: planOf(institute),
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
    if (draft.plan !== planOf(institute)) changes.plan = draft.plan;
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

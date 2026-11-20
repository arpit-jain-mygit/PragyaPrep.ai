import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { logoSrc } from '../core/format';
import { ApiError, MyInstitute } from '../core/models';
import { ProfileService } from '../core/profile.service';
import { contrastRatio, suggestedTextColor, TenantService } from '../core/tenant.service';
import { UploadService } from '../core/upload.service';
import { Icon } from '../ui/icon';
import { PhotoPicker } from '../ui/photo-picker';

/**
 * The institute admin's own page: how the institute looks and how to reach it (shown to students and visitors), and the
 * admin's own name, mobile and photo. The login email and the plan are not edited here.
 */
@Component({
  selector: 'app-admin-institute',
  imports: [FormsModule, Icon, PhotoPicker],
  template: `
    <div class="page-head"><h1><app-icon name="building" /> My institute</h1></div>
    @if (loadError(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
    @if (me(); as m) {
      <form (ngSubmit)="save()" novalidate>
        @if (error(); as problem) { <div class="alert error" role="alert" id="save-error">{{ problem.detail }}</div> }
        @if (saved()) { <div class="alert ok" role="status" id="saved"><app-icon name="check" [size]="16" /> Saved.</div> }
      <section class="card" id="institute-card">
        <h2>Your institute</h2>
        <p class="hint" id="public-note"><app-icon name="eye" [size]="15" /> These details are shown to your students and to visitors.</p>

        <div class="field logo-field">
          <span class="label">Logo</span>
          <div class="row">
            @if (logo(m.logo_url); as src) {
              <img class="logo-preview" [src]="src" alt="Your logo" />
              <button class="btn danger small" type="button" id="logo-remove" [disabled]="busy()" (click)="removeLogo()">Remove logo</button>
            }
            <label class="btn secondary small photo-choose">
              <input type="file" id="logo-file" class="sr-only" accept=".png,.jpg,.jpeg,image/png,image/jpeg" [disabled]="busy()" (change)="logoPicked($event)" />
              <app-icon name="upload" [size]="16" /> {{ m.logo_url ? 'Change logo' : 'Add logo' }}
            </label>
          </div>
          <p class="hint">A PNG or JPG up to 1 MB.</p>
          @if (logoError(); as problem) { <div class="error-text" role="alert" id="logo-error">{{ problem.detail }}</div> }
        </div>

        <div class="grid-2">
          <div class="field"><label for="name">Name</label><input id="name" name="name" type="text" [(ngModel)]="name" /></div>
          <div class="field">
            <label for="color">Brand colour</label>
            <input id="color" name="color" type="color" [(ngModel)]="color" (ngModelChange)="ink = suggestedTextColor($event)" />
            <p class="hint">Used for buttons and the top bar.</p>
          </div>
          <div class="field">
            <label for="ink">Text colour on white</label>
            <div class="row">
              <input id="ink" name="ink" type="color" [(ngModel)]="ink" aria-describedby="ink-hint" />
              <button class="btn secondary small" type="button" id="ink-suggest" (click)="ink = suggestedTextColor(color)">Use suggested</button>
            </div>
            <p class="hint" id="ink-hint" [class.error-text]="!inkReadable()">{{ inkHint() }}</p>
          </div>
          <div class="field"><label for="city">City</label><input id="city" name="city" type="text" placeholder="Noida" [(ngModel)]="city" /></div>
          <div class="field"><label for="website">Website</label><input id="website" name="website" type="text" placeholder="https://example.com" [(ngModel)]="website" autocapitalize="none" /></div>
          <div class="field"><label for="contactEmail">Contact email</label><input id="contactEmail" name="contactEmail" type="email" placeholder="hello@example.com" [(ngModel)]="contactEmail" /></div>
          <div class="field"><label for="contactPhone">Contact phone</label><input id="contactPhone" name="contactPhone" type="tel" placeholder="10-digit number" [(ngModel)]="contactPhone" /></div>
        </div>
        <div class="field">
          <label for="description">About your institute</label>
          <textarea id="description" name="description" rows="3" maxlength="300" placeholder="A line or two about what you teach." [(ngModel)]="description"></textarea>
          <p class="hint">{{ description.length }} of 300 characters.</p>
        </div>
        <div class="field">
          <label for="categories">Exams you prepare students for</label>
          <input id="categories" name="categories" type="text" placeholder="CLAT, CUET, CAT" [(ngModel)]="categories" />
          <p class="hint">Up to 8, separated by commas.</p>
        </div>

      </section>

      <section class="card" id="you-card">
        <h2>You</h2>
        <div class="row" style="margin-bottom: 0.8rem">
          <app-photo-picker [current]="m.admin.avatar_url" [first]="firstName" [last]="lastName" [email]="m.admin.email" [disabled]="busy()" (photo)="photoChosen($event)" />
        </div>
        @if (photoError(); as problem) { <div class="alert error" role="alert" id="photo-problem">{{ problem.detail }}</div> }
        <div class="grid-2">
          <div class="field"><label for="firstName">First name</label><input id="firstName" name="firstName" type="text" [(ngModel)]="firstName" autocomplete="given-name" /></div>
          <div class="field"><label for="lastName">Last name</label><input id="lastName" name="lastName" type="text" [(ngModel)]="lastName" autocomplete="family-name" /></div>
          <div class="field"><label for="mobile">Your mobile</label><input id="mobile" name="mobile" type="tel" placeholder="10-digit number" [(ngModel)]="mobile" autocomplete="tel" /></div>
          <div class="field"><span class="label">Login email</span><p class="muted" id="login-email">{{ m.admin.email }}</p><p class="hint">Ask the PragyaPrep team to change it.</p></div>
        </div>
      </section>
        <button class="btn" type="submit" id="save" [disabled]="busy()"><app-icon name="check" [size]="16" /> {{ busy() ? 'Saving…' : 'Save' }}</button>
      </form>
    } @else if (!loadError()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class AdminInstitutePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly uploader = inject(UploadService);
  private readonly tenants = inject(TenantService);
  private readonly shared = inject(ProfileService);

  readonly logo = logoSrc;
  readonly me = signal<MyInstitute | null>(null);
  readonly loadError = signal<ApiError | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly logoError = signal<ApiError | null>(null);
  readonly photoError = signal<ApiError | null>(null);
  readonly busy = signal(false);
  readonly saved = signal(false);

  name = '';
  color = '#2563eb';
  /** The text colour for words on white. It starts as the suggestion for the brand colour. */
  ink = '#2563eb';
  readonly suggestedTextColor = suggestedTextColor;
  city = '';
  website = '';
  contactEmail = '';
  contactPhone = '';
  description = '';
  categories = '';
  firstName = '';
  lastName = '';
  mobile = '';

  async ngOnInit(): Promise<void> {
    try {
      this.show(await this.api.myInstitute());
    } catch (error) {
      this.loadError.set(error as ApiError);
    }
  }

  private baseline = '';

  private snapshot(): string {
    return JSON.stringify([this.name, this.color, this.ink, this.city, this.website, this.contactEmail, this.contactPhone, this.description, this.categories.trim(), this.firstName, this.lastName, this.mobile]);
  }

  /** True when something was typed and not saved yet. */
  hasUnsaved(): boolean {
    return this.me() !== null && this.snapshot() !== this.baseline;
  }

  private show(m: MyInstitute): void {
    this.me.set(m);
    this.shared.avatarUrl.set(m.admin.avatar_url ?? '');
    this.name = m.name;
    this.color = m.primary_color;
    this.ink = m.text_color || suggestedTextColor(m.primary_color);
    this.city = m.profile.city;
    this.website = m.profile.website;
    this.contactEmail = m.profile.contact_email;
    this.contactPhone = m.profile.contact_phone;
    this.description = m.profile.description;
    this.categories = m.profile.exam_categories.join(', ');
    this.firstName = m.admin.first_name;
    this.lastName = m.admin.last_name;
    this.mobile = m.admin.mobile;
    this.baseline = this.snapshot();
  }

  /** Whether the chosen text colour reads well on white (at least 4.5 to 1). */
  inkReadable(): boolean {
    return contrastRatio(this.ink, '#ffffff') >= 4.5;
  }

  /** What the admin sees under the text colour: the contrast, or why it is too light. */
  inkHint(): string {
    const ratio = contrastRatio(this.ink, '#ffffff').toFixed(1);
    return this.inkReadable()
      ? `Reads well on white (${ratio} to 1).`
      : `Too light to read on white (${ratio} to 1). Pick a darker colour, or use the suggestion.`;
  }

  /** The top bar and the institute's look follow what was just saved. */
  private async refreshLook(m: MyInstitute): Promise<void> {
    const info = this.tenants.info();
    if (!info) return;
    this.tenants.update({ ...info, name: m.name, branding: { ...info.branding, display_name: m.name, primary_color: m.primary_color, text_color: m.text_color, logo_url: m.logo_url }, profile: m.profile });
  }

  async save(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      const m = await this.api.saveMyInstitute({
        name: this.name, primary_color: this.color, text_color: this.ink, city: this.city, website: this.website, contact_email: this.contactEmail, contact_phone: this.contactPhone,
        description: this.description, exam_categories: this.categories.split(',').map((x) => x.trim()).filter(Boolean),
        admin_first_name: this.firstName, admin_last_name: this.lastName, admin_mobile: this.mobile,
      });
      this.show(m);
      await this.refreshLook(m);
      this.saved.set(true);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async logoPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy()) return;
    this.busy.set(true);
    this.logoError.set(null);
    try {
      const started = await this.api.startInstituteLogo({ filename: file.name, size: file.size });
      await this.uploader.send(started.upload, file, () => undefined);
      const m = await this.api.finishInstituteLogo();
      this.me.update((old) => (old ? { ...old, logo_url: m.logo_url } : m));
      await this.refreshLook(m);
    } catch (error) {
      this.logoError.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async removeLogo(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.logoError.set(null);
    try {
      const m = await this.api.removeInstituteLogo();
      this.me.update((old) => (old ? { ...old, logo_url: null } : m));
      await this.refreshLook(m);
    } catch (error) {
      this.logoError.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async photoChosen(photo: Blob | null): Promise<void> {
    this.busy.set(true);
    this.photoError.set(null);
    try {
      if (photo) {
        const start = await this.api.startAdminPhoto();
        await this.uploader.send(start.upload, new File([photo], 'photo.jpg', { type: 'image/jpeg' }), () => undefined);
        const m = await this.api.finishAdminPhoto(start.key);
        this.me.update((old) => (old ? { ...old, admin: { ...old.admin, avatar_url: m.admin.avatar_url } } : m));
        this.shared.avatarUrl.set(m.admin.avatar_url);
      } else {
        const m = await this.api.removeAdminPhoto();
        this.me.update((old) => (old ? { ...old, admin: { ...old.admin, avatar_url: '' } } : m));
        this.shared.avatarUrl.set('');
      }
    } catch (error) {
      this.photoError.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }
}

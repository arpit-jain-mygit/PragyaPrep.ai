import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { GENDER_LABELS, formatDate, formatDateTime } from '../core/format';
import { AdminCourse, ApiError, DecisionAction, Registration, RegistrationEdit } from '../core/models';

interface Draft {
  email: string; first_name: string; last_name: string; birth_date: string; gender: string; mobile: string;
  same: boolean; whatsapp: string; address: string; city: string; pin_code: string; course_id: string;
}

function emptyDraft(): Draft {
  return {
    email: '', first_name: '', last_name: '', birth_date: '', gender: 'female', mobile: '',
    same: true, whatsapp: '', address: '', city: '', pin_code: '', course_id: '',
  };
}

const TABS = ['pending', 'approved', 'rejected', 'suspended', 'all'] as const;

interface Notice {
  kind: 'ok' | 'warn' | 'error';
  text: string;
}

/** The admin's review queue: look at each registration, correct its details, then approve, reject, suspend or reactivate it. */
@Component({
  selector: 'app-admin-registrations',
  imports: [FormsModule],
  template: `
    <h1>Registrations</h1>
    <p class="muted">Review who has registered, and decide who may log in.</p>

    <div class="tabs" role="tablist" aria-label="Registration status">
      @for (tab of tabs; track tab) {
        <button class="tab" role="tab" type="button" [attr.aria-selected]="tab === active()" (click)="show(tab)">{{ tab }}</button>
      }
    </div>

    @if (notice(); as n) {
      <div class="alert" [class]="'alert ' + n.kind" [attr.role]="n.kind === 'error' ? 'alert' : 'status'">{{ n.text }}</div>
    }
    @if (loadError(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (items().length === 0 && !loadError()) {
      <div class="empty">No {{ active() === 'all' ? '' : active() }} registrations.</div>
    }

    @for (person of items(); track person.email) {
      <article class="item" [attr.data-email]="person.email">
        <div class="item-head">
          <div>
            <div class="item-title">{{ person.first_name }} {{ person.last_name }}</div>
            <div class="muted small">{{ person.email }}</div>
            <div class="small">{{ person.course_name }} &middot; registered {{ when(person.created_at) }}</div>
          </div>
          <span class="chip" [class]="'chip ' + person.status">{{ person.status }}</span>
        </div>

        @if (isOpen(person.email)) {
          <dl class="details">
            <dt>Birth date</dt><dd>{{ date(person.birth_date) }}</dd>
            <dt>Gender</dt><dd>{{ gender(person.gender) }}</dd>
            <dt>Mobile</dt><dd>{{ person.mobile }}</dd>
            <dt>WhatsApp</dt><dd>{{ person.whatsapp }}</dd>
            <dt>Address</dt><dd>{{ person.address }}, {{ person.city }} {{ person.pin_code }}</dd>
            @if (person.decided_by) {
              <dt>Last decision</dt><dd>by {{ person.decided_by }}, {{ when(person.decided_at) }}</dd>
            }
            @if (person.reason) { <dt>Reason given</dt><dd>{{ person.reason }}</dd> }
            @if (person.edited_by) { <dt>Last edit</dt><dd>by {{ person.edited_by }}, {{ when(person.edited_at ?? '') }}</dd> }
            @if (person.previous_email) { <dt>Earlier email</dt><dd>{{ person.previous_email }}</dd> }
          </dl>
        }

        @if (editing() === person.email) {
          <form class="edit" (ngSubmit)="saveEdit(person)" novalidate>
            @if (editError(); as problem) { <div class="alert error" role="alert">{{ problem }}</div> }
            <div class="field">
              <label for="e-email">Email</label>
              <input id="e-email" name="email" type="email" [(ngModel)]="draft.email" (input)="clearError('email')" autocomplete="off" [attr.aria-invalid]="fieldErrors()['email'] ? 'true' : null" />
              @if (fieldErrors()['email']) { <div class="error-text">{{ fieldErrors()['email'] }}</div> }
              @if (emailChanged(person)) {
                <div class="alert warn" role="note">The student will log in with <strong>{{ draft.email.trim() }}</strong> from now on, and {{ person.email }} will stop working. We'll email the new address.</div>
              }
            </div>
            <div class="grid-2">
              <div class="field">
                <label for="e-first_name">First name</label>
                <input id="e-first_name" name="first_name" type="text" [(ngModel)]="draft.first_name" (input)="clearError('first_name')" [attr.aria-invalid]="fieldErrors()['first_name'] ? 'true' : null" />
                @if (fieldErrors()['first_name']) { <div class="error-text">{{ fieldErrors()['first_name'] }}</div> }
              </div>
              <div class="field">
                <label for="e-last_name">Last name</label>
                <input id="e-last_name" name="last_name" type="text" [(ngModel)]="draft.last_name" (input)="clearError('last_name')" [attr.aria-invalid]="fieldErrors()['last_name'] ? 'true' : null" />
                @if (fieldErrors()['last_name']) { <div class="error-text">{{ fieldErrors()['last_name'] }}</div> }
              </div>
            </div>
            <div class="grid-2">
              <div class="field">
                <label for="e-birth_date">Birth date</label>
                <input id="e-birth_date" name="birth_date" type="date" [(ngModel)]="draft.birth_date" (input)="clearError('birth_date')" [attr.aria-invalid]="fieldErrors()['birth_date'] ? 'true' : null" />
                @if (fieldErrors()['birth_date']) { <div class="error-text">{{ fieldErrors()['birth_date'] }}</div> }
              </div>
              <div class="field">
                <label for="e-gender">Gender</label>
                <select id="e-gender" name="gender" [(ngModel)]="draft.gender" (change)="clearError('gender')">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
                @if (fieldErrors()['gender']) { <div class="error-text">{{ fieldErrors()['gender'] }}</div> }
              </div>
            </div>
            <div class="field">
              <label for="e-mobile">Mobile number</label>
              <input id="e-mobile" name="mobile" type="tel" [(ngModel)]="draft.mobile" (input)="clearError('mobile')" [attr.aria-invalid]="fieldErrors()['mobile'] ? 'true' : null" />
              @if (fieldErrors()['mobile']) { <div class="error-text">{{ fieldErrors()['mobile'] }}</div> }
            </div>
            <div class="check">
              <input id="e-same" name="same" type="checkbox" [(ngModel)]="draft.same" />
              <label for="e-same" style="margin: 0; font-weight: 400">WhatsApp number is the same as the mobile number</label>
            </div>
            @if (!draft.same) {
              <div class="field">
                <label for="e-whatsapp">WhatsApp number</label>
                <input id="e-whatsapp" name="whatsapp" type="tel" [(ngModel)]="draft.whatsapp" (input)="clearError('whatsapp')" [attr.aria-invalid]="fieldErrors()['whatsapp'] ? 'true' : null" />
                @if (fieldErrors()['whatsapp']) { <div class="error-text">{{ fieldErrors()['whatsapp'] }}</div> }
              </div>
            }
            <div class="field">
              <label for="e-address">Complete address</label>
              <textarea id="e-address" name="address" [(ngModel)]="draft.address" (input)="clearError('address')" [attr.aria-invalid]="fieldErrors()['address'] ? 'true' : null"></textarea>
              @if (fieldErrors()['address']) { <div class="error-text">{{ fieldErrors()['address'] }}</div> }
            </div>
            <div class="grid-2">
              <div class="field">
                <label for="e-city">City</label>
                <input id="e-city" name="city" type="text" [(ngModel)]="draft.city" (input)="clearError('city')" [attr.aria-invalid]="fieldErrors()['city'] ? 'true' : null" />
                @if (fieldErrors()['city']) { <div class="error-text">{{ fieldErrors()['city'] }}</div> }
              </div>
              <div class="field">
                <label for="e-pin_code">PIN code</label>
                <input id="e-pin_code" name="pin_code" type="text" [(ngModel)]="draft.pin_code" (input)="clearError('pin_code')" maxlength="6" [attr.aria-invalid]="fieldErrors()['pin_code'] ? 'true' : null" />
                @if (fieldErrors()['pin_code']) { <div class="error-text">{{ fieldErrors()['pin_code'] }}</div> }
              </div>
            </div>
            <div class="field">
              <label for="e-course_id">Course</label>
              <select id="e-course_id" name="course_id" [(ngModel)]="draft.course_id" (change)="clearError('course_id')">
                @for (course of courses(); track course.id) {
                  <option [value]="course.id">{{ course.name }}</option>
                }
              </select>
              @if (fieldErrors()['course_id']) { <div class="error-text">{{ fieldErrors()['course_id'] }}</div> }
            </div>
            <div class="actions">
              <button class="btn small" type="submit" [disabled]="busy() === person.email">{{ emailChanged(person) ? 'Save and change email' : 'Save' }}</button>
              <button class="btn secondary small" type="button" (click)="editing.set(null)">Cancel</button>
            </div>
          </form>
        } @else if (rejecting() === person.email) {
          <div class="field" style="margin-top: 0.75rem">
            <label [attr.for]="'reason-' + person.email">Reason (optional, included in the email to the student)</label>
            <textarea [id]="'reason-' + person.email" name="reason" [(ngModel)]="reason" maxlength="300"></textarea>
          </div>
          <div class="actions">
            <button class="btn danger small" type="button" [disabled]="busy() === person.email" (click)="confirmReject(person)">Reject registration</button>
            <button class="btn secondary small" type="button" (click)="rejecting.set(null)">Cancel</button>
          </div>
        } @else {
          <div class="actions">
            <button class="btn secondary small" type="button" (click)="toggle(person.email)">{{ isOpen(person.email) ? 'Hide details' : 'Show details' }}</button>
            <button class="btn secondary small" type="button" [disabled]="busy() === person.email" (click)="startEdit(person)">Edit</button>
            @if (person.status === 'pending' || person.status === 'rejected') {
              <button class="btn small" type="button" [disabled]="busy() === person.email" (click)="act('approve', person)">Approve</button>
            }
            @if (person.status === 'pending') {
              <button class="btn danger small" type="button" [disabled]="busy() === person.email" (click)="startReject(person.email)">Reject</button>
            }
            @if (person.status === 'approved') {
              <button class="btn danger small" type="button" [disabled]="busy() === person.email" (click)="act('suspend', person)">Suspend</button>
            }
            @if (person.status === 'suspended') {
              <button class="btn small" type="button" [disabled]="busy() === person.email" (click)="act('reactivate', person)">Reactivate</button>
            }
          </div>
        }
      </article>
    }
  `,
})
export class AdminRegistrations implements OnInit {
  private readonly api = inject(ApiService);

  readonly tabs = TABS;
  readonly active = signal<string>('pending');
  readonly items = signal<Registration[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<ApiError | null>(null);
  readonly notice = signal<Notice | null>(null);
  readonly busy = signal<string | null>(null);
  readonly rejecting = signal<string | null>(null);
  readonly open = signal<Set<string>>(new Set());
  reason = '';

  readonly editing = signal<string | null>(null);
  readonly editError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly courses = signal<AdminCourse[]>([]);
  draft = emptyDraft();

  readonly date = formatDate;
  readonly when = formatDateTime;
  readonly gender = (value: string) => GENDER_LABELS[value] ?? value;

  ngOnInit(): void {
    void this.load();
  }

  async show(tab: string): Promise<void> {
    this.active.set(tab);
    this.notice.set(null);
    this.rejecting.set(null);
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.items.set(await this.api.registrations(this.active()));
    } catch (error) {
      this.items.set([]);
      this.loadError.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  isOpen(email: string): boolean {
    return this.open().has(email);
  }

  toggle(email: string): void {
    const next = new Set(this.open());
    next.has(email) ? next.delete(email) : next.add(email);
    this.open.set(next);
  }

  startReject(email: string): void {
    this.reason = '';
    this.rejecting.set(email);
  }

  async confirmReject(person: Registration): Promise<void> {
    await this.act('reject', person, this.reason);
  }

  async act(action: DecisionAction, person: Registration, reason?: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(person.email);
    this.notice.set(null);
    const name = `${person.first_name} ${person.last_name}`.trim();
    try {
      const result = await this.api.decide(action, person.email, reason);
      this.rejecting.set(null);
      const done = { approve: 'Approved', reject: 'Rejected', suspend: 'Suspended', reactivate: 'Reactivated' }[action];
      const emailed = action === 'approve' || action === 'reject';
      if (emailed && !result.email_sent) {
        this.notice.set({
          kind: 'warn',
          text: `${done} ${name}, but the email could not be sent. You may want to tell them yourself.`,
        });
      } else {
        this.notice.set({ kind: 'ok', text: `${done} ${name}.${emailed ? ' We emailed them.' : ''}` });
      }
    } catch (error) {
      // The most common cause is someone else changing the same registration, so show what happened and refresh.
      this.notice.set({ kind: 'error', text: (error as ApiError).detail });
    } finally {
      this.busy.set(null);
    }
    await this.load();
  }

  /** Open the edit form, filled with what the student gave. The course list is fetched the first time. */
  async startEdit(person: Registration): Promise<void> {
    this.notice.set(null);
    this.rejecting.set(null);
    this.editError.set(null);
    this.fieldErrors.set({});
    this.draft = {
      email: person.email, first_name: person.first_name, last_name: person.last_name, birth_date: person.birth_date,
      gender: person.gender, mobile: person.mobile, same: person.whatsapp === person.mobile, whatsapp: person.whatsapp,
      address: person.address, city: person.city, pin_code: person.pin_code, course_id: person.course_id,
    };
    if (this.courses().length === 0) {
      try {
        this.courses.set(await this.api.adminCourses());
      } catch (error) {
        this.notice.set({ kind: 'error', text: (error as ApiError).detail });
        return;
      }
    }
    this.editing.set(person.email);
  }

  emailChanged(person: Registration): boolean {
    const typed = this.draft.email.trim().toLowerCase();
    return typed !== '' && typed !== person.email;
  }

  clearError(field: string): void {
    if (!this.fieldErrors()[field]) return;
    const { [field]: _gone, ...rest } = this.fieldErrors();
    this.fieldErrors.set(rest);
  }

  /** Send only what changed, so a small fix can't overwrite anything else. */
  async saveEdit(person: Registration): Promise<void> {
    if (this.busy()) return;
    const draft = this.draft;
    const changes: RegistrationEdit = {};
    const trimmed = (value: string) => value.trim();
    if (this.emailChanged(person)) changes.email = trimmed(draft.email);
    for (const field of ['first_name', 'last_name', 'birth_date', 'gender', 'mobile', 'address', 'city', 'pin_code', 'course_id'] as const) {
      if (trimmed(draft[field]) !== person[field]) changes[field] = trimmed(draft[field]);
    }
    if (draft.same) {
      if (person.whatsapp !== person.mobile || changes.mobile !== undefined) changes.whatsapp_same_as_mobile = true;
    } else if (trimmed(draft.whatsapp) !== person.whatsapp) {
      changes.whatsapp = trimmed(draft.whatsapp);
    }

    if (Object.keys(changes).length === 0) {
      this.editing.set(null);
      this.notice.set({ kind: 'ok', text: `No changes to ${person.first_name} ${person.last_name}.` });
      return;
    }

    this.busy.set(person.email);
    this.editError.set(null);
    this.fieldErrors.set({});
    try {
      const result = await this.api.editRegistration(person.email, changes);
      const name = `${result.registration.first_name} ${result.registration.last_name}`.trim();
      this.editing.set(null);
      if (changes.email && !result.email_sent) {
        this.notice.set({ kind: 'warn', text: `Saved ${name}, but the email to ${result.registration.email} could not be sent. Tell them to log in with that address.` });
      } else if (changes.email) {
        this.notice.set({ kind: 'ok', text: `Saved ${name}. Their email is now ${result.registration.email}, and we emailed it.` });
      } else {
        this.notice.set({ kind: 'ok', text: `Saved ${name}.` });
      }
    } catch (error) {
      const problem = error as ApiError;
      this.editError.set(problem.detail);
      this.fieldErrors.set(problem.errors ?? {});
      this.busy.set(null);
      return; // the form stays open so nothing typed is lost
    }
    this.busy.set(null);
    await this.load();
  }
}

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { TenantService } from '../core/tenant.service';
import { GENDER_LABELS, formatDate, formatDateTime } from '../core/format';
import { AdminCourse, ApiError, CourseAccess, DecisionAction, Registration, RegistrationEdit } from '../core/models';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

interface Draft {
  email: string; first_name: string; last_name: string; birth_date: string; gender: string; mobile: string;
  same: boolean; whatsapp: string; address: string; city: string; pin_code: string; course_ids: string[];
}

function emptyDraft(): Draft {
  return {
    email: '', first_name: '', last_name: '', birth_date: '', gender: 'female', mobile: '',
    same: true, whatsapp: '', address: '', city: '', pin_code: '', course_ids: [],
  };
}

/** Everything the page shows about a registration, as one lower-case line to search in: names, email, numbers, address,
 * courses, status, who decided or edited, and the dates both as written and as shown. */
export function searchText(person: Registration): string {
  const gender = GENDER_LABELS[person.gender] ?? person.gender;
  return [
    person.first_name, person.last_name, person.email, person.previous_email, person.mobile, person.whatsapp, person.address, person.city, person.pin_code,
    gender, person.gender, person.birth_date, formatDate(person.birth_date), (person.course_names ?? []).join(' '), person.status, person.reason,
    person.decided_by, person.edited_by, person.created_at?.slice(0, 10), formatDateTime(person.created_at), formatDateTime(person.decided_at), formatDateTime(person.edited_at ?? ''),
  ].filter(Boolean).join(' ').toLowerCase();
}

const TABS = ['pending', 'approved', 'rejected', 'suspended', 'all'] as const;

interface Notice {
  kind: 'ok' | 'warn' | 'error';
  text: string;
}

/** The admin's review queue: look at each registration, correct its details, then approve, reject, suspend or reactivate it. */
@Component({
  selector: 'app-admin-registrations',
  imports: [FormsModule, RouterLink, Icon, InfoTip],
  template: `
    <div class="page-head">
      <h1>Registrations <app-info text="Review who has registered, and decide who may log in." /></h1>
      <span class="row">
        <button class="btn secondary small" type="button" id="template" title="Excel template for importing many students" (click)="downloadTemplate()"><app-icon name="download" [size]="16" /> Template</button>
        <a class="btn secondary small" id="import-link" [routerLink]="['/', tenants.slug(), 'admin', 'import-students']"><app-icon name="upload" [size]="16" /> Import</a>
      </span>
    </div>

    <div class="tabs" role="tablist" aria-label="Registration status">
      @for (tab of tabs; track tab) {
        <button class="tab" role="tab" type="button" [attr.aria-selected]="tab === active()" (click)="show(tab)">{{ tab }}</button>
      }
    </div>

    @if (notice(); as n) {
      <div class="alert" [class]="'alert ' + n.kind" [attr.role]="n.kind === 'error' ? 'alert' : 'status'">{{ n.text }}</div>
    }
    @if (loadError(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (items().length > 0) {
      <div class="filters">
        <input type="search" id="search" placeholder="Search name, email, mobile, city, course…" aria-label="Search registrations" [ngModel]="query()" (ngModelChange)="query.set($event ?? '')" [ngModelOptions]="{ standalone: true }" />
        @if (query()) { <button class="icon-btn" type="button" id="clear-search" title="Clear search" (click)="query.set('')"><app-icon name="x" /><span class="sr-only">Clear search</span></button> }
        <span class="soft" id="showing">{{ visible().length === items().length ? items().length + ' shown' : 'Showing ' + visible().length + ' of ' + items().length }}</span>
      </div>
    }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (items().length === 0 && !loadError()) {
      <div class="empty-state"><app-icon name="users" [size]="32" /><p>No {{ active() === 'all' ? '' : active() }} registrations.</p></div>
    } @else if (visible().length === 0 && !loadError()) {
      <div class="empty-state" id="no-match"><app-icon name="search" [size]="32" /><p>No registrations match "{{ query() }}"</p></div>
    }

    @for (person of visible(); track person.email) {
      <article class="item" [attr.data-email]="person.email">
        <div class="item-head">
          <div>
            <div class="item-title">{{ person.first_name }} {{ person.last_name }}</div>
            <div class="muted small">{{ person.email }}</div>
            <div class="small">{{ person.course_names.join(', ') }} &middot; registered {{ when(person.created_at) }}</div>
          </div>
          <span class="status" [class.ok]="person.status === 'approved'" [class.warn]="person.status === 'pending'" [class.bad]="person.status === 'rejected'">{{ person.status }}</span>
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
          @if (person.status === 'approved') {
            <div class="access" [attr.data-access]="person.email">
              <h3>Course access <app-info text="Access lasts as long as the course says. Giving it again starts the length again." /></h3>
              @if (accessNotice(); as n) {
                @if (n.email === person.email) { <div class="alert" [class]="'alert ' + n.kind" role="status">{{ n.text }}</div> }
              }
              @if (access()[person.email]; as given) {
                @for (item of given; track item.course_id) {
                  <div class="row spread access-row">
                    <div>
                      <strong>{{ item.course_name }}</strong>
                      <span class="status" [class.ok]="item.active">{{ item.active ? 'active' : 'ended' }}</span>
                      <div class="muted small">{{ item.expires_at ? (item.active ? 'Ends ' : 'Ended ') + date(item.expires_at) : 'No end date' }} &middot; given by {{ item.granted_by }}</div>
                    </div>
                    <button class="icon-btn danger" type="button" title="Remove" [disabled]="busy() === person.email" (click)="takeAway(person, item)"><app-icon name="trash" /><span class="sr-only">Remove</span></button>
                  </div>
                } @empty {
                  <p class="muted small">No courses yet.</p>
                }
              } @else {
                <p class="muted small">Loading…</p>
              }
              <div class="row">
                <label class="sr-only" [attr.for]="'give-' + person.email">Course to give</label>
                <select [id]="'give-' + person.email" name="give" [(ngModel)]="giveCourse">
                  <option value="">Choose a course…</option>
                  @for (course of courses(); track course.id) { <option [value]="course.id">{{ course.name }}</option> }
                </select>
                <button class="btn small" type="button" [disabled]="!giveCourse || busy() === person.email" (click)="give(person)">Give or renew access</button>
              </div>
              @if (person.course_names.length) {
                <div class="row" style="margin-top: 0.5rem">
                  <button class="btn secondary small" type="button" id="give-requested" [disabled]="busy() === person.email" (click)="giveRequested(person)">
                    <app-icon name="check" [size]="16" /> Give access to all chosen courses
                  </button>
                  <span class="soft">{{ person.course_names.join(', ') }}</span>
                </div>
              }
            </div>
          }
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
            <div class="field" id="e-courses" role="group" aria-label="Courses">
              <span class="label">Courses <app-info text="The courses the student chose. Ticking does not give access: use Course access for that." /></span>
              <div class="row">
                @for (course of editableCourses(person); track course.id) {
                  <label class="check" style="margin: 0 1rem 0.3rem 0">
                    <input type="checkbox" [id]="'e-course-' + course.id" [name]="'e-course-' + course.id" [checked]="draft.course_ids.includes(course.id)" (change)="toggleCourse(course.id, $any($event.target).checked)" />
                    {{ course.name }}
                  </label>
                }
              </div>
              @if (fieldErrors()['course_ids']) { <div class="error-text">{{ fieldErrors()['course_ids'] }}</div> }
            </div>
            <div class="actions">
              <button class="btn small" type="submit" [disabled]="busy() === person.email"><app-icon name="check" [size]="16" /> {{ emailChanged(person) ? 'Save and change email' : 'Save' }}</button>
              <button class="icon-btn" type="button" title="Cancel" (click)="editing.set(null)"><app-icon name="x" /><span class="sr-only">Cancel</span></button>
            </div>
          </form>
        } @else if (rejecting() === person.email) {
          <div class="field" style="margin-top: 0.75rem">
            <label [attr.for]="'reason-' + person.email">Reason (optional, included in the email to the student)</label>
            <textarea [id]="'reason-' + person.email" name="reason" [(ngModel)]="reason" maxlength="300"></textarea>
          </div>
          <div class="actions">
            <button class="btn danger small" type="button" [disabled]="busy() === person.email" (click)="confirmReject(person)"><app-icon name="x" [size]="16" /> Reject registration</button>
            <button class="icon-btn" type="button" title="Cancel" (click)="rejecting.set(null)"><app-icon name="x" /><span class="sr-only">Cancel</span></button>
          </div>
        } @else {
          <div class="actions">
            <button class="icon-btn" type="button" [attr.title]="isOpen(person.email) ? 'Hide details' : 'Show details'" (click)="toggle(person.email)"><app-icon [name]="isOpen(person.email) ? 'chevron-up' : 'chevron'" /><span class="sr-only">{{ isOpen(person.email) ? 'Hide details' : 'Show details' }}</span></button>
            <button class="icon-btn" type="button" title="Edit" [disabled]="busy() === person.email" (click)="startEdit(person)"><app-icon name="edit" /><span class="sr-only">Edit</span></button>
            @if (person.status === 'pending' || person.status === 'rejected') {
              <button class="btn small" type="button" [disabled]="busy() === person.email" (click)="act('approve', person)"><app-icon name="check" [size]="16" /> Approve</button>
            }
            @if (person.status === 'pending') {
              <button class="icon-btn danger" type="button" title="Reject" [disabled]="busy() === person.email" (click)="startReject(person.email)"><app-icon name="x" /><span class="sr-only">Reject</span></button>
            }
            @if (person.status === 'approved') {
              <button class="icon-btn danger" type="button" title="Suspend" [disabled]="busy() === person.email" (click)="act('suspend', person)"><app-icon name="ban" /><span class="sr-only">Suspend</span></button>
            }
            @if (person.status === 'suspended') {
              <button class="btn small" type="button" [disabled]="busy() === person.email" (click)="act('reactivate', person)"><app-icon name="rotate" [size]="16" /> Reactivate</button>
            }
          </div>
        }
      </article>
    }
  `,
})
export class AdminRegistrations implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly tenants = inject(TenantService);

  readonly tabs = TABS;
  readonly active = signal<string>('pending');
  readonly items = signal<Registration[]>([]);
  /** What the admin typed in the search box. Every word must be found somewhere in a registration's details. */
  readonly query = signal('');
  readonly visible = computed(() => {
    const words = this.query().toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? this.items().filter((person) => {
      const text = searchText(person);
      return words.every((word) => text.includes(word));
    }) : this.items();
  });
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
  readonly access = signal<Record<string, CourseAccess[]>>({});
  readonly accessNotice = signal<{ email: string; kind: 'ok' | 'error'; text: string } | null>(null);
  giveCourse = '';
  draft = emptyDraft();

  readonly date = formatDate;
  readonly when = formatDateTime;
  readonly gender = (value: string) => GENDER_LABELS[value] ?? value;

  ngOnInit(): void {
    // The home page's tiles open a particular list, for example ?status=approved.
    const wanted = this.route.snapshot.queryParamMap.get('status');
    if (wanted && (TABS as readonly string[]).includes(wanted)) this.active.set(wanted);
    void this.load();
  }

  /** The Excel template for importing many students, saved straight from this page. */
  async downloadTemplate(): Promise<void> {
    this.loadError.set(null);
    try {
      const blob = await this.api.studentImportTemplate();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'student-import-template.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      this.loadError.set(error as ApiError);
    }
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
    if (next.has(email)) {
      next.delete(email);
    } else {
      next.add(email);
      const person = this.items().find((p) => p.email === email);
      if (person?.status === 'approved') void this.openAccess(email);
    }
    this.open.set(next);
  }

  /** Show what an approved student has. The course list for the "give" menu is fetched the first time. */
  private async openAccess(email: string): Promise<void> {
    this.giveCourse = '';
    this.accessNotice.set(null);
    try {
      await this.ensureCourses();
      const given = await this.api.studentAccess(email);
      this.access.update((all) => ({ ...all, [email]: given }));
    } catch (error) {
      this.accessNotice.set({ email, kind: 'error', text: (error as ApiError).detail });
    }
  }

  private async ensureCourses(): Promise<void> {
    if (this.courses().length === 0) this.courses.set(await this.api.adminCourses());
  }

  async give(person: Registration): Promise<void> {
    if (this.busy() || !this.giveCourse) return;
    await this.changeAccess(person, `Gave ${person.first_name} access.`, () => this.api.giveAccess(person.email, this.giveCourse));
    this.giveCourse = '';
  }

  /** Give the student every course they chose, each for its own length. */
  async giveRequested(person: Registration): Promise<void> {
    if (this.busy()) return;
    this.busy.set(person.email);
    this.accessNotice.set(null);
    try {
      const result = await this.api.giveRequestedAccess(person.email);
      const given = await this.api.studentAccess(person.email);
      this.access.update((all) => ({ ...all, [person.email]: given }));
      const names = result.granted.map((item) => item.course_name);
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? 'no courses';
      const skipped = result.skipped.length ? ` Skipped ${result.skipped.join(', ')}: no longer a course.` : '';
      this.accessNotice.set({ email: person.email, kind: result.skipped.length ? 'error' : 'ok', text: `Gave ${person.first_name} access to ${list}.${skipped}` });
    } catch (error) {
      this.accessNotice.set({ email: person.email, kind: 'error', text: (error as ApiError).detail });
    } finally {
      this.busy.set(null);
    }
  }

  async takeAway(person: Registration, item: CourseAccess): Promise<void> {
    if (this.busy()) return;
    await this.changeAccess(person, `Removed ${item.course_name} from ${person.first_name}.`, () => this.api.revokeAccess(person.email, item.course_id));
  }

  private async changeAccess(person: Registration, done: string, change: () => Promise<unknown>): Promise<void> {
    this.busy.set(person.email);
    this.accessNotice.set(null);
    try {
      await change();
      const given = await this.api.studentAccess(person.email);
      this.access.update((all) => ({ ...all, [person.email]: given }));
      this.accessNotice.set({ email: person.email, kind: 'ok', text: done });
    } catch (error) {
      this.accessNotice.set({ email: person.email, kind: 'error', text: (error as ApiError).detail });
    } finally {
      this.busy.set(null);
    }
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
      address: person.address, city: person.city, pin_code: person.pin_code, course_ids: [...person.course_ids],
    };
    try {
      await this.ensureCourses();
    } catch (error) {
      this.notice.set({ kind: 'error', text: (error as ApiError).detail });
      return;
    }
    this.editing.set(person.email);
  }

  /** The courses that can be ticked: those open for registration, and any the student already has even if hidden since. */
  editableCourses(person: Registration): AdminCourse[] {
    return this.courses().filter((course) => course.active || person.course_ids.includes(course.id));
  }

  toggleCourse(id: string, on: boolean): void {
    this.draft.course_ids = on ? [...this.draft.course_ids.filter((item) => item !== id), id] : this.draft.course_ids.filter((item) => item !== id);
    this.clearError('course_ids');
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
    for (const field of ['first_name', 'last_name', 'birth_date', 'gender', 'mobile', 'address', 'city', 'pin_code'] as const) {
      if (trimmed(draft[field]) !== person[field]) changes[field] = trimmed(draft[field]);
    }
    if (draft.course_ids.length !== person.course_ids.length || draft.course_ids.some((id) => !person.course_ids.includes(id))) changes.course_ids = [...draft.course_ids];
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

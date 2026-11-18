import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { formatDate } from '../core/format';
import { AdminCourse, ApiError, Batch, Registration } from '../core/models';
import { Icon } from '../ui/icon';

interface Draft {
  name: string;
  courseIds: string[];
  start: string;
  end: string;
  seats: number | null;
  faculty: string;
  schedule: string;
}

const emptyDraft = (): Draft => ({ name: '', courseIds: [], start: '', end: '', seats: null, faculty: '', schedule: '' });

/**
 * Batches: cohorts inside the institute. Each has courses, dates, an optional seat limit, an optional faculty name and a short
 * timetable. Adding a student to a batch opens its courses for them; taking them out closes what only the batch had opened.
 */
@Component({
  selector: 'app-admin-batches',
  imports: [FormsModule, Icon],
  template: `
    <div class="page-head">
      <h1><app-icon name="layers" /> Batches</h1>
      <div class="tools"><button class="btn" type="button" id="new-batch" (click)="startNew()"><app-icon name="plus" [size]="16" /> New batch</button></div>
    </div>
    @if (error(); as problem) { <div class="alert error" role="alert" id="batch-error">{{ problem.detail }}</div> }
    @if (notice(); as n) { <div class="alert ok" role="status" id="batch-notice">{{ n }}</div> }

    @if (form(); as mode) {
      <form class="card" id="batch-form" (ngSubmit)="save()" novalidate>
        <h2>{{ mode === 'new' ? 'New batch' : 'Edit batch' }}</h2>
        <div class="field"><label for="b-name">Name</label><input id="b-name" name="name" type="text" placeholder="Morning CAT 2027" [(ngModel)]="draft.name" /></div>
        <fieldset class="field">
          <legend class="label">Courses in this batch</legend>
          @for (c of courses(); track c.id) {
            <label class="check"><input type="checkbox" [name]="'course-' + c.id" [checked]="draft.courseIds.includes(c.id)" (change)="toggleCourse(c.id)" /> {{ c.name }}</label>
          }
          @if (!courses().length) { <p class="muted">Add a course first, under Courses.</p> }
        </fieldset>
        <div class="grid-2">
          <div class="field"><label for="b-start">Starts</label><input id="b-start" name="start" type="date" [(ngModel)]="draft.start" /></div>
          <div class="field"><label for="b-end">Ends</label><input id="b-end" name="end" type="date" [(ngModel)]="draft.end" /></div>
          <div class="field"><label for="b-seats">Seats</label><input id="b-seats" name="seats" type="number" min="1" max="1000" placeholder="No limit" [(ngModel)]="draft.seats" /></div>
          <div class="field"><label for="b-faculty">Faculty (optional)</label><input id="b-faculty" name="faculty" type="text" placeholder="Dr Rao" [(ngModel)]="draft.faculty" /></div>
        </div>
        <div class="field"><label for="b-schedule">Timetable (optional)</label><input id="b-schedule" name="schedule" type="text" placeholder="Mon to Fri, 7 to 9 am" [(ngModel)]="draft.schedule" /></div>
        <div class="row">
          <button class="btn" type="submit" id="batch-save" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
          <button class="btn secondary" type="button" id="batch-cancel" (click)="form.set(null)">Cancel</button>
        </div>
      </form>
    }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (!batches().length && !form()) {
      <div class="empty-state" id="no-batches"><app-icon name="layers" [size]="32" /><p>No batches yet. A batch groups students and the courses they follow together.</p></div>
    }

    @for (b of batches(); track b.id) {
      <article class="card batch" [attr.data-batch]="b.name" [class.archived]="b.status === 'archived'">
        <div class="row q-head">
          <strong>{{ b.name }}</strong>
          @if (b.status === 'archived') { <span class="chip suspended">Archived</span> }
          <span class="soft" [attr.data-seats]="b.name">{{ b.enrolled }}{{ b.seat_limit ? ' of ' + b.seat_limit : '' }} students</span>
          <button class="btn secondary small" type="button" style="margin-left: auto" [attr.data-open]="b.name" (click)="open(b.id)">{{ openId() === b.id ? 'Close' : 'Open' }}</button>
        </div>
        <p class="row">@for (n of b.course_names; track n) { <span class="chip approved">{{ n }}</span> }</p>
        <p class="soft small">
          @if (b.start_date) { <app-icon name="calendar" [size]="14" /> {{ date(b.start_date) }}@if (b.end_date) { to {{ date(b.end_date) }} } }
          @if (b.faculty) { · {{ b.faculty }} }
          @if (b.schedule) { · {{ b.schedule }} }
        </p>
        @if (openId() === b.id && detail(); as d) {
          <div class="batch-detail" id="batch-detail">
            <div class="row">
              <button class="btn secondary small" type="button" id="batch-edit" (click)="startEdit(d)"><app-icon name="edit" [size]="14" /> Edit</button>
              <button class="btn secondary small" type="button" id="batch-archive" (click)="toggleArchive(d)">{{ d.status === 'archived' ? 'Make active' : 'Archive' }}</button>
            </div>
            <h3>Students ({{ d.enrolled }})</h3>
            @for (s of d.students ?? []; track s.email) {
              <p class="row" [attr.data-student]="s.email">{{ s.name }} <span class="soft small">{{ s.email }}</span>
                <button class="icon-btn danger" type="button" [attr.aria-label]="'Remove ' + s.name" (click)="remove(d, s.email)"><app-icon name="x" [size]="14" /></button></p>
            }
            @if (!(d.students ?? []).length) { <p class="muted">No students yet.</p> }
            @if (d.status === 'active') {
              <h3>Add students</h3>
              <input id="pick-search" name="search" type="search" placeholder="Search by name or email" [ngModel]="search()" (ngModelChange)="search.set($event)" />
              <div class="pick-list">
                @for (p of pickable(d); track p.email) {
                  <label class="check"><input type="checkbox" [name]="'pick-' + p.email" [checked]="picked().includes(p.email)" (change)="togglePick(p.email)" /> {{ p.first_name }} {{ p.last_name }} <span class="soft small">{{ p.email }}</span></label>
                }
                @if (!pickable(d).length) { <p class="muted">No other approved students{{ search() ? ' match' : '' }}.</p> }
              </div>
              <button class="btn small" type="button" id="enrol" [disabled]="busy() || !picked().length" (click)="enrol(d)">Add {{ picked().length || '' }} selected</button>
            }
          </div>
        }
      </article>
    }
  `,
})
export class AdminBatchesPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly batches = signal<Batch[]>([]);
  readonly courses = signal<AdminCourse[]>([]);
  readonly students = signal<Registration[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly notice = signal<string | null>(null);
  readonly form = signal<'new' | 'edit' | null>(null);
  readonly openId = signal<string | null>(null);
  readonly detail = signal<Batch | null>(null);
  readonly search = signal('');
  readonly picked = signal<string[]>([]);
  draft: Draft = emptyDraft();
  private editing: string | null = null;
  readonly date = formatDate;

  readonly pickable = (d: Batch) => {
    const inBatch = new Set((d.students ?? []).map((s) => s.email));
    const q = this.search().trim().toLowerCase();
    return this.students().filter((s) => !inBatch.has(s.email) && (!q || `${s.first_name} ${s.last_name} ${s.email}`.toLowerCase().includes(q)));
  };
  readonly count = computed(() => this.batches().length);

  async ngOnInit(): Promise<void> {
    try {
      const [batches, courses, students] = await Promise.all([this.api.batches(), this.api.adminCourses(), this.api.registrations('approved')]);
      this.batches.set(batches);
      this.courses.set(courses.filter((c) => c.active));
      this.students.set(students);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  private async reload(): Promise<void> {
    this.batches.set(await this.api.batches());
  }

  startNew(): void {
    this.draft = emptyDraft();
    this.editing = null;
    this.error.set(null);
    this.notice.set(null);
    this.form.set('new');
  }

  startEdit(b: Batch): void {
    this.draft = { name: b.name, courseIds: [...b.course_ids], start: b.start_date, end: b.end_date, seats: b.seat_limit, faculty: b.faculty, schedule: b.schedule };
    this.editing = b.id;
    this.error.set(null);
    this.notice.set(null);
    this.form.set('edit');
  }

  toggleCourse(id: string): void {
    this.draft.courseIds = this.draft.courseIds.includes(id) ? this.draft.courseIds.filter((x) => x !== id) : [...this.draft.courseIds, id];
  }

  async save(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const fields = {
      name: this.draft.name, course_ids: this.draft.courseIds, start_date: this.draft.start, end_date: this.draft.end,
      seat_limit: this.draft.seats ? Number(this.draft.seats) : null, faculty: this.draft.faculty, schedule: this.draft.schedule,
    };
    try {
      const saved = this.editing ? await this.api.updateBatch(this.editing, fields) : await this.api.createBatch(fields);
      this.form.set(null);
      this.notice.set(this.editing ? `Saved ${saved.name}.` : `Created ${saved.name}.`);
      this.detail.set(saved);
      this.openId.set(saved.id);
      await this.reload();
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async open(id: string): Promise<void> {
    if (this.openId() === id) {
      this.openId.set(null);
      return;
    }
    this.error.set(null);
    this.picked.set([]);
    this.search.set('');
    try {
      this.detail.set(await this.api.batch(id));
      this.openId.set(id);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  togglePick(email: string): void {
    this.picked.update((list) => (list.includes(email) ? list.filter((x) => x !== email) : [...list, email]));
  }

  async enrol(b: Batch): Promise<void> {
    await this.change(async () => {
      const updated = await this.api.enrolInBatch(b.id, this.picked());
      this.notice.set(`Added ${this.picked().length} to ${b.name}. Their courses are open.`);
      this.picked.set([]);
      return updated;
    });
  }

  async remove(b: Batch, email: string): Promise<void> {
    await this.change(async () => {
      const updated = await this.api.removeFromBatch(b.id, email);
      this.notice.set(`Removed ${email} from ${b.name}.`);
      return updated;
    });
  }

  async toggleArchive(b: Batch): Promise<void> {
    await this.change(async () => {
      const updated = await this.api.updateBatch(b.id, { status: b.status === 'archived' ? 'active' : 'archived' });
      this.notice.set(updated.status === 'archived' ? `${b.name} is archived and its courses are closed for its students.` : `${b.name} is active again.`);
      return updated;
    });
  }

  private async change(run: () => Promise<Batch>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      this.detail.set(await run());
      await this.reload();
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }
}

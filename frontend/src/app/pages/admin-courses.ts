import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { describeAccess, formatFee } from '../core/format';
import { Access, AdminCourse, ApiError, Paper } from '../core/models';
import { PaperChecklist } from './paper-checklist';
import { TenantService } from '../core/tenant.service';

interface Draft {
  name: string;
  fee: number | null;
  accessType: 'unlimited' | 'days' | 'until_date';
  days: number | null;
  until: string;
  papers: string[];
}

function emptyDraft(): Draft {
  return { name: '', fee: null, accessType: 'unlimited', days: null, until: '', papers: [] };
}

function draftFrom(course: AdminCourse): Draft {
  const access = course.access;
  return {
    name: course.name,
    fee: course.fee,
    accessType: access.type,
    days: access.type === 'days' ? access.days : null,
    until: access.type === 'until_date' ? access.until : '',
    papers: [...(course.papers ?? [])],
  };
}

function accessFrom(draft: Draft): Access {
  if (draft.accessType === 'days') return { type: 'days', days: Number(draft.days) };
  if (draft.accessType === 'until_date') return { type: 'until_date', until: draft.until };
  return { type: 'unlimited' };
}

/** The institute's courses: what appears in the registration dropdown, with each one's fee and access length. */
@Component({
  selector: 'app-admin-courses',
  imports: [FormsModule, RouterLink, PaperChecklist],
  template: `
    <h1>Courses</h1>
    <p class="muted">These are the courses students can choose when they register. Hidden courses don't appear in the list.</p>

    @if (notice(); as text) { <div class="alert ok" role="status">{{ text }}</div> }
    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else {
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Course</th><th>Fee</th><th>Access</th><th>Papers</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            @for (course of courses(); track course.id) {
              @if (editing() === course.id) {
                <tr>
                  <td colspan="6">
                    <div class="grid-2">
                      <div class="field">
                        <label [attr.for]="'name-' + course.id">Name</label>
                        <input [id]="'name-' + course.id" name="name" type="text" [(ngModel)]="draft.name" />
                      </div>
                      <div class="field">
                        <label [attr.for]="'fee-' + course.id">Fee (₹)</label>
                        <input [id]="'fee-' + course.id" name="fee" type="number" min="0" [(ngModel)]="draft.fee" />
                      </div>
                    </div>
                    <div class="grid-2">
                      <div class="field">
                        <label [attr.for]="'type-' + course.id">Access lasts</label>
                        <select [id]="'type-' + course.id" name="type" [(ngModel)]="draft.accessType">
                          <option value="unlimited">Unlimited</option>
                          <option value="days">A number of days after payment</option>
                          <option value="until_date">Until a fixed date</option>
                        </select>
                      </div>
                      @if (draft.accessType === 'days') {
                        <div class="field">
                          <label [attr.for]="'days-' + course.id">Days</label>
                          <input [id]="'days-' + course.id" name="days" type="number" min="1" max="3650" [(ngModel)]="draft.days" />
                        </div>
                      }
                      @if (draft.accessType === 'until_date') {
                        <div class="field">
                          <label [attr.for]="'until-' + course.id">Ends on</label>
                          <input [id]="'until-' + course.id" name="until" type="date" [(ngModel)]="draft.until" />
                        </div>
                      }
                    </div>
                    <app-paper-checklist [papers]="papers()" [idPrefix]="'papers-' + course.id" [(selected)]="draft.papers" />
                    <p class="hint">Changing access length affects new payments only. Students who already have access keep what they have.</p>
                    <div class="actions">
                      <button class="btn small" type="button" [disabled]="saving()" (click)="saveEdit(course)">Save</button>
                      <button class="btn secondary small" type="button" (click)="editing.set(null)">Cancel</button>
                    </div>
                  </td>
                </tr>
              } @else {
                <tr [attr.data-course]="course.name">
                  <td><strong>{{ course.name }}</strong></td>
                  <td>{{ fee(course.fee) }}</td>
                  <td>{{ access(course.access) }}</td>
                  <td class="papers-cell">{{ papersShown(course) }}</td>
                  <td><span class="chip" [class]="'chip ' + (course.active ? 'open' : 'hidden')">{{ course.active ? 'open' : 'hidden' }}</span></td>
                  <td>
                    <div class="row">
                      <a class="btn secondary small" [routerLink]="['/', tenants.slug(), 'admin', 'courses', course.id, 'files']">Files</a>
                      <button class="btn secondary small" type="button" (click)="startEdit(course)">Edit</button>
                      <button class="btn secondary small" type="button" [disabled]="saving()" (click)="toggleActive(course)">
                        {{ course.active ? 'Hide' : 'Show' }}
                      </button>
                    </div>
                  </td>
                </tr>
              }
            } @empty {
              <tr><td colspan="6" class="empty">No courses yet. Add the first one below.</td></tr>
            }
          </tbody>
        </table>
      </div>

      <div class="card" style="margin-top: 1.25rem">
        <h2>Add a course</h2>
        <form (ngSubmit)="add()" novalidate>
          <div class="grid-2">
            <div class="field">
              <label for="new-name">Name</label>
              <input id="new-name" name="newName" type="text" [(ngModel)]="newCourse.name" (change)="suggest()" />
            </div>
            <div class="field">
              <label for="new-fee">Fee (₹)</label>
              <input id="new-fee" name="newFee" type="number" min="0" [(ngModel)]="newCourse.fee" />
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="new-type">Access lasts</label>
              <select id="new-type" name="newType" [(ngModel)]="newCourse.accessType">
                <option value="unlimited">Unlimited</option>
                <option value="days">A number of days after payment</option>
                <option value="until_date">Until a fixed date</option>
              </select>
            </div>
            @if (newCourse.accessType === 'days') {
              <div class="field">
                <label for="new-days">Days</label>
                <input id="new-days" name="newDays" type="number" min="1" max="3650" [(ngModel)]="newCourse.days" />
              </div>
            }
            @if (newCourse.accessType === 'until_date') {
              <div class="field">
                <label for="new-until">Ends on</label>
                <input id="new-until" name="newUntil" type="date" [(ngModel)]="newCourse.until" />
              </div>
            }
          </div>
          <app-paper-checklist [papers]="papers()" idPrefix="new-papers" [(selected)]="newCourse.papers" />
          <p class="hint">Typing a known course name (CUET, IPMAT, CAT or CLAT) ticks its usual papers. Change them as you like.</p>
          <button class="btn" type="submit" [disabled]="saving() || !newCourse.name.trim() || newCourse.fee === null">Add course</button>
        </form>
      </div>
    }
  `,
})
export class AdminCourses implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);

  readonly courses = signal<AdminCourse[]>([]);
  readonly papers = signal<Paper[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly notice = signal<string | null>(null);
  readonly editing = signal<string | null>(null);

  newCourse: Draft = emptyDraft();
  draft: Draft = emptyDraft();

  readonly fee = formatFee;
  readonly access = describeAccess;

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.papers.set(await this.api.papers());
      this.courses.set(await this.api.adminCourses());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  /** What the Papers column shows: the names when there are only a few, otherwise the count. */
  papersShown(course: AdminCourse): string {
    const ids = course.papers ?? [];
    if (!ids.length) return 'No papers yet';
    if (ids.length > 4) return `${ids.length} papers`;
    return ids.map((id) => this.papers().find((paper) => paper.id === id)?.name ?? id).join(', ');
  }

  /** When a course name is typed, tick the usual papers for it, unless the admin has already ticked some. */
  async suggest(): Promise<void> {
    if (this.newCourse.papers.length) return;
    try {
      const ids = await this.api.suggestedPapers(this.newCourse.name);
      if (!this.newCourse.papers.length) this.newCourse.papers = ids;
    } catch {
      // A missing suggestion is not a problem: the admin can tick papers by hand.
    }
  }

  startEdit(course: AdminCourse): void {
    this.error.set(null);
    this.notice.set(null);
    this.draft = draftFrom(course);
    this.editing.set(course.id);
  }

  async saveEdit(course: AdminCourse): Promise<void> {
    await this.run(async () => {
      await this.api.updateCourse(course.id, {
        name: this.draft.name,
        fee: Number(this.draft.fee),
        access: accessFrom(this.draft),
        papers: this.draft.papers,
      });
      this.editing.set(null);
      this.notice.set(`Saved ${this.draft.name.trim()}.`);
    });
  }

  async toggleActive(course: AdminCourse): Promise<void> {
    await this.run(async () => {
      await this.api.updateCourse(course.id, { active: !course.active });
      this.notice.set(course.active ? `${course.name} is now hidden.` : `${course.name} is open for registration.`);
    });
  }

  async add(): Promise<void> {
    await this.run(async () => {
      const created = await this.api.addCourse({
        name: this.newCourse.name,
        fee: Number(this.newCourse.fee),
        access: accessFrom(this.newCourse),
        papers: this.newCourse.papers,
      });
      this.newCourse = emptyDraft();
      this.notice.set(`Added ${created.name}.`);
    });
  }

  /** Do a change, then show the fresh list. Any problem is shown at the top of the page. */
  private async run(change: () => Promise<void>): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await change();
      this.courses.set(await this.api.adminCourses());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.saving.set(false);
    }
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { shortAccess } from '../core/format';
import { Access, AdminCourse, ApiError, Paper } from '../core/models';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';
import { PaperChecklist } from './paper-checklist';
import { TenantService } from '../core/tenant.service';

interface Draft {
  name: string;
  accessType: 'unlimited' | 'days' | 'until_date';
  days: number | null;
  until: string;
  papers: string[];
}

function emptyDraft(): Draft {
  return { name: '', accessType: 'unlimited', days: null, until: '', papers: [] };
}

function draftFrom(course: AdminCourse): Draft {
  const access = course.access;
  return {
    name: course.name,
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

/** The institute's courses: what students can pick when they register, with each one's access length and subjects. */
@Component({
  selector: 'app-admin-courses',
  imports: [FormsModule, RouterLink, PaperChecklist, Icon, InfoTip],
  template: `
    <div class="page-head">
      <h1>
        Courses
        <app-info text="Students pick one of these when they register. Hidden courses aren't offered." />
      </h1>
      @if (!adding()) {
        <button class="btn" type="button" id="add-course" (click)="startAdd()"><app-icon name="plus" /> Add course</button>
      }
    </div>

    @if (notice(); as text) { <div class="alert ok" role="status">{{ text }}</div> }
    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (adding()) {
      <div class="form-panel" id="add-panel">
        <form (ngSubmit)="add()" novalidate>
          <div class="grid-2">
            <div class="field">
              <label for="new-name">Name</label>
              <input id="new-name" name="newName" type="text" [(ngModel)]="newCourse.name" (change)="suggest()" />
            </div>
            <div class="field">
              <label for="new-type">Access</label>
              <div class="row" style="flex-wrap: nowrap">
                <select id="new-type" name="newType" [(ngModel)]="newCourse.accessType">
                  <option value="unlimited">Unlimited</option>
                  <option value="days">Days after payment</option>
                  <option value="until_date">Until a date</option>
                </select>
                @if (newCourse.accessType === 'days') {
                  <input id="new-days" name="newDays" type="number" min="1" max="3650" placeholder="Days" aria-label="Days" style="max-width: 6rem" [(ngModel)]="newCourse.days" />
                }
                @if (newCourse.accessType === 'until_date') {
                  <input id="new-until" name="newUntil" type="date" aria-label="Ends on" [(ngModel)]="newCourse.until" />
                }
              </div>
            </div>
          </div>
          <app-paper-checklist [papers]="papers()" idPrefix="new-papers" [(selected)]="newCourse.papers" />
          <div class="form-actions">
            <button class="btn" type="submit" [disabled]="saving() || !newCourse.name.trim()"><app-icon name="check" /> Add course</button>
            <button class="icon-btn" type="button" title="Cancel" (click)="adding.set(false)"><app-icon name="x" /><span class="sr-only">Cancel</span></button>
          </div>
        </form>
      </div>
    }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (!courses().length) {
      <div class="empty-state"><app-icon name="book" [size]="32" /><p>No courses yet</p></div>
    } @else {
      <div class="table-wrap">
        <table class="compact">
          <thead>
            <tr><th>Course</th><th class="hide-sm">Access</th><th>Subjects</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            @for (course of courses(); track course.id) {
              @if (editing() === course.id) {
                <tr>
                  <td colspan="5">
                    <div class="grid-2">
                      <div class="field">
                        <label [attr.for]="'name-' + course.id">Name</label>
                        <input [id]="'name-' + course.id" name="name" type="text" [(ngModel)]="draft.name" />
                      </div>
                      <div class="field">
                        <label [attr.for]="'type-' + course.id">Access <app-info text="A change affects new payments only. Students who already have access keep what they have." /></label>
                        <div class="row" style="flex-wrap: nowrap">
                          <select [id]="'type-' + course.id" name="type" [(ngModel)]="draft.accessType">
                            <option value="unlimited">Unlimited</option>
                            <option value="days">Days after payment</option>
                            <option value="until_date">Until a date</option>
                          </select>
                          @if (draft.accessType === 'days') {
                            <input [id]="'days-' + course.id" name="days" type="number" min="1" max="3650" placeholder="Days" aria-label="Days" style="max-width: 6rem" [(ngModel)]="draft.days" />
                          }
                          @if (draft.accessType === 'until_date') {
                            <input [id]="'until-' + course.id" name="until" type="date" aria-label="Ends on" [(ngModel)]="draft.until" />
                          }
                        </div>
                      </div>
                    </div>
                    <app-paper-checklist [papers]="papers()" [idPrefix]="'papers-' + course.id" [(selected)]="draft.papers" />
                    <div class="form-actions">
                      <button class="btn small" type="button" [disabled]="saving()" (click)="saveEdit(course)"><app-icon name="check" [size]="16" /> Save</button>
                      <button class="icon-btn" type="button" title="Cancel" (click)="editing.set(null)"><app-icon name="x" /><span class="sr-only">Cancel</span></button>
                    </div>
                  </td>
                </tr>
              } @else {
                <tr [attr.data-course]="course.name">
                  <td><strong>{{ course.name }}</strong></td>
                  <td class="soft hide-sm">{{ access(course.access) }}</td>
                  <td class="soft papers-cell" [attr.title]="allSubjects(course)">{{ papersShown(course) }}</td>
                  <td><span class="status" [class.ok]="course.active">{{ course.active ? 'Open' : 'Hidden' }}</span></td>
                  <td class="actions-cell">
                    <div class="icon-actions">
                      <a class="icon-btn" title="Files" [routerLink]="['/', tenants.slug(), 'admin', 'courses', course.id, 'files']"><app-icon name="folder" /><span class="sr-only">Files</span></a>
                      <button class="icon-btn" type="button" title="Edit" (click)="startEdit(course)"><app-icon name="edit" /><span class="sr-only">Edit</span></button>
                      <button class="icon-btn" type="button" [attr.title]="course.active ? 'Hide' : 'Show'" [disabled]="saving()" (click)="toggleActive(course)">
                        <app-icon [name]="course.active ? 'eye-off' : 'eye'" /><span class="sr-only">{{ course.active ? 'Hide' : 'Show' }}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
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

  readonly access = shortAccess;
  readonly adding = signal(false);

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

  /** What the Subjects column shows: the names when there are only a few, otherwise the count. */
  papersShown(course: AdminCourse): string {
    const ids = course.papers ?? [];
    if (!ids.length) return 'No subjects yet';
    if (ids.length > 2) return `${ids.length} subjects`;
    return ids.map((id) => this.papers().find((paper) => paper.id === id)?.name ?? id).join(', ');
  }

  /** Every subject of a course, for the tooltip. */
  allSubjects(course: AdminCourse): string {
    return (course.papers ?? []).map((id) => this.papers().find((paper) => paper.id === id)?.name ?? id).join(', ');
  }

  startAdd(): void {
    this.error.set(null);
    this.notice.set(null);
    this.newCourse = emptyDraft();
    this.adding.set(true);
  }

  /** When a course name is typed, tick the usual subjects for it, unless the admin has already ticked some. */
  async suggest(): Promise<void> {
    if (this.newCourse.papers.length) return;
    try {
      const ids = await this.api.suggestedPapers(this.newCourse.name);
      if (!this.newCourse.papers.length) this.newCourse.papers = ids;
    } catch {
      // A missing suggestion is not a problem: the admin can tick subjects by hand.
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
        access: accessFrom(this.newCourse),
        papers: this.newCourse.papers,
      });
      this.newCourse = emptyDraft();
      this.adding.set(false);
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

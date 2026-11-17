import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { formatDate, formatSize } from '../core/format';
import { AdminCourse, ApiError, CourseFile } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';
import { UploadService } from '../core/upload.service';

interface Notice {
  kind: 'ok' | 'warn';
  text: string;
}

/** One course's files: add a PDF or an MP4, see what is there, and delete what is not wanted. */
@Component({
  selector: 'app-admin-course-files',
  imports: [FormsModule, RouterLink, Icon, InfoTip],
  template: `
    <div class="page-head">
      <h1>
        Files{{ course() ? ': ' + course()!.name : '' }}
        <app-info text="PDFs and MP4 videos that students with access to this course can open." />
      </h1>
      <a class="btn secondary small" [routerLink]="['/', tenants.slug(), 'admin', 'courses']"><app-icon name="arrow-left" [size]="16" /> Courses</a>
    </div>

    @if (notice(); as n) { <div class="alert" [class]="'alert ' + n.kind" role="status">{{ n.text }}</div> }
    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (course()) {
      <div class="form-panel">
        <form (ngSubmit)="upload()" novalidate>
          <div class="field">
            <label for="file">File <app-info text="PDF or MP4." /></label>
            <input id="file" name="file" type="file" accept=".pdf,.mp4,application/pdf,video/mp4" (change)="picked($event)" [disabled]="busy()" />
          </div>
          <div class="field">
            <label for="title">Title <app-info text="What students see. It starts as the file's name." /></label>
            <input id="title" name="title" type="text" [(ngModel)]="title" [disabled]="busy()" />
          </div>
          @if (busy()) {
            <div class="field" role="status">
              @if (stage() === 'sending') {
                <label for="bar">Uploading… {{ percent() }}%</label>
                <progress id="bar" max="100" [value]="percent()" style="width: 100%"></progress>
              } @else {
                <p class="muted">Checking the file…</p>
              }
            </div>
          }
          <button class="btn" type="submit" [disabled]="busy() || !file"><app-icon name="upload" /> {{ busy() ? 'Please wait…' : 'Upload' }}</button>
        </form>
      </div>
    }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (course()) {
      <div class="table-wrap">
        <table class="compact">
          <thead>
            <tr><th>Title</th><th>Type</th><th>Size</th><th>Status</th><th>Added</th><th><span class="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            @for (item of files(); track item.id) {
              <tr [attr.data-file]="item.title">
                <td><strong>{{ item.title }}</strong></td>
                <td>{{ item.kind === 'pdf' ? 'PDF' : 'Video' }}</td>
                <td>{{ size(item.size) }}</td>
                <td>
                  <span class="status" [class.ok]="item.status === 'ready'" [class.warn]="item.status !== 'ready'">{{ item.status === 'ready' ? 'ready' : 'not finished' }}</span>
                </td>
                <td>{{ date(item.created_at) }}</td>
                <td class="actions-cell">
                  @if (confirming() === item.id) {
                    <div class="icon-actions">
                      <button class="btn danger small" type="button" [disabled]="busy()" (click)="remove(item)">Yes, delete</button>
                      <button class="icon-btn" type="button" title="Keep" (click)="confirming.set(null)"><app-icon name="x" /><span class="sr-only">Keep</span></button>
                    </div>
                  } @else {
                    <button class="icon-btn danger" type="button" title="Delete" [disabled]="busy()" (click)="confirming.set(item.id)"><app-icon name="trash" /><span class="sr-only">Delete</span></button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6"><div class="empty-state"><app-icon name="file" [size]="32" /><p>No files yet.</p></div></td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (hasUnfinished()) {
        <p class="soft"><app-icon name="info" [size]="14" /> A "not finished" file never arrived and students can't see it. Delete it and upload it again.</p>
      }
    }
  `,
})
export class AdminCourseFiles implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly uploader = inject(UploadService);
  readonly tenants = inject(TenantService);

  readonly courseId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly course = signal<AdminCourse | null>(null);
  readonly files = signal<CourseFile[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly stage = signal<'sending' | 'checking'>('sending');
  readonly percent = signal(0);
  readonly confirming = signal<string | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly notice = signal<Notice | null>(null);

  file: File | null = null;
  title = '';

  readonly size = formatSize;
  readonly date = formatDate;

  ngOnInit(): void {
    void this.load();
  }

  hasUnfinished(): boolean {
    return this.files().some((f) => f.status !== 'ready');
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const courses = await this.api.adminCourses();
      this.course.set(courses.find((c) => c.id === this.courseId) ?? null);
      if (!this.course()) {
        this.error.set({ status: 404, detail: "We couldn't find that course." });
        return;
      }
      this.files.set(await this.api.courseFiles(this.courseId));
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  picked(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0] ?? null;
    // The title starts as the file's name without its ending, unless the admin has already typed one.
    if (this.file && !this.title.trim()) this.title = this.file.name.replace(/\.[^.]+$/, '');
  }

  /** The three steps: ask the API, send the file to S3, then have the API check what arrived. */
  async upload(): Promise<void> {
    const file = this.file;
    if (!file || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.percent.set(0);
    this.stage.set('sending');
    try {
      const started = await this.api.startUpload(this.courseId, { filename: file.name, size: file.size, title: this.title });
      await this.uploader.send(started.upload, file, (percent) => this.percent.set(percent));
      this.stage.set('checking');
      await this.api.finishUpload(this.courseId, started.file.id);
      this.notice.set({ kind: 'ok', text: `Added ${started.file.title}.` });
      this.file = null;
      this.title = '';
      const input = document.getElementById('file') as HTMLInputElement | null;
      if (input) input.value = ''; // empty the file picker too
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
    await this.refresh();
  }

  async remove(item: CourseFile): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.api.deleteFile(this.courseId, item.id);
      this.notice.set({ kind: 'ok', text: `Deleted ${item.title}.` });
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.confirming.set(null);
      this.busy.set(false);
    }
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    try {
      this.files.set(await this.api.courseFiles(this.courseId));
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { timeAgo } from '../core/format';
import { NoticeService } from '../core/notice.service';
import { ApiError, MyNotices, Notice, NoticeLinkTo } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';

/** Where a notice's button goes, inside the app. */
export const LINK_PATHS: Record<NoticeLinkTo, string[]> = { coursework: ['learning'], tests: ['learning', 'tests'], results: ['learning', 'results'] };

/** A student's notices: messages from the institute, and reminders. Action-needed ones come first, with a button. */
@Component({
  selector: 'app-student-notices',
  imports: [Icon],
  template: `
    <div class="page-head">
      <h1>Notices</h1>
      @if ((data()?.unread ?? 0) > 0) {
        <button class="btn secondary small" type="button" id="read-all" [disabled]="busy()" (click)="readAll()"><app-icon name="check" [size]="16" /> Mark all read</button>
      }
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (data(); as d) {
      @if (!d.notices.length) {
        <div class="empty-state" id="no-notices"><app-icon name="bell" [size]="32" /><p>No notices</p></div>
      }
      @for (notice of d.notices; track notice.id) {
        <article class="card notice" [class.unread]="!notice.read_at" [class.action]="notice.kind === 'action'" [attr.data-notice]="notice.title">
          <div class="row q-head">
            @if (!notice.read_at) { <span class="notice-dot" title="Unread"></span> }
            <strong>{{ notice.title }}</strong>
            @if (notice.kind === 'action') { <span class="status bad">Action needed</span> }
            <span class="soft notice-when">{{ ago(notice.created_at) }}</span>
          </div>
          <p class="notice-text">{{ notice.message }}</p>
          <div class="row">
            @if (notice.link; as link) {
              <button class="btn small" type="button" [disabled]="busy()" (click)="open(notice)"><app-icon name="play" [size]="15" /> {{ link.label }}</button>
            }
            @if (!notice.read_at) {
              <button class="btn secondary small" type="button" [disabled]="busy()" (click)="read(notice)">Mark read</button>
            }
          </div>
        </article>
      }
    }
  `,
})
export class StudentNotices implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly tenants = inject(TenantService);
  private readonly counts = inject(NoticeService);

  readonly data = signal<MyNotices | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);

  ago = timeAgo;

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.take(await this.api.myNotices());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  private take(data: MyNotices): void {
    this.data.set(data);
    this.counts.set(data);
  }

  private async change(work: () => Promise<MyNotices>): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.take(await work());
      return true;
    } catch (error) {
      this.error.set(error as ApiError);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async read(notice: Notice): Promise<void> {
    await this.change(() => this.api.markNoticeRead(notice.id));
  }

  async readAll(): Promise<void> {
    await this.change(() => this.api.markAllNoticesRead());
  }

  /** The button counts as reading it, then takes the student to the place it names. */
  async open(notice: Notice): Promise<void> {
    if (!notice.link) return;
    const ok = notice.read_at ? true : await this.change(() => this.api.markNoticeRead(notice.id));
    if (ok) await this.router.navigate(['/', this.tenants.slug(), ...LINK_PATHS[notice.link.to]]);
  }
}

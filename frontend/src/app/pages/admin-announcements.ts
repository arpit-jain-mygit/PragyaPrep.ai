import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Choice } from '../ui/choice';
import { ApiService } from '../core/api.service';
import { formatDateTime } from '../core/format';
import { AdminCourse, Announcement, AnnouncementInput, ApiError, NoticeKind, NoticeLinkTo } from '../core/models';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

/** Write an announcement to everyone, a course or chosen students, as information or as action needed, and see what was sent. */
@Component({
  selector: 'app-admin-announcements',
  imports: [Choice, FormsModule, Icon, InfoTip],
  template: `
    <div class="page-head">
      <h1>
        Announcements
        <app-info text="Each student gets the message in their Notices, and by email too if you tick it. Action needed adds a button that takes them to coursework, tests or results. Reminders for students who are behind are sent from the Progress page." />
      </h1>
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
    @if (done(); as sent) {
      <div class="alert ok" role="status" id="sent">
        Sent to {{ sent.recipients }} {{ sent.recipients === 1 ? 'student' : 'students' }}@if (sent.email_requested) { · {{ sent.emailed }} emailed }@if (sent.email_failed) { · {{ sent.email_failed }} emails could not be sent (the notice is still in the app) }
      </div>
    }

    <div class="form-panel">
      <form (ngSubmit)="send()" novalidate>
        <div class="field">
          <label for="title">Title</label>
          <input id="title" name="title" type="text" maxlength="120" [(ngModel)]="title" />
        </div>
        <div class="field">
          <label for="message">Message</label>
          <textarea id="message" name="message" rows="4" maxlength="2000" [(ngModel)]="message"></textarea>
        </div>

        <div class="field">
          <label>Type</label>
          <div class="cw-status">
            <label><input type="radio" name="kind" value="info" [ngModel]="kind" (ngModelChange)="setKind($event)" /> Information</label>
            <label><input type="radio" name="kind" value="action" [ngModel]="kind" (ngModelChange)="setKind($event)" /> Action needed</label>
          </div>
        </div>
        @if (kind === 'action') {
          <div class="field">
            <label for="link">Button <app-info text="Takes the student to a place in the app." /></label>
            <select id="link" name="link" [(ngModel)]="link">
              <option value="">No button</option>
              <option value="coursework">Open coursework</option>
              <option value="tests">Open tests</option>
              <option value="results">Open results</option>
            </select>
          </div>
        }

        <div class="field">
          <label for="audience">Send to</label>
          <app-choice name="audience" id="audience" label="Send to" [options]="[{ value: 'all', label: 'Everyone' }, { value: 'course', label: 'Students of a course' }, { value: 'students', label: 'Chosen students' }]" [(ngModel)]="audience" />
        </div>
        @if (audience === 'course') {
          <div class="field">
            <label for="course">Course</label>
            <select id="course" name="course" [(ngModel)]="courseId">
              <option value="">Choose a course…</option>
              @for (course of courses(); track course.id) { <option [value]="course.id">{{ course.name }}</option> }
            </select>
          </div>
        }
        @if (audience === 'students') {
          <div class="field">
            <label for="emails">Email addresses <app-info text="One per line, or separated by commas. They must be approved students." /></label>
            <textarea id="emails" name="emails" rows="3" [(ngModel)]="emails"></textarea>
          </div>
        }

        <div class="field">
          <label class="cw-check"><input type="checkbox" id="send-email" name="send-email" [(ngModel)]="sendEmail" /> Send an email too</label>
        </div>

        <button class="btn" type="submit" id="send" [disabled]="busy() || !ready()"><app-icon name="mail" /> {{ busy() ? 'Sending…' : 'Send' }}</button>
      </form>
    </div>

    <h2>Sent</h2>
    <div class="table-wrap">
      <table class="compact" id="history">
        <thead><tr><th>When</th><th>Message</th><th class="hide-sm">To</th><th>Reached</th><th class="hide-sm">Emailed</th></tr></thead>
        <tbody>
          @for (item of history(); track item.id) {
            <tr [attr.data-announcement]="item.title">
              <td class="soft">{{ when(item.created_at) }}</td>
              <td>
                <strong>{{ item.title }}</strong>
                @if (item.kind === 'action') { <span class="status bad">Action</span> }
                @if (item.source === 'reminder') { <span class="status warn">Reminder</span> }
              </td>
              <td class="soft hide-sm">{{ audienceText(item) }}</td>
              <td>{{ item.recipients }}</td>
              <td class="soft hide-sm">{{ item.email_requested ? item.emailed + (item.email_failed ? ' (' + item.email_failed + ' failed)' : '') : 'no' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="5"><div class="empty-state"><app-icon name="mail" [size]="32" /><p>Nothing sent yet</p></div></td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class AdminAnnouncements implements OnInit {
  private readonly api = inject(ApiService);

  readonly courses = signal<AdminCourse[]>([]);
  readonly history = signal<Announcement[]>([]);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly done = signal<Announcement | null>(null);

  title = '';
  message = '';
  kind: NoticeKind = 'info';
  link: NoticeLinkTo | '' = '';
  audience: 'all' | 'course' | 'students' = 'all';
  courseId = '';
  emails = '';
  sendEmail = false;

  when = formatDateTime;

  async ngOnInit(): Promise<void> {
    try {
      const [courses, history] = await Promise.all([this.api.adminCourses(), this.api.announcements()]);
      this.courses.set(courses.filter((c) => c.active));
      this.history.set(history);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  /** Action needed is usually worth an email; plain information usually isn't. The admin can still tick it either way. */
  setKind(kind: NoticeKind): void {
    this.kind = kind;
    this.sendEmail = kind === 'action';
    if (kind === 'info') this.link = '';
  }

  emailList(): string[] {
    return this.emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  }

  ready(): boolean {
    if (!this.title.trim() || !this.message.trim()) return false;
    if (this.audience === 'course') return !!this.courseId;
    if (this.audience === 'students') return this.emailList().length > 0;
    return true;
  }

  audienceText(item: Announcement): string {
    if (item.audience.type === 'all') return 'Everyone';
    if (item.audience.type === 'course') return item.audience.course_name ?? 'A course';
    return `${item.audience.count ?? item.recipients} chosen`;
  }

  async send(): Promise<void> {
    if (!this.ready()) return;
    const audience: AnnouncementInput['audience'] =
      this.audience === 'all' ? { type: 'all' } : this.audience === 'course' ? { type: 'course', course_id: this.courseId } : { type: 'students', emails: this.emailList() };
    this.busy.set(true);
    this.error.set(null);
    this.done.set(null);
    try {
      const sent = await this.api.sendAnnouncement({
        title: this.title, message: this.message, kind: this.kind, link: this.kind === 'action' && this.link ? this.link : null, audience, send_email: this.sendEmail,
      });
      this.done.set(sent);
      this.history.set([sent, ...this.history()]);
      this.title = '';
      this.message = '';
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }
}

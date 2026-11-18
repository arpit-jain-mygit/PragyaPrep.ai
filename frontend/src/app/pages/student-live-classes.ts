import { isNative, openInApp } from '../core/native';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { formatSize, shortDate } from '../core/format';
import { ApiError, StudentLiveClass, StudentLiveCourse, StudentMaterial } from '../core/models';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

type FileItem = Extract<StudentMaterial, { type: 'file' }>;

/** The live classes of the student's courses: the recordings, slides and links their institute has published, newest first. */
@Component({
  selector: 'app-student-live-classes',
  imports: [Icon, InfoTip],
  template: `
    <div class="cw-topline">
      <app-info text="Recordings and slides of your live classes, newest first. Play a recording here or open the slides." />
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (!courses().length && !error()) {
      <div class="empty-state" id="no-live"><app-icon name="play" [size]="32" /><p>No live classes yet</p></div>
    }

    @for (course of courses(); track course.course_id) {
      <h2 class="schedule-head" [attr.data-course]="course.course_name"><app-icon name="layers" [size]="18" /> {{ course.course_name }} <span class="count">{{ course.classes.length }}</span></h2>
      @for (item of course.classes; track item.id) {
        <article class="card" [attr.data-class]="item.title">
          <div class="row q-head">
            <strong>{{ item.title }}</strong>
            <span class="soft"><app-icon name="calendar" [size]="15" /> {{ when(item) }}</span>
          </div>
          @if (item.description) { <p class="cw-note">{{ item.description }}</p> }
          @if (item.materials.length) {
            <ul class="cw-material">
              @for (m of item.materials; track $index) {
                <li>
                  @if (m.type === 'link') {
                    <app-icon name="link" [size]="16" />
                    <a [href]="m.url" target="_blank" rel="noopener noreferrer">{{ m.title }}</a>
                  } @else {
                    <app-icon name="file" [size]="16" />
                    <span>{{ m.title }} <span class="soft">{{ m.kind === 'pdf' ? 'PDF' : 'Video' }}@if (m.size) { · {{ size(m.size) }} }</span></span>
                    <button class="btn small secondary" type="button" [disabled]="opening() === m.file_id" (click)="open(course, item, m)">
                      <app-icon [name]="m.kind === 'pdf' ? 'eye' : 'play'" [size]="15" /> {{ m.kind === 'pdf' ? 'Open' : 'Play' }}
                    </button>
                  }
                </li>
              }
            </ul>
          }
          @if (playing(); as video) {
            @if (video.classId === item.id) {
              <video id="player" controls autoplay [src]="video.url" (error)="renew(course, video.id, item.id)" style="width: 100%; border-radius: 8px; margin-top: 0.6rem"></video>
            }
          }
        </article>
      }
    }
  `,
})
export class StudentLiveClasses implements OnInit {
  private readonly api = inject(ApiService);

  readonly courses = signal<StudentLiveCourse[]>([]);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly opening = signal<string | null>(null);
  readonly playing = signal<{ id: string; classId: string; url: string } | null>(null);
  private renewals = 0;

  size = formatSize;

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.courses.set(await this.api.myLiveClasses());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  when(item: StudentLiveClass): string {
    return item.held_time ? `${shortDate(item.held_on)} · ${item.held_time}` : shortDate(item.held_on);
  }

  async open(course: StudentLiveCourse, item: StudentLiveClass, file: FileItem): Promise<void> {
    if (this.opening()) return;
    this.opening.set(file.file_id);
    this.error.set(null);
    // A new tab must be opened right away, while the click is still fresh, or the browser may block it.
    const tab = file.kind === 'pdf' ? (isNative() ? null : window.open('', '_blank')) : null;
    if (tab) tab.opener = null;
    try {
      const link = await this.api.fileLink(course.course_id, file.file_id);
      if (file.kind === 'pdf') {
        if (isNative()) await openInApp(link.url);
        else if (tab) tab.location.href = link.url;
        else window.location.href = link.url;
      } else {
        this.renewals = 0;
        this.playing.set({ id: file.file_id, classId: item.id, url: link.url });
      }
    } catch (error) {
      tab?.close();
      this.error.set(error as ApiError);
    } finally {
      this.opening.set(null);
    }
  }

  /** A video link lasts a few minutes. If playing fails because it ran out, get a new one once or twice. */
  async renew(course: StudentLiveCourse, fileId: string, classId: string): Promise<void> {
    if (this.renewals >= 2) {
      this.playing.set(null);
      this.error.set({ status: -1, detail: "This video couldn't be played. Try again later, or tell your institute." });
      return;
    }
    this.renewals++;
    try {
      const link = await this.api.fileLink(course.course_id, fileId);
      this.playing.set({ id: fileId, classId, url: link.url });
    } catch (error) {
      this.playing.set(null);
      this.error.set(error as ApiError);
    }
  }
}

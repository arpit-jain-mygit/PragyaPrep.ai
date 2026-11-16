import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { formatDate, formatSize } from '../core/format';
import { ApiError, CourseFile, MyCourse } from '../core/models';

interface Playing {
  file: CourseFile;
  url: string;
}

/**
 * A student's courses. A PDF opens in a new tab, and a video plays right here. Each file is opened through
 * a link that works for a few minutes, so a link that is shared stops working soon after.
 */
@Component({
  selector: 'app-my-courses',
  template: `
    <h1>My courses</h1>

    @if (message(); as text) { <div class="alert warn" role="alert">{{ text }}</div> }
    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (courses().length === 0 && !error()) {
      <div class="empty">You don't have any courses yet. Your institute will add them once your payment is confirmed.</div>
    }

    @for (course of courses(); track course.id) {
      <article class="card" [attr.data-course]="course.name">
        <h2>{{ course.name }}</h2>
        <p class="muted small">{{ course.expires_at ? 'Your access ends on ' + date(course.expires_at) + '.' : 'Your access has no end date.' }}</p>

        @for (file of course.files; track file.id) {
          <div class="item" [attr.data-file]="file.title">
            <div class="item-head">
              <div>
                <div class="item-title">{{ file.title }}</div>
                <div class="muted small">{{ file.kind === 'pdf' ? 'PDF' : 'Video' }} &middot; {{ size(file.size) }}</div>
              </div>
              <button class="btn small" type="button" [disabled]="opening() === file.id" (click)="open(course, file)">
                {{ file.kind === 'pdf' ? 'Open PDF' : 'Play' }}
              </button>
            </div>
            @if (playing(); as video) {
              @if (video.file.id === file.id) {
                <video class="player" controls autoplay playsinline [src]="video.url" (error)="renew($event, course, file)"></video>
              }
            }
          </div>
        } @empty {
          <p class="muted">No files have been added to this course yet.</p>
        }
      </article>
    }
  `,
})
export class MyCourses implements OnInit {
  private readonly api = inject(ApiService);

  readonly courses = signal<MyCourse[]>([]);
  readonly loading = signal(false);
  readonly opening = signal<string | null>(null);
  readonly playing = signal<Playing | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly message = signal<string | null>(null);
  /** How many times a video's link was renewed since it was last started, so a broken video can't loop forever. */
  private renewals = 0;

  readonly date = formatDate;
  readonly size = formatSize;

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.courses.set(await this.api.myCourses());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  async open(course: MyCourse, file: CourseFile): Promise<void> {
    if (this.opening()) return;
    this.opening.set(file.id);
    this.message.set(null);
    this.error.set(null);
    // A new tab must be opened right away, while the click is still fresh, or the browser may block it.
    const tab = file.kind === 'pdf' ? window.open('', '_blank') : null;
    if (tab) tab.opener = null;
    try {
      const link = await this.api.fileLink(course.id, file.id);
      if (file.kind === 'pdf') {
        if (tab) tab.location.href = link.url;
        else window.location.href = link.url; // pop-ups are blocked: open it in this tab instead
      } else {
        this.renewals = 0;
        this.playing.set({ file, url: link.url });
      }
    } catch (error) {
      tab?.close();
      await this.noLongerAvailable(error as ApiError);
    } finally {
      this.opening.set(null);
    }
  }

  /** A video link lasts a few minutes. If playing or jumping around fails because it ran out, get a new one and carry on. */
  async renew(event: Event, course: MyCourse, file: CourseFile): Promise<void> {
    if (this.renewals >= 2) {
      // A fresh link didn't help, so the video itself can't be played.
      this.playing.set(null);
      this.error.set({ status: -1, detail: "This video couldn't be played. Try again later, or tell your institute." });
      return;
    }
    this.renewals++;
    const video = event.target as HTMLVideoElement;
    const resumeAt = video.currentTime;
    try {
      const link = await this.api.fileLink(course.id, file.id);
      this.playing.set({ file, url: link.url });
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = resumeAt;
        void video.play();
      }, { once: true });
    } catch (error) {
      this.playing.set(null);
      await this.noLongerAvailable(error as ApiError);
    }
  }

  /** "Not found" here means access ended or the file was removed. Say so, and show what the student has now. */
  private async noLongerAvailable(problem: ApiError): Promise<void> {
    if (problem.status === 404) {
      this.message.set("You can't open that any more. Your access may have ended, or the file was removed.");
      await this.load();
    } else {
      this.error.set(problem);
    }
  }
}

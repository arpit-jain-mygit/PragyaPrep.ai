import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, FreeSample, FreeState, Member } from '../core/models';
import { Icon } from '../ui/icon';

/**
 * The home of a free student or parent (no institute): pick one course, then open that course's one free sub-topic.
 * The rest is shown locked, with a way to ask the PragyaPrep team (the Contact support button in the bar).
 */
@Component({
  selector: 'app-free-home',
  imports: [Icon],
  template: `
    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
    <div class="page-head"><h1>Welcome, {{ member().first_name }}</h1><span class="chip approved">Free plan</span></div>

    @if (state(); as s) {
      @if (!s.picked) {
        <section class="card" id="pick-course">
          <h2>Pick your course</h2>
          <p class="muted">Choose one. You can open its free sub-topic right away.</p>
          <div class="row">
            @for (c of s.courses; track c.name) {
              <button class="btn secondary" type="button" [attr.data-course]="c.name" (click)="pick(c.name)" [disabled]="busy()">{{ c.name }}</button>
            }
          </div>
          @if (s.courses.length === 0) { <p class="muted">Courses are being added. Please check back soon.</p> }
        </section>
      } @else {
        <section class="card" id="free-sample">
          <h2>{{ s.picked }}</h2>
          @if (sample(); as x) {
            <p class="muted small">{{ x.subject }} › {{ x.topic }}</p>
            <h3>{{ x.title }} <span class="chip approved">Free</span></h3>
            @if (x.note) { <p style="white-space: pre-wrap">{{ x.note }}</p> }
            @if (x.links.length) {
              <ul class="plain-list">@for (l of x.links; track l.url) { <li><app-icon name="eye" [size]="16" /> <a [href]="l.url" target="_blank" rel="noopener noreferrer">{{ l.title }}</a></li> }</ul>
            }
            @if (x.files.length) {
              <ul class="plain-list" id="free-files">
                @for (f of x.files; track f.file_id) {
                  <li>
                    <button class="btn small secondary" type="button" [attr.data-file]="f.file_id" [disabled]="opening() === f.file_id" (click)="openFile(f.file_id)">
                      <app-icon [name]="f.kind === 'video' ? 'play' : 'file'" [size]="16" /> {{ opening() === f.file_id ? 'Opening…' : f.title }}
                    </button>
                  </li>
                }
              </ul>
            }
          }
          <h3 style="margin-top: 1.25rem">The rest of {{ s.picked }}</h3>
          <ul class="plain-list" id="locked-list">
            @for (t of lockedTopics(s); track t) { <li class="soft"><app-icon name="lock" [size]="14" /> {{ t }}</li> }
          </ul>
        </section>
      }
      <section class="card" id="enquire">
        <h2>Want everything?</h2>
        <p class="muted">Full courses, live classes, tests{{ member().role === 'parent' ? '' : ' and parent mode' }}. Tap the help button at the top to message the PragyaPrep team.</p>
      </section>
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class FreeHome implements OnInit {
  private readonly api = inject(ApiService);
  readonly member = signal<Member>({ email: '', first_name: '', last_name: '', role: 'student', status: 'approved' } as Member);
  readonly state = signal<FreeState | null>(null);
  readonly sample = signal<FreeSample | null>(null);
  readonly busy = signal(false);
  readonly opening = signal<string | null>(null);
  readonly error = signal<ApiError | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.member.set(await this.api.me());
      this.state.set(await this.api.freeCourses());
      await this.loadSample();
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  private async loadSample(): Promise<void> {
    if (this.state()?.picked) this.sample.set((await this.api.freeSample()).sample);
  }

  /** Open a file of the free sub-topic in a new tab. The tab is opened first, while the click is fresh, so the browser doesn't block it. */
  async openFile(fileId: string): Promise<void> {
    if (this.opening()) return;
    this.opening.set(fileId);
    this.error.set(null);
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const link = await this.api.freeFileLink(fileId);
      if (tab) tab.location.href = link.url;
      else window.location.href = link.url;
    } catch (error) {
      tab?.close();
      this.error.set(error as ApiError);
    } finally {
      this.opening.set(null);
    }
  }

  async pick(course: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.state.set(await this.api.freePick(course));
      await this.loadSample();
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  /** The names of the other topics and sub-topics of the picked course, all locked. */
  lockedTopics(state: FreeState): string[] {
    const course = state.courses.find((c) => c.name === state.picked);
    if (!course) return [];
    const open = this.sample()?.title;
    return course.subjects.flatMap((s) => s.topics.flatMap((t) => t.subtopics.filter((x) => x !== open).map((x) => `${t.title}: ${x}`)));
  }
}

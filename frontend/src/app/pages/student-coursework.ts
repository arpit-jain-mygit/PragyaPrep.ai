import { isNative, openInApp } from '../core/native';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../core/api.service';
import { formatSize, shortDate } from '../core/format';
import { ApiError, StudentCourse, StudentCoursework, StudentMaterial, StudentSubject, StudentSubtopic, StudentTopic } from '../core/models';
import { AskAi } from '../ui/ask-ai';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

type Filter = 'all' | 'week' | 'overdue' | 'pending';

interface Chosen {
  course: StudentCourse;
  subject: StudentSubject;
  topic: StudentTopic;
  sub: StudentSubtopic;
}

/**
 * A student's Videos: tiles to drill down, course, then topic, then sub-topic. The chosen sub-topic opens below the tiles
 * with its note, finish-by date, material and a Mark complete button. A trail at the top shows where the student is and
 * lets them climb back up.
 */
@Component({
  selector: 'app-student-coursework',
  imports: [AskAi, Icon, InfoTip],
  styles: [`
    .cw-trail { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; margin: 0.2rem 0 0.8rem; }
    .cw-trail-link { background: none; border: 0; padding: 0.2rem 0.4rem; color: var(--brand, #2563eb); font: inherit; cursor: pointer; border-radius: 6px; }
    .cw-trail-link:hover { background: var(--page); }
    .cw-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 0.7rem; margin-bottom: 1rem; }
    .cw-tile { display: flex; flex-direction: column; gap: 0.45rem; min-width: 0; text-align: left; padding: 0.8rem; border: 1px solid var(--line); border-radius: 12px; background: var(--card, #fff); color: var(--ink); font: inherit; cursor: pointer; }
    .cw-tile:hover { border-color: var(--brand, #2563eb); }
    .cw-tile.selected { background: var(--info-bg); border-color: var(--brand, #2563eb); }
    .cw-tile-top { display: flex; align-items: center; gap: 0.45rem; min-width: 0; }
    .cw-tile-top strong, .cw-tile-top span { overflow-wrap: anywhere; }
    .cw-tile-meta { display: flex; flex-wrap: wrap; gap: 0.4rem; font-size: 0.85rem; color: var(--muted); }
    .cw-tile-heading { margin: 0.9rem 0 0.4rem; font-size: 1rem; }
    .cw-tile .cw-bar { width: 100%; }
  `],
  template: `
    <div class="cw-topline">
      <app-info text="The plan your institute has set for your courses. Pick a course, then a topic, then a sub-topic to open its videos and notes. Overdue means the finish-by date has passed and it isn't complete yet. A padlock means the course isn't open to you yet." />
      @if (data(); as d) {
        @if (d.summary.total) {
          <span class="cw-overall" id="overall">
            <strong>{{ d.summary.done }}</strong> of {{ d.summary.total }} done
            <span class="cw-bar"><i [style.width.%]="percent(d.summary.done, d.summary.total)"></i></span>
          </span>
        }
      }
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    <app-ask-ai />

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (data(); as d) {
      @if (!d.courses.length) {
        <div class="empty-state" id="no-coursework"><app-icon name="layers" [size]="32" /><p>No coursework yet</p></div>
      } @else {
        @if (opened() !== 'all') {
          <div class="seg-row" id="cw-filter" role="group" aria-label="Which items to show">
            <div class="seg">
              <button type="button" id="cw-scope" [attr.aria-pressed]="filter() !== 'all'" [class.on]="filter() !== 'all'" (click)="setFilter(opened())">
                <strong id="cw-filter-count">{{ matchCount() }} {{ matchCount() === 1 ? 'item' : 'items' }}</strong> {{ label(opened()) }}
              </button>
              <button type="button" id="cw-show-all" [attr.aria-pressed]="filter() === 'all'" [class.on]="filter() === 'all'" (click)="setFilter('all')">Show everything</button>
            </div>
          </div>
          @if (filter() !== 'all' && !view().length) { <div class="empty-state" id="cw-filter-empty"><app-icon name="check" [size]="32" /><p>Nothing here. You are all caught up.</p></div> }
        }

        <!-- Where the student is: All courses, then the course, then the topic. Each part can be clicked to go back. -->
        <nav class="cw-trail" id="trail" aria-label="Where you are">
          @if (course(); as c) {
            <button type="button" class="cw-trail-link" id="trail-all" (click)="backToCourses()">All courses</button>
            <span class="soft">›</span>
            @if (topic(); as t) {
              <button type="button" class="cw-trail-link" id="trail-course" (click)="backToTopics()">{{ c.name }}</button>
              <span class="soft">›</span>
              <strong>{{ t.topic.title }}</strong>
            } @else {
              <strong>{{ c.name }}</strong>
            }
          } @else {
            <strong>All courses</strong>
          }
        </nav>

        <section id="tiles" aria-label="Pick a course, topic or sub-topic">
          @if (course(); as c) {
            @if (topic(); as t) {
              <!-- Level 3: the sub-topics of the chosen topic -->
              <div class="cw-tiles" id="tiles-subtopics">
                @for (sub of t.topic.subtopics; track sub.id) {
                  <button type="button" class="cw-tile" [class.selected]="chosen()?.sub?.id === sub.id" [attr.aria-current]="chosen()?.sub?.id === sub.id ? 'true' : null"
                    [attr.data-sub]="sub.title" (click)="select({ course: c, subject: t.subject, topic: t.topic, sub })">
                    <span class="cw-tile-top">
                      @if (sub.locked) {
                        <app-icon name="lock" [size]="18" class="soft-icon" />
                      } @else {
                        <app-icon [name]="sub.done ? 'check' : sub.overdue ? 'flag' : 'clock'" [size]="18" [class]="sub.done ? 'ok-icon' : sub.overdue ? 'bad-icon' : 'soft-icon'" />
                      }
                      <strong>{{ sub.title }}</strong>
                    </span>
                    <span class="cw-tile-meta">
                      @if (sub.free) { <span class="status ok" title="Free to open">Free</span> }
                      @if (sub.locked) { <span>Locked</span> }
                      @else if (sub.done) { <span>Done</span> }
                      @else if (sub.overdue) { <span class="status bad">Overdue</span> }
                      @else if (sub.due) { <span>Due {{ shortDate(sub.due) }}</span> }
                    </span>
                  </button>
                } @empty {
                  <p class="muted">Nothing here.</p>
                }
              </div>
            } @else {
              <!-- Level 2: the topics of the chosen course, under their subject headings -->
              <div id="tiles-topics">
                @for (subject of c.subjects; track subject.paper_id) {
                  <h3 class="cw-tile-heading" [attr.data-subject]="subject.name">{{ subject.name }}</h3>
                  <div class="cw-tiles">
                    @for (tp of subject.topics; track tp.id) {
                      <button type="button" class="cw-tile" [attr.data-topic]="tp.title" (click)="pickTopic(tp.id)">
                        <span class="cw-tile-top"><app-icon name="book-open" [size]="18" /><strong>{{ tp.title }}</strong></span>
                        @if (!c.locked) {
                          <span class="cw-tile-meta"><span>{{ tp.progress.done }}/{{ tp.progress.total }} done</span></span>
                          <span class="cw-bar"><i [style.width.%]="percent(tp.progress.done, tp.progress.total)"></i></span>
                        }
                      </button>
                    }
                  </div>
                }
              </div>
            }
          } @else {
            <!-- Level 1: the courses -->
            <div class="cw-tiles" id="tiles-courses">
              @for (c of view(); track c.id) {
                <button type="button" class="cw-tile" [attr.data-course]="c.name" (click)="pickCourse(c.id)">
                  <span class="cw-tile-top"><app-icon [name]="c.locked ? 'lock' : 'layers'" [size]="20" /><strong>{{ c.name }}</strong></span>
                  @if (c.locked) {
                    <span class="cw-tile-meta"><span>Not enrolled yet</span></span>
                  } @else {
                    <span class="cw-tile-meta">
                      <span>{{ c.progress.done }}/{{ c.progress.total }} done</span>
                      @if (c.overdue) { <span class="status bad" title="Overdue">{{ c.overdue }} overdue</span> }
                    </span>
                    <span class="cw-bar"><i [style.width.%]="percent(c.progress.done, c.progress.total)"></i></span>
                  }
                </button>
              } @empty {
                <p class="muted">Nothing here.</p>
              }
            </div>
          }
        </section>

        <section class="cw-detail" id="detail" aria-live="polite">
          @if (chosen(); as pick) {
            <div class="card">
              <p class="soft cw-crumb" id="crumb">{{ pick.course.name }} › {{ pick.subject.name }} › {{ pick.topic.title }}</p>
              <h2 id="sub-name">{{ pick.sub.title }}</h2>
              @if (pick.sub.locked) {
                <div class="empty-state" id="locked-note" style="padding: 1.2rem 0">
                  <app-icon name="lock" [size]="32" />
                  <p><strong>This is locked</strong></p>
                  <p class="soft">It is part of a course you are not enrolled in yet. It opens as soon as your institute approves your enrolment.</p>
                </div>
              } @else {
              @if (pick.sub.free) { <p class="soft" id="free-note"><app-icon name="lock" [size]="14" /> Free sample. The rest of {{ pick.course.name }} opens once you are enrolled.</p> }
              <p class="cw-due" id="due" [class.late]="pick.sub.overdue && !pick.sub.done" [class.done]="pick.sub.done">
                <app-icon [name]="pick.sub.done ? 'check' : pick.sub.overdue ? 'flag' : 'calendar'" [size]="16" /> {{ dueText(pick.sub) }}
              </p>
              @if (pick.sub.note) { <p class="cw-note" id="note">{{ pick.sub.note }}</p> }

              @if (pick.sub.materials.length) {
                <ul class="cw-material" id="material">
                  @for (item of pick.sub.materials; track $index) {
                    <li>
                      @if (item.type === 'link') {
                        <app-icon name="link" [size]="16" />
                        <a [href]="item.url" target="_blank" rel="noopener noreferrer">{{ item.title }}</a>
                      } @else {
                        <app-icon name="file" [size]="16" />
                        <span>{{ item.title }} <span class="soft">{{ item.kind === 'pdf' ? 'PDF' : 'Video' }}@if (item.size) { · {{ size(item.size) }} }</span></span>
                        <button class="btn small secondary" type="button" [disabled]="opening() === item.file_id" (click)="openFile(pick, item)">
                          <app-icon [name]="item.kind === 'pdf' ? 'eye' : 'play'" [size]="15" /> {{ item.kind === 'pdf' ? 'Open' : 'Play' }}
                        </button>
                      }
                    </li>
                  }
                </ul>
              }

              @if (pick.sub.live_classes?.length) {
                <h3 style="margin: 1rem 0 0.3rem"><app-icon name="play" [size]="16" /> Live classes</h3>
                <div id="live-classes">
                  @for (live of pick.sub.live_classes; track live.id) {
                    <div class="cw-live" [attr.data-live]="live.title">
                      <strong>{{ live.title }}</strong> <span class="soft">{{ shortDate(live.held_on) }}@if (live.held_time) { · {{ live.held_time }} }</span>
                      @if (live.description) { <p class="soft" style="margin: 0.1rem 0 0.3rem">{{ live.description }}</p> }
                      <ul class="cw-material">
                        @for (item of live.materials; track $index) {
                          <li>
                            @if (item.type === 'link') {
                              <app-icon name="link" [size]="16" /> <a [href]="item.url" target="_blank" rel="noopener noreferrer">{{ item.title }}</a>
                            } @else {
                              <app-icon name="file" [size]="16" />
                              <span>{{ item.title }} <span class="soft">{{ item.kind === 'pdf' ? 'PDF' : 'Video' }}</span></span>
                              <button class="btn small secondary" type="button" [disabled]="opening() === item.file_id" (click)="openFile(pick, item)">
                                <app-icon [name]="item.kind === 'pdf' ? 'eye' : 'play'" [size]="15" /> {{ item.kind === 'pdf' ? 'Open' : 'Play' }}
                              </button>
                            }
                          </li>
                        }
                      </ul>
                    </div>
                  }
                </div>
              }

              @if (playing(); as video) {
                <video id="player" controls autoplay [src]="video.url" (error)="renew(pick, video.id)" style="width: 100%; border-radius: 8px; margin-top: 0.6rem"></video>
              }

              <div class="row cw-actions">
                @if (pick.sub.done) {
                  <button class="btn secondary" type="button" id="toggle-done" [disabled]="busy()" (click)="toggleDone(pick)"><app-icon name="rotate" [size]="16" /> Mark not complete</button>
                } @else {
                  <button class="btn" type="button" id="toggle-done" [disabled]="busy()" (click)="toggleDone(pick)"><app-icon name="check" [size]="16" /> Mark complete</button>
                }
              </div>
              }
            </div>
          } @else {
            <div class="empty-state"><app-icon name="layers" [size]="32" /><p>Pick a sub-topic to see its videos and notes</p></div>
          }
        </section>
      }
    }
  `,
})
export class StudentCourseworkPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  /** Which sub-topics to show: everything, only those due this week, only the overdue ones, or only those not done yet. Set by the link that opened the page. */
  readonly filter = signal<Filter>('all');
  /** The filter the page was opened with. It stays, so the switch can go back to it after Show everything. */
  readonly opened = signal<Filter>('all');
  label(mode: Filter): string {
    return { all: '', week: 'due this week', overdue: 'overdue', pending: 'not done yet' }[mode];
  }

  readonly data = signal<StudentCoursework | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  /** The course the student has drilled into, or null for the course tiles. */
  readonly courseId = signal<string | null>(null);
  /** The topic the student has drilled into, or null for the topic tiles. */
  readonly topicId = signal<string | null>(null);
  readonly selectedId = signal<string | null>(null);
  readonly opening = signal<string | null>(null);
  readonly playing = signal<{ id: string; url: string } | null>(null);
  private renewals = 0;

  size = formatSize;
  shortDate = shortDate;

  /** The chosen sub-topic with its place in the tree, from the latest data. */
  readonly chosen = computed<Chosen | null>(() => {
    const id = this.selectedId();
    for (const course of this.data()?.courses ?? [])
      for (const subject of course.subjects)
        for (const topic of subject.topics)
          for (const sub of topic.subtopics) if (sub.id === id) return { course, subject, topic, sub };
    return null;
  });

  /** The courses to show as tiles: all of them, or only the ones that still hold a sub-topic matching the filter. */
  readonly view = computed<StudentCourse[]>(() => this.treeFor(this.filter()));

  /** The course the student has drilled into, from what the filter lets through. */
  readonly course = computed<StudentCourse | null>(() => this.view().find((c) => c.id === this.courseId()) ?? null);

  /** The topic the student has drilled into, with its subject, from the course above. */
  readonly topic = computed<{ subject: StudentSubject; topic: StudentTopic } | null>(() => {
    const course = this.course();
    const id = this.topicId();
    if (!course || !id) return null;
    for (const subject of course.subjects)
      for (const topic of subject.topics) if (topic.id === id) return { subject, topic };
    return null;
  });

  /** The tree with only what the filter lets through. */
  private treeFor(mode: Filter): StudentCourse[] {
    const courses = this.data()?.courses ?? [];
    if (mode === 'all') return courses;
    const wanted = (sub: StudentSubtopic): boolean =>
      !sub.locked && !sub.done && (mode === 'pending' || (mode === 'overdue' ? sub.overdue : sub.days_left !== null && sub.days_left >= 0 && sub.days_left <= 7));
    const out: StudentCourse[] = [];
    for (const course of courses) {
      const subjects: StudentSubject[] = [];
      for (const subject of course.subjects) {
        const topics: StudentTopic[] = [];
        for (const topic of subject.topics) {
          const subtopics = topic.subtopics.filter(wanted);
          if (subtopics.length) topics.push({ ...topic, subtopics });
        }
        if (topics.length) subjects.push({ ...subject, topics });
      }
      if (subjects.length) out.push({ ...course, subjects });
    }
    return out;
  }

  /** How many sub-topics the filter lets through. */
  readonly matchCount = computed(() => this.treeFor(this.opened()).reduce((n, c) => n + c.subjects.reduce((m, sj) => m + sj.topics.reduce((k, t) => k + t.subtopics.length, 0), 0), 0));

  ngOnInit(): void {
    const show = this.route.snapshot.queryParamMap.get('show');
    if (show === 'week' || show === 'overdue' || show === 'pending') {
      this.filter.set(show);
      this.opened.set(show);
    }
    void this.load();
  }

  /** Switch between the filtered list and everything. If the sub-topic on the right is not in the new list, the first one in it is opened. */
  setFilter(mode: Filter): void {
    this.filter.set(mode);
    const shown = this.view().flatMap((course) => course.subjects.flatMap((subject) => subject.topics.flatMap((topic) => topic.subtopics.map((sub) => ({ course, subject, topic, sub })))));
    if (shown.length && !shown.some((x) => x.sub.id === this.selectedId())) this.select(shown.find((x) => !x.sub.locked) ?? shown[0]);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.api.myCoursework();
      this.data.set(data);
      // Start on the first sub-topic that is not done (else the first one), with its course and topic open.
      const all = this.view().flatMap((course) => course.subjects.flatMap((subject) => subject.topics.flatMap((topic) => topic.subtopics.map((sub) => ({ course, subject, topic, sub })))));
      const first = all.find((x) => !x.sub.done && !x.sub.locked) ?? all.find((x) => !x.sub.locked) ?? all[0];
      if (first) this.select(first);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  /** Open a course's topic tiles. */
  pickCourse(id: string): void {
    this.courseId.set(id);
    this.topicId.set(null);
  }

  /** Open a topic's sub-topic tiles. */
  pickTopic(id: string): void {
    this.topicId.set(id);
  }

  /** Back to the course tiles. The sub-topic below stays open. */
  backToCourses(): void {
    this.courseId.set(null);
    this.topicId.set(null);
  }

  /** Back to the topic tiles of the same course. */
  backToTopics(): void {
    this.topicId.set(null);
  }

  /** Open a sub-topic: its course and topic become the place the student is in, and the sub-topic shows below. */
  select(pick: Chosen): void {
    this.courseId.set(pick.course.id);
    this.topicId.set(pick.topic.id);
    this.selectedId.set(pick.sub.id);
    this.playing.set(null);
    this.renewals = 0;
  }

  percent(done: number, total: number): number {
    return total ? Math.round((done / total) * 100) : 0;
  }

  dueText(sub: StudentSubtopic): string {
    if (sub.done) return `Done ${shortDate((sub.done_at ?? '').slice(0, 10))}`;
    if (sub.due === null || sub.days_left === null) return 'No finish-by date';
    const days = sub.days_left;
    const when = days < 0 ? `Overdue by ${-days} ${days === -1 ? 'day' : 'days'}` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
    return `${when} · ${shortDate(sub.due)}`;
  }

  async toggleDone(pick: Chosen): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const data = await (pick.sub.done ? this.api.markNotDone(pick.course.id, pick.sub.id) : this.api.markDone(pick.course.id, pick.sub.id));
      this.data.set(data);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async openFile(pick: Chosen, item: Extract<StudentMaterial, { type: 'file' }>): Promise<void> {
    if (this.opening()) return;
    this.opening.set(item.file_id);
    this.error.set(null);
    // A new tab must be opened right away, while the click is still fresh, or the browser may block it.
    const tab = item.kind === 'pdf' ? (isNative() ? null : window.open('', '_blank')) : null;
    if (tab) tab.opener = null;
    try {
      const link = await this.api.fileLink(pick.course.id, item.file_id);
      if (item.kind === 'pdf') {
        if (isNative()) await openInApp(link.url);
        else if (tab) tab.location.href = link.url;
        else window.location.href = link.url;
      } else {
        this.renewals = 0;
        this.playing.set({ id: item.file_id, url: link.url });
      }
    } catch (error) {
      tab?.close();
      this.error.set(error as ApiError);
    } finally {
      this.opening.set(null);
    }
  }

  /** A video link lasts a few minutes. If playing fails because it ran out, get a new one once or twice. */
  async renew(pick: Chosen, fileId: string): Promise<void> {
    if (this.renewals >= 2) {
      this.playing.set(null);
      this.error.set({ status: -1, detail: "This video couldn't be played. Try again later, or tell your institute." });
      return;
    }
    this.renewals++;
    try {
      const link = await this.api.fileLink(pick.course.id, fileId);
      this.playing.set({ id: fileId, url: link.url });
    } catch (error) {
      this.playing.set(null);
      this.error.set(error as ApiError);
    }
  }
}

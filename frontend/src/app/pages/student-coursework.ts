import { isNative, openInApp } from '../core/native';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../core/api.service';
import { formatSize, shortDate } from '../core/format';
import { ApiError, StudentCourse, StudentCoursework, StudentMaterial, StudentSubject, StudentSubtopic, StudentTopic } from '../core/models';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

interface Chosen {
  course: StudentCourse;
  subject: StudentSubject;
  topic: StudentTopic;
  sub: StudentSubtopic;
}

/**
 * A student's coursework: a tree on the left (course, subject, topic, sub-topic, each with its progress) and the chosen
 * sub-topic on the right, with its note, finish-by date, material and a Mark complete button.
 */
@Component({
  selector: 'app-student-coursework',
  imports: [Icon, InfoTip],
  template: `
    <div class="cw-topline">
      <app-info text="The plan your institute has set for your courses. Open the material, then mark each sub-topic complete. Overdue means the finish-by date has passed and it isn't complete yet. A padlock means the course isn't open to you yet." />
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

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (data(); as d) {
      @if (!d.courses.length) {
        <div class="empty-state" id="no-coursework"><app-icon name="layers" [size]="32" /><p>No coursework yet</p></div>
      } @else {
        @if (filter() !== 'all') {
          <div class="filter-bar" id="cw-filter" role="status">
            <app-icon name="filter" [size]="18" />
            <span><strong id="cw-filter-count">{{ matchCount() }} {{ matchCount() === 1 ? 'item' : 'items' }}</strong> {{ filterLabel() }}</span>
            <button type="button" class="btn secondary small" id="cw-show-all" (click)="clearFilter()"><app-icon name="x" [size]="14" /> Show everything</button>
          </div>
          @if (!view().length) { <div class="empty-state" id="cw-filter-empty"><app-icon name="check" [size]="32" /><p>Nothing here. You are all caught up.</p></div> }
        }
        <div class="cw-student">
          <nav class="card cw-nav" id="nav" aria-label="Coursework">
            @for (course of view(); track course.id) {
              <div class="cw-node" [attr.data-course]="course.name">
                <button type="button" class="cw-row cw-course" [attr.aria-expanded]="isOpen('c:' + course.id)" (click)="toggle('c:' + course.id)">
                  <app-icon [name]="isOpen('c:' + course.id) ? 'chevron' : 'chevron-right'" [size]="16" />
                  <strong>{{ course.name }}</strong>
                  @if (course.locked) {
                    <app-icon name="lock" [size]="14" class="soft-icon" />
                  } @else {
                    @if (course.overdue) { <span class="status bad" title="Overdue">{{ course.overdue }}</span> }
                    <span class="cw-count">{{ course.progress.done }}/{{ course.progress.total }}</span>
                  }
                </button>
                @if (!course.locked) { <span class="cw-bar"><i [style.width.%]="percent(course.progress.done, course.progress.total)"></i></span> }
                @if (isOpen('c:' + course.id)) {
                  @for (subject of course.subjects; track subject.paper_id) {
                    <div class="cw-node cw-level-1" [attr.data-subject]="subject.name">
                      <button type="button" class="cw-row" [attr.aria-expanded]="isOpen('s:' + course.id + ':' + subject.paper_id)" (click)="toggle('s:' + course.id + ':' + subject.paper_id)">
                        <app-icon [name]="isOpen('s:' + course.id + ':' + subject.paper_id) ? 'chevron' : 'chevron-right'" [size]="16" />
                        <span>{{ subject.name }}</span>
                        @if (!course.locked) { <span class="cw-count">{{ subject.progress.done }}/{{ subject.progress.total }}</span> }
                      </button>
                      @if (isOpen('s:' + course.id + ':' + subject.paper_id)) {
                        @for (topic of subject.topics; track topic.id) {
                          <div class="cw-node cw-level-2" [attr.data-topic]="topic.title">
                            <button type="button" class="cw-row" [attr.aria-expanded]="isOpen('t:' + topic.id)" (click)="toggle('t:' + topic.id)">
                              <app-icon [name]="isOpen('t:' + topic.id) ? 'chevron' : 'chevron-right'" [size]="16" />
                              <span>{{ topic.title }}</span>
                              @if (!course.locked) { <span class="cw-count">{{ topic.progress.done }}/{{ topic.progress.total }}</span> }
                            </button>
                            @if (isOpen('t:' + topic.id)) {
                              @for (sub of topic.subtopics; track sub.id) {
                                <button type="button" class="cw-row cw-leaf" [class.selected]="chosen()?.sub?.id === sub.id" [attr.aria-current]="chosen()?.sub?.id === sub.id ? 'true' : null"
                                  [attr.data-sub]="sub.title" (click)="select({ course, subject, topic, sub })">
                                  @if (sub.locked) {
                                    <app-icon name="lock" [size]="15" class="soft-icon" />
                                  } @else {
                                    <app-icon [name]="sub.done ? 'check' : sub.overdue ? 'flag' : 'clock'" [size]="15" [class]="sub.done ? 'ok-icon' : sub.overdue ? 'bad-icon' : 'soft-icon'" />
                                  }
                                  <span class="cw-leaf-title">{{ sub.title }}</span>
                                  @if (sub.free) { <span class="status ok" title="Free to open">Free</span> }
                                </button>
                              }
                            }
                          </div>
                        }
                      }
                    </div>
                  }
                }
              </div>
            }
          </nav>

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
              <div class="empty-state"><app-icon name="layers" [size]="32" /><p>Pick a sub-topic</p></div>
            }
          </section>
        </div>
      }
    }
  `,
})
export class StudentCourseworkPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  /** Which sub-topics to show: everything, only those due this week, only the overdue ones, or only those not done yet. Set by the link that opened the page. */
  readonly filter = signal<'all' | 'week' | 'overdue' | 'pending'>('all');
  readonly filterLabel = computed(() => ({ all: '', week: 'due this week', overdue: 'overdue', pending: 'not done yet' })[this.filter()]);

  readonly data = signal<StudentCoursework | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly open = signal<Set<string>>(new Set());
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

  /** The tree to show: all of it, or only the courses, subjects and topics that still hold a sub-topic matching the filter. */
  readonly view = computed<StudentCourse[]>(() => {
    const courses = this.data()?.courses ?? [];
    const mode = this.filter();
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
  });

  /** How many sub-topics the filter lets through. */
  readonly matchCount = computed(() => this.view().reduce((n, c) => n + c.subjects.reduce((m, sj) => m + sj.topics.reduce((k, t) => k + t.subtopics.length, 0), 0), 0));

  ngOnInit(): void {
    const show = this.route.snapshot.queryParamMap.get('show');
    if (show === 'week' || show === 'overdue' || show === 'pending') this.filter.set(show);
    void this.load();
  }

  clearFilter(): void {
    this.filter.set('all');
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.api.myCoursework();
      this.data.set(data);
      // Start on the first sub-topic that is not done (else the first one), with its path open.
      const all = this.view().flatMap((course) => course.subjects.flatMap((subject) => subject.topics.flatMap((topic) => topic.subtopics.map((sub) => ({ course, subject, topic, sub })))));
      const first = all.find((x) => !x.sub.done && !x.sub.locked) ?? all.find((x) => !x.sub.locked) ?? all[0];
      this.open.set(new Set(this.view().filter((c) => !c.locked).map((c) => `c:${c.id}`)));
      if (first) this.select(first);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  isOpen(key: string): boolean {
    return this.filter() !== 'all' || this.open().has(key); // while a filter is on, everything that matches is shown open
  }

  toggle(key: string): void {
    const next = new Set(this.open());
    if (!next.delete(key)) next.add(key);
    this.open.set(next);
  }

  select(pick: Chosen): void {
    const next = new Set(this.open());
    next.add(`c:${pick.course.id}`).add(`s:${pick.course.id}:${pick.subject.paper_id}`).add(`t:${pick.topic.id}`);
    this.open.set(next);
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

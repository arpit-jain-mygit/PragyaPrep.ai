import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AdminCourse, ApiError, CopyResult, CourseFile, CourseworkPlan, WorkMaterial, WorkSubject, WorkSubtopic, WorkTopic } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

/** "10 Feb 2027" from "2027-02-10", without any time-zone shift. */
export function shortDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * A course's coursework plan: subject, topic, sub-topic. The admin adds topics and sub-topics, attaches the course's files and links,
 * sets finish-by dates (on a sub-topic, a topic or a subject) and publishes sub-topics when they are ready for students.
 */
@Component({
  selector: 'app-admin-coursework',
  imports: [FormsModule, RouterLink, Icon, InfoTip],
  template: `
    <div class="page-head">
      <h1>
        Coursework{{ plan() ? ': ' + plan()!.course.name : '' }}
        <app-info text="Build the plan for this course: topics and sub-topics with material and finish-by dates. Students see a sub-topic once it is published. A date on a subject or topic applies to everything below it that has no date of its own." />
      </h1>
      <span class="row">
        <button class="btn secondary small" type="button" id="open-copy" (click)="toggleCopy()" [attr.aria-expanded]="copying()"><app-icon name="copy" [size]="16" /> Copy from…</button>
        <a class="btn secondary small" [routerLink]="['/', tenants.slug(), 'admin', 'courses']"><app-icon name="arrow-left" [size]="16" /> Courses</a>
      </span>
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (plan(); as p) {
      <div class="stat-grid" id="counts">
        <div class="stat"><div class="num" id="c-topics">{{ p.counts.topics }}</div><div class="label">Topics</div></div>
        <div class="stat"><div class="num" id="c-subtopics">{{ p.counts.subtopics }}</div><div class="label">Sub-topics</div></div>
        <div class="stat"><div class="num" id="c-published">{{ p.counts.published }}</div><div class="label">Published</div></div>
        <div class="stat"><div class="num" id="c-dated">{{ p.counts.with_dates }}</div><div class="label">With a date</div></div>
      </div>

      @if (copying()) {
        <section class="card cw-copy" id="copy-panel" aria-label="Copy from another course">
          <div class="row q-head">
            <strong>Copy from another course</strong>
            <app-info text="Copies are independent: later changes to the other course don't reach this one. Files are shared, not uploaded again. Only subjects this course also has are copied." />
            <select aria-label="Course to copy from" id="copy-source" [ngModel]="sourceId()" (ngModelChange)="pickSource($event)" [ngModelOptions]="{ standalone: true }" style="margin-left: auto; width: auto">
              <option value="">Choose a course…</option>
              @for (course of otherCourses(); track course.id) { <option [value]="course.id">{{ course.name }}</option> }
            </select>
          </div>

          @if (sourceLoading()) {
            <p class="muted">Loading…</p>
          } @else if (sourcePlan(); as src) {
            @if (!offered().length) {
              <div class="empty-state"><app-icon name="layers" [size]="32" /><p>Nothing to copy: {{ src.course.name }} has no topics in this course's subjects</p></div>
            }
            @for (subject of offered(); track subject.paper_id) {
              <div class="cw-pick-subject" [attr.data-pick-subject]="subject.paper_id">
                <label class="cw-check">
                  <input type="checkbox" [checked]="subjectState(subject) === 'all'" [indeterminate]="subjectState(subject) === 'some'" (change)="tickSubject(subject, $any($event.target).checked)" />
                  <strong>{{ subject.name }}</strong>
                </label>
                @for (topic of subject.topics; track topic.id) {
                  <div class="cw-pick-topic" [attr.data-pick-topic]="topic.title">
                    <label class="cw-check">
                      <input type="checkbox" [checked]="topicState(topic) === 'all'" [indeterminate]="topicState(topic) === 'some'" (change)="tickTopic(topic, $any($event.target).checked)" />
                      {{ topic.title }} <span class="soft">{{ topic.subtopics.length }}</span>
                    </label>
                    @for (sub of topic.subtopics; track sub.id) {
                      <label class="cw-check cw-pick-sub" [attr.data-pick-sub]="sub.title">
                        <input type="checkbox" [checked]="ticked().has(sub.id)" (change)="tickSub(sub, $any($event.target).checked)" /> {{ sub.title }}
                      </label>
                    }
                  </div>
                }
              </div>
            }
            @if (skippedSubjects() > 0) { <p class="soft" id="left-out"><app-icon name="info" [size]="14" /> {{ skippedSubjects() }} {{ skippedSubjects() === 1 ? 'subject' : 'subjects' }} this course doesn't have {{ skippedSubjects() === 1 ? 'is' : 'are' }} left out</p> }
            @if (offered().length) {
              <div class="row cw-copy-actions">
                <label class="cw-check"><input type="checkbox" [(ngModel)]="keepDates" name="keep-dates" /> Keep dates</label>
                <label class="cw-check"><input type="checkbox" [(ngModel)]="keepStatus" name="keep-status" /> Keep status <span class="soft">(otherwise Draft)</span></label>
                <button class="btn" type="button" id="do-copy" [disabled]="busy() || !pickedCount()" (click)="copy()"><app-icon name="copy" [size]="16" /> Copy {{ pickedCount() }}</button>
              </div>
            }
          }
        </section>
      }

      @if (copyResult(); as done) {
        <div class="alert ok" role="status" id="copy-result">
          Copied {{ done.subtopics_added }} {{ done.subtopics_added === 1 ? 'sub-topic' : 'sub-topics' }}@if (done.topics_added) { in {{ done.topics_added }} new {{ done.topics_added === 1 ? 'topic' : 'topics' }} }
          @if (done.subtopics_skipped) { · {{ done.subtopics_skipped }} skipped, already here }
          @if (done.files_linked) { · {{ done.files_linked }} {{ done.files_linked === 1 ? 'file' : 'files' }} added to Files }
          @if (done.subjects_skipped.length) { · left out: {{ done.subjects_skipped.join(', ') }} }
        </div>
      }

      @if (!p.subjects.length) {
        <div class="empty-state"><app-icon name="layers" [size]="32" /><p>This course has no subjects yet. Choose them on the Courses page.</p></div>
      }

      <div class="cw-grid">
        <div class="cw-tree" id="tree">
          @for (subject of p.subjects; track subject.paper_id) {
            <section class="card cw-subject" [attr.data-subject]="subject.paper_id">
              <div class="row q-head">
                <strong>{{ subject.name }}</strong>
                @if (!subject.in_course) { <span class="status warn" title="This subject was taken off the course">off course</span> }
                <label class="cw-date" title="Finish-by date for the whole subject">
                  <app-icon name="calendar" [size]="15" />
                  <input type="date" [attr.aria-label]="'Finish-by date for ' + subject.name" [ngModel]="subject.due ?? ''" (ngModelChange)="subjectDate(subject, $event)" [ngModelOptions]="{ standalone: true }" />
                </label>
              </div>

              @for (topic of subject.topics; track topic.id) {
                <div class="cw-topic" [attr.data-topic]="topic.title">
                  <div class="row q-head">
                    <strong>{{ topic.title }}</strong>
                    <span class="soft">{{ topic.subtopics.length }}</span>
                    <label class="cw-date" title="Finish-by date for the whole topic">
                      <app-icon name="calendar" [size]="15" />
                      <input type="date" [attr.aria-label]="'Finish-by date for ' + topic.title" [ngModel]="topic.due ?? ''" (ngModelChange)="topicDate(topic, $event)" [ngModelOptions]="{ standalone: true }" />
                    </label>
                    <span class="icon-actions">
                      <button class="icon-btn" type="button" title="Move up" [disabled]="busy()" (click)="move(topic.id, 'up')"><app-icon name="chevron-up" /><span class="sr-only">Move up</span></button>
                      <button class="icon-btn" type="button" title="Move down" [disabled]="busy()" (click)="move(topic.id, 'down')"><app-icon name="chevron" /><span class="sr-only">Move down</span></button>
                      @if (confirming() === topic.id) {
                        <button class="btn danger small" type="button" [disabled]="busy()" (click)="remove(topic.id)">Delete with {{ topic.subtopics.length }}</button>
                        <button class="icon-btn" type="button" title="Keep" (click)="confirming.set(null)"><app-icon name="x" /><span class="sr-only">Keep</span></button>
                      } @else {
                        <button class="icon-btn danger" type="button" title="Delete topic" [disabled]="busy()" (click)="confirming.set(topic.id)"><app-icon name="trash" /><span class="sr-only">Delete topic</span></button>
                      }
                    </span>
                  </div>

                  <ul class="cw-subs">
                    @for (sub of topic.subtopics; track sub.id) {
                      <li [class.selected]="selected() === sub.id" [attr.data-sub]="sub.title">
                        <button type="button" class="cw-sub" (click)="select(sub)">
                          <span class="status" [class.ok]="sub.status === 'published'" [title]="sub.status === 'published' ? 'Published' : 'Draft'"></span>
                          <span class="cw-sub-title">{{ sub.title }}</span>
                          @if (sub.materials.length) { <span class="soft" title="Material"><app-icon name="file" [size]="14" /> {{ sub.materials.length }}</span> }
                          @if (sub.effective_due) { <span class="soft" [title]="dueSource(sub)"><app-icon name="calendar" [size]="14" /> {{ date(sub.effective_due) }}</span> }
                        </button>
                        <span class="icon-actions">
                          <button class="icon-btn" type="button" title="Move up" [disabled]="busy()" (click)="move(sub.id, 'up')"><app-icon name="chevron-up" /><span class="sr-only">Move up</span></button>
                          <button class="icon-btn" type="button" title="Move down" [disabled]="busy()" (click)="move(sub.id, 'down')"><app-icon name="chevron" /><span class="sr-only">Move down</span></button>
                        </span>
                      </li>
                    }
                  </ul>

                  <form class="cw-add" (ngSubmit)="addSub(topic)" novalidate>
                    <input type="text" [attr.aria-label]="'New sub-topic in ' + topic.title" placeholder="New sub-topic" maxlength="120"
                      [ngModel]="subDraft[topic.id] ?? ''" (ngModelChange)="subDraft[topic.id] = $event" [ngModelOptions]="{ standalone: true }" />
                    <button class="icon-btn" type="submit" title="Add sub-topic" [disabled]="busy() || !(subDraft[topic.id] ?? '').trim()"><app-icon name="plus" /><span class="sr-only">Add sub-topic</span></button>
                  </form>
                </div>
              }

              <form class="cw-add" (ngSubmit)="addTopic(subject)" novalidate>
                <input type="text" [attr.aria-label]="'New topic in ' + subject.name" placeholder="New topic" maxlength="120" [attr.list]="'options-' + subject.paper_id"
                  [ngModel]="topicDraft[subject.paper_id] ?? ''" (ngModelChange)="topicDraft[subject.paper_id] = $event" [ngModelOptions]="{ standalone: true }" />
                <datalist [id]="'options-' + subject.paper_id">
                  @for (option of subject.topic_options; track option) { <option [value]="option"></option> }
                </datalist>
                <button class="btn small" type="submit" [disabled]="busy() || !(topicDraft[subject.paper_id] ?? '').trim()"><app-icon name="plus" [size]="16" /> Topic</button>
              </form>
            </section>
          }
        </div>

        <aside class="cw-editor" id="editor" aria-live="polite">
          @if (current(); as sub) {
            <div class="card">
              <form (ngSubmit)="save()" novalidate>
                <div class="field">
                  <label for="sub-title">Name</label>
                  <input id="sub-title" name="title" type="text" maxlength="120" [(ngModel)]="form.title" />
                </div>
                <div class="field">
                  <label for="sub-note">Note <app-info text="A short instruction or summary for students." /></label>
                  <textarea id="sub-note" name="note" rows="4" maxlength="2000" [(ngModel)]="form.note"></textarea>
                </div>
                <div class="field">
                  <label for="sub-due">Finish by <app-info text="Leave empty to follow the topic's or subject's date." /></label>
                  <input id="sub-due" name="due" type="date" [(ngModel)]="form.due" />
                  @if (!form.due && sub.effective_due) { <p class="hint">Follows the {{ sub.due_from }}'s date: {{ date(sub.effective_due) }}</p> }
                </div>

                <div class="field">
                  <label>Material</label>
                  <ul class="cw-material" id="material">
                    @for (item of form.materials; track $index) {
                      <li>
                        <app-icon [name]="icon(item)" [size]="16" />
                        <span>{{ materialTitle(item) }}</span>
                        <button class="icon-btn" type="button" title="Remove" (click)="removeMaterial($index)"><app-icon name="x" /><span class="sr-only">Remove</span></button>
                      </li>
                    } @empty {
                      <li class="soft">Nothing attached yet</li>
                    }
                  </ul>
                  <div class="cw-attach">
                    <select name="pick" aria-label="Add a file" [(ngModel)]="pickedFile" (ngModelChange)="attachFile()">
                      <option value="">Add a file…</option>
                      @for (file of freeFiles(); track file.id) { <option [value]="file.id">{{ file.title }} ({{ file.kind === 'pdf' ? 'PDF' : 'Video' }})</option> }
                    </select>
                  </div>
                  <div class="cw-attach">
                    <input name="link-url" type="text" aria-label="Link" placeholder="https://…" [(ngModel)]="linkUrl" />
                    <input name="link-title" type="text" aria-label="Link name" placeholder="Name (optional)" maxlength="100" [(ngModel)]="linkTitle" />
                    <button class="icon-btn" type="button" title="Add link" [disabled]="!linkUrl.trim()" (click)="attachLink()"><app-icon name="link" /><span class="sr-only">Add link</span></button>
                  </div>
                </div>

                <div class="field">
                  <label>Status</label>
                  <div class="cw-status">
                    <label><input type="radio" name="status" value="draft" [(ngModel)]="form.status" /> Draft</label>
                    <label><input type="radio" name="status" value="published" [(ngModel)]="form.status" /> Published</label>
                  </div>
                </div>

                <div class="row">
                  <button class="btn" type="submit" [disabled]="busy()"><app-icon name="check" /> Save</button>
                  @if (confirming() === sub.id) {
                    <button class="btn danger small" type="button" [disabled]="busy()" (click)="remove(sub.id)">Yes, delete</button>
                    <button class="icon-btn" type="button" title="Keep" (click)="confirming.set(null)"><app-icon name="x" /><span class="sr-only">Keep</span></button>
                  } @else {
                    <button class="icon-btn danger" type="button" title="Delete sub-topic" [disabled]="busy()" (click)="confirming.set(sub.id)"><app-icon name="trash" /><span class="sr-only">Delete sub-topic</span></button>
                  }
                  @if (saved()) { <span class="status ok" role="status">Saved</span> }
                </div>
              </form>
            </div>
          } @else {
            <div class="empty-state"><app-icon name="layers" [size]="32" /><p>Pick a sub-topic to edit it</p></div>
          }
        </aside>
      </div>
    }
  `,
})
export class AdminCoursework implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly tenants = inject(TenantService);

  readonly courseId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly plan = signal<CourseworkPlan | null>(null);
  readonly files = signal<CourseFile[]>([]);
  readonly selected = signal<string | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly saved = signal(false);
  readonly confirming = signal<string | null>(null);
  readonly error = signal<ApiError | null>(null);

  // Copying from another course
  readonly copying = signal(false);
  readonly allCourses = signal<AdminCourse[]>([]);
  readonly sourceId = signal('');
  readonly sourcePlan = signal<CourseworkPlan | null>(null);
  readonly sourceLoading = signal(false);
  readonly ticked = signal<Set<string>>(new Set());
  readonly copyResult = signal<CopyResult | null>(null);
  keepDates = false;
  keepStatus = false;

  readonly otherCourses = computed(() => this.allCourses().filter((c) => c.id !== this.courseId));

  /** Source subjects that this course also has, and that have topics. */
  readonly offered = computed<WorkSubject[]>(() => {
    const mine = new Set((this.plan()?.subjects ?? []).filter((s) => s.in_course).map((s) => s.paper_id));
    return (this.sourcePlan()?.subjects ?? []).filter((s) => mine.has(s.paper_id) && s.topics.length);
  });

  readonly skippedSubjects = computed(() => {
    const offered = new Set(this.offered().map((s) => s.paper_id));
    return (this.sourcePlan()?.subjects ?? []).filter((s) => s.topics.length && !offered.has(s.paper_id)).length;
  });

  /** How many sub-topics (and empty topics) are ticked. */
  readonly pickedCount = computed(() => {
    const ticked = this.ticked();
    let count = 0;
    for (const subject of this.offered()) for (const topic of subject.topics) count += topic.subtopics.length ? topic.subtopics.filter((s) => ticked.has(s.id)).length : Number(ticked.has(topic.id));
    return count;
  });

  topicDraft: Record<string, string> = {};
  subDraft: Record<string, string> = {};
  form: { title: string; note: string; due: string; status: 'draft' | 'published'; materials: WorkMaterial[] } = { title: '', note: '', due: '', status: 'draft', materials: [] };
  pickedFile = '';
  linkUrl = '';
  linkTitle = '';

  /** The sub-topic being edited, as the latest plan has it. */
  readonly current = computed<WorkSubtopic | null>(() => {
    const id = this.selected();
    for (const subject of this.plan()?.subjects ?? []) for (const topic of subject.topics) for (const sub of topic.subtopics) if (sub.id === id) return sub;
    return null;
  });

  /** Files of this course that are ready and not attached yet. */
  readonly freeFiles = computed(() => {
    const used = new Set(this.formMaterialIds());
    return this.files().filter((file) => file.status === 'ready' && !used.has(file.id));
  });
  private readonly formTick = signal(0);

  date = shortDate;

  ngOnInit(): void {
    void this.load();
  }

  private formMaterialIds(): string[] {
    this.formTick();
    return this.form.materials.filter((m) => m.type === 'file').map((m) => (m as { file_id: string }).file_id);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [plan, files] = await Promise.all([this.api.coursework(this.courseId), this.api.courseFiles(this.courseId)]);
      this.plan.set(plan);
      this.files.set(files);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  async toggleCopy(): Promise<void> {
    const open = !this.copying();
    this.copying.set(open);
    if (open && !this.allCourses().length) {
      try {
        this.allCourses.set(await this.api.adminCourses());
      } catch (error) {
        this.error.set(error as ApiError);
      }
    }
  }

  async pickSource(id: string): Promise<void> {
    this.sourceId.set(id);
    this.sourcePlan.set(null);
    this.ticked.set(new Set());
    this.copyResult.set(null);
    if (!id) return;
    this.sourceLoading.set(true);
    try {
      this.sourcePlan.set(await this.api.coursework(id));
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.sourceLoading.set(false);
    }
  }

  private change_(ids: string[], on: boolean): void {
    const next = new Set(this.ticked());
    for (const id of ids) (on ? next.add(id) : next.delete(id));
    this.ticked.set(next);
  }

  private idsOf(topic: WorkTopic): string[] {
    return topic.subtopics.length ? topic.subtopics.map((s) => s.id) : [topic.id];
  }

  topicState(topic: WorkTopic): 'all' | 'some' | 'none' {
    const ids = this.idsOf(topic);
    const hit = ids.filter((id) => this.ticked().has(id)).length;
    return hit === 0 ? 'none' : hit === ids.length ? 'all' : 'some';
  }

  subjectState(subject: WorkSubject): 'all' | 'some' | 'none' {
    const states = subject.topics.map((t) => this.topicState(t));
    return states.every((s) => s === 'all') ? 'all' : states.every((s) => s === 'none') ? 'none' : 'some';
  }

  tickSub(sub: WorkSubtopic, on: boolean): void {
    this.change_([sub.id], on);
  }

  tickTopic(topic: WorkTopic, on: boolean): void {
    this.change_(this.idsOf(topic), on);
  }

  tickSubject(subject: WorkSubject, on: boolean): void {
    this.change_(subject.topics.flatMap((t) => this.idsOf(t)), on);
  }

  async copy(): Promise<void> {
    const ticked = this.ticked();
    const topic_ids: string[] = [];
    const subtopic_ids: string[] = [];
    for (const subject of this.offered()) {
      for (const topic of subject.topics) {
        const state = this.topicState(topic);
        if (state === 'all') topic_ids.push(topic.id);
        else if (state === 'some') subtopic_ids.push(...topic.subtopics.filter((s) => ticked.has(s.id)).map((s) => s.id));
      }
    }
    this.copyResult.set(null);
    this.busy.set(true);
    this.error.set(null);
    try {
      const answer = await this.api.copyCoursework(this.courseId, {
        source_course_id: this.sourceId(), topic_ids, subtopic_ids, keep_dates: this.keepDates, keep_status: this.keepStatus,
      });
      const { copied, ...plan } = answer;
      this.plan.set(plan);
      this.copyResult.set(copied);
      this.ticked.set(new Set());
      this.files.set(await this.api.courseFiles(this.courseId));
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  /** Run a change; on success keep the new plan, on failure show why. */
  private async change(work: () => Promise<CourseworkPlan>): Promise<CourseworkPlan | null> {
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      const plan = await work();
      this.plan.set(plan);
      return plan;
    } catch (error) {
      this.error.set(error as ApiError);
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  select(sub: WorkSubtopic): void {
    this.selected.set(sub.id);
    this.confirming.set(null);
    this.saved.set(false);
    this.form = { title: sub.title, note: sub.note, due: sub.due ?? '', status: sub.status, materials: sub.materials.map((m) => (m.type === 'file' ? { ...m } : { ...m })) };
    this.formTick.update((n) => n + 1);
  }

  dueSource(sub: WorkSubtopic): string {
    return sub.due_from === 'subtopic' ? 'Finish by' : `Follows the ${sub.due_from}'s date`;
  }

  async addTopic(subject: WorkSubject): Promise<void> {
    const title = (this.topicDraft[subject.paper_id] ?? '').trim();
    if (!title) return;
    if (await this.change(() => this.api.addTopic(this.courseId, subject.paper_id, title))) this.topicDraft[subject.paper_id] = '';
  }

  async addSub(topic: WorkTopic): Promise<void> {
    const title = (this.subDraft[topic.id] ?? '').trim();
    if (!title) return;
    const plan = await this.change(() => this.api.addSubtopic(this.courseId, topic.id, { title }));
    if (!plan) return;
    this.subDraft[topic.id] = '';
    const made = plan.subjects.flatMap((s) => s.topics).find((t) => t.id === topic.id)?.subtopics.at(-1);
    if (made) this.select(made);
  }

  async subjectDate(subject: WorkSubject, value: string): Promise<void> {
    await this.change(() => this.api.setSubjectDue(this.courseId, subject.paper_id, value || null));
  }

  async topicDate(topic: WorkTopic, value: string): Promise<void> {
    await this.change(() => this.api.editWork(this.courseId, topic.id, { due: value || null }));
  }

  async move(id: string, direction: 'up' | 'down'): Promise<void> {
    await this.change(() => this.api.moveWork(this.courseId, id, direction));
  }

  async remove(id: string): Promise<void> {
    this.confirming.set(null);
    const plan = await this.change(() => this.api.removeWork(this.courseId, id));
    if (plan && !this.current()) this.selected.set(null);
  }

  async save(): Promise<void> {
    const id = this.selected();
    if (!id) return;
    const body = {
      title: this.form.title, note: this.form.note, due: this.form.due || null, status: this.form.status,
      materials: this.form.materials.map((m) => (m.type === 'file' ? { type: 'file' as const, file_id: m.file_id } : { type: 'link' as const, url: m.url, title: m.title })),
    };
    const plan = await this.change(() => this.api.editWork(this.courseId, id, body));
    if (plan) {
      const sub = this.current();
      if (sub) this.select(sub);
      this.saved.set(true);
    }
  }

  attachFile(): void {
    const file = this.files().find((f) => f.id === this.pickedFile);
    this.pickedFile = '';
    if (!file) return;
    this.form.materials.push({ type: 'file', file_id: file.id, title: file.title, kind: file.kind, size: file.size });
    this.formTick.update((n) => n + 1);
  }

  attachLink(): void {
    const url = this.linkUrl.trim();
    if (!url) return;
    this.form.materials.push({ type: 'link', url, title: this.linkTitle.trim() });
    this.linkUrl = '';
    this.linkTitle = '';
  }

  removeMaterial(index: number): void {
    this.form.materials.splice(index, 1);
    this.formTick.update((n) => n + 1);
  }

  icon(item: WorkMaterial): string {
    return item.type === 'link' ? 'link' : 'file';
  }

  materialTitle(item: WorkMaterial): string {
    return item.type === 'link' ? item.title || item.url : `${item.title} (${item.kind === 'pdf' ? 'PDF' : 'Video'})`;
  }
}

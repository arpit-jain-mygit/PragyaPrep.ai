import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Choice } from '../ui/choice';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { formatDateTime } from '../core/format';
import { AdminCourse, ApiError, AutoRule, Paper, Question, TestDetail, TestInput, TestKind, TestSummary } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

interface Draft {
  title: string;
  description: string;
  /** From the date and time pickers: "2027-01-31T23:59", or '' for no limit. */
  startAt: string;
  endAt: string;
  duration: number | null;
  maxAttempts: number | null;
  passPercentage: number | null;
  marksCorrect: string;
  marksIncorrect: string;
  showAnswers: boolean;
  courses: string[];
  mode: 'manual' | 'auto';
  kind: TestKind;
  free: boolean;
  year: number | null;
  rules: AutoRule[];
  questionIds: string[];
  status: 'draft' | 'published';
}

function emptyRule(): AutoRule {
  return { paper: '', topic: '', difficulty: '', count: null };
}

function emptyDraft(): Draft {
  return {
    title: '', description: '', startAt: '', endAt: '', duration: null, maxAttempts: 1, passPercentage: null,
    marksCorrect: '1', marksIncorrect: '0', showAnswers: false, courses: [], mode: 'manual', kind: 'test', free: false, year: null, rules: [emptyRule()],
    questionIds: [], status: 'draft',
  };
}

const SHOWN_AT_MOST = 100;

/** Tests the admin builds from the question bank: when they can be taken, how they are marked, who gets them, and which questions they hold. */
@Component({
  selector: 'app-admin-tests',
  imports: [Choice, FormsModule, RouterLink, Icon, InfoTip],
  template: `
    <div class="page-head">
      <h1>
        Tests
        <app-info text="Build a test from published questions, choose when it can be taken and which courses get it. Students take tests later." />
      </h1>
      @if (!form()) {
        <button class="btn" type="button" id="new-test" (click)="startNew()"><app-icon name="plus" /> New test</button>
      }
    </div>

    @if (notice(); as text) { <div class="alert ok" role="status">{{ text }}</div> }
    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (form()) {
      <div class="form-panel" id="test-form">
        <h2>{{ editingId() ? 'Edit test' : 'New test' }}</h2>

        <div class="field">
          <label for="t-title">Title</label>
          <input id="t-title" name="title" type="text" [(ngModel)]="draft.title" (input)="clearError('title')" [attr.aria-invalid]="fieldErrors()['title'] ? 'true' : null" />
          @if (fieldErrors()['title']) { <div class="error-text">{{ fieldErrors()['title'] }}</div> }
        </div>
        <div class="field">
          <label for="t-kind">What is it for?</label>
          <select id="t-kind" name="kind" [(ngModel)]="draft.kind">
            <option value="test">A test</option>
            <option value="sectional">A sectional</option>
            <option value="mock">A full mock</option>
            <option value="past_paper">A past paper</option>
          </select>
        </div>
        @if (draft.kind === 'past_paper') {
          <div class="field">
            <label for="t-year">Year of the paper</label>
            <input id="t-year" name="year" type="number" min="1990" max="2100" [(ngModel)]="draft.year" />
          </div>
        }
        @if (draft.kind === 'mock') {
          <label class="check" for="t-free"><input id="t-free" name="free" type="checkbox" [(ngModel)]="draft.free" /> This is the free mock</label>
        }
        <div class="field">
          <label for="t-description">Instructions <app-info text="Optional. Shown to students before they start." /></label>
          <textarea id="t-description" name="description" rows="2" [(ngModel)]="draft.description" (input)="clearError('description')"></textarea>
          @if (fieldErrors()['description']) { <div class="error-text">{{ fieldErrors()['description'] }}</div> }
        </div>

        <div class="grid-2">
          <div class="field">
            <label for="t-start">Start <app-info text="Students can attempt the test after this date and time (India time). Leave empty for no limit." /></label>
            <input id="t-start" name="startAt" type="datetime-local" [(ngModel)]="draft.startAt" (input)="clearError('start_at')" [attr.aria-invalid]="fieldErrors()['start_at'] ? 'true' : null" />
            @if (fieldErrors()['start_at']) { <div class="error-text">{{ fieldErrors()['start_at'] }}</div> }
          </div>
          <div class="field">
            <label for="t-end">End <app-info text="Students can attempt the test before this date and time (India time). Leave empty for no limit." /></label>
            <input id="t-end" name="endAt" type="datetime-local" [(ngModel)]="draft.endAt" (input)="clearError('end_at')" [attr.aria-invalid]="fieldErrors()['end_at'] ? 'true' : null" />
            @if (fieldErrors()['end_at']) { <div class="error-text">{{ fieldErrors()['end_at'] }}</div> }
          </div>
        </div>

        <div class="grid-3">
          <div class="field">
            <label for="t-duration">Duration (min)</label>
            <input id="t-duration" name="duration" type="number" min="1" max="600" [(ngModel)]="draft.duration" (input)="clearError('duration_minutes')" [attr.aria-invalid]="fieldErrors()['duration_minutes'] ? 'true' : null" />
            @if (fieldErrors()['duration_minutes']) { <div class="error-text">{{ fieldErrors()['duration_minutes'] }}</div> }
          </div>
          <div class="field">
            <label for="t-attempts">Maximum attempts</label>
            <input id="t-attempts" name="maxAttempts" type="number" min="1" max="100" [(ngModel)]="draft.maxAttempts" (input)="clearError('max_attempts')" [attr.aria-invalid]="fieldErrors()['max_attempts'] ? 'true' : null" />
            @if (fieldErrors()['max_attempts']) { <div class="error-text">{{ fieldErrors()['max_attempts'] }}</div> }
          </div>
          <div class="field">
            <label for="t-pass">Pass percentage <app-info text="The least percentage of the total marks a student needs to pass." /></label>
            <input id="t-pass" name="passPercentage" type="number" min="0" max="100" [(ngModel)]="draft.passPercentage" (input)="clearError('pass_percentage')" [attr.aria-invalid]="fieldErrors()['pass_percentage'] ? 'true' : null" />
            @if (fieldErrors()['pass_percentage']) { <div class="error-text">{{ fieldErrors()['pass_percentage'] }}</div> }
          </div>
        </div>
        <div class="grid-3">
          <div class="field">
            <label for="t-correct">Marks for a correct answer</label>
            <input id="t-correct" name="marksCorrect" type="text" inputmode="decimal" [(ngModel)]="draft.marksCorrect" (input)="clearError('marks_correct')" [attr.aria-invalid]="fieldErrors()['marks_correct'] ? 'true' : null" />
            @if (fieldErrors()['marks_correct']) { <div class="error-text">{{ fieldErrors()['marks_correct'] }}</div> }
          </div>
          <div class="field">
            <label for="t-incorrect">Marks for a wrong answer <app-info text="0 or a negative number, for example -1." /></label>
            <input id="t-incorrect" name="marksIncorrect" type="text" inputmode="decimal" [(ngModel)]="draft.marksIncorrect" (input)="clearError('marks_incorrect')" [attr.aria-invalid]="fieldErrors()['marks_incorrect'] ? 'true' : null" />
            @if (fieldErrors()['marks_incorrect']) { <div class="error-text">{{ fieldErrors()['marks_incorrect'] }}</div> }
          </div>
          <div class="field">
            <label class="check" for="t-show" style="margin-top: 1.55rem">
              <input id="t-show" name="showAnswers" type="checkbox" [(ngModel)]="draft.showAnswers" />
              Show correct answers after submitting
            </label>
          </div>
        </div>

        <div class="field" id="t-courses">
          <label>Assign to <app-info text="Students of the chosen courses will see this test." /></label>
          <div class="row">
            @for (course of courses(); track course.id) {
              <label class="check" style="margin: 0 1rem 0 0">
                <input type="checkbox" [id]="'t-course-' + course.id" [checked]="draft.courses.includes(course.id)" (change)="toggleCourse(course.id, $any($event.target).checked)" />
                {{ course.name }}
              </label>
            } @empty {
              <span class="soft">No courses yet. Add one on the Courses page.</span>
            }
          </div>
          @if (fieldErrors()['courses']) { <div class="error-text">{{ fieldErrors()['courses'] }}</div> }
        </div>

        <h3>Questions</h3>
        <div class="field">
          <div class="row" role="radiogroup" aria-label="How to add questions">
            <label class="check" style="margin: 0 1.25rem 0 0">
              <input type="radio" name="mode" id="t-mode-auto" value="auto" [(ngModel)]="draft.mode" /> <app-icon name="shuffle" [size]="16" /> Automatically
            </label>
            <label class="check" style="margin: 0">
              <input type="radio" name="mode" id="t-mode-manual" value="manual" [(ngModel)]="draft.mode" /> <app-icon name="list" [size]="16" /> Manually
            </label>
            <app-info text="Automatically: the system picks random published questions for the subject, topic, level and number you give. Manually: choose questions yourself from the bank." />
          </div>
        </div>

        @if (draft.mode === 'auto') {
          <div id="auto-rules">
            @for (rule of draft.rules; track $index) {
              <div class="rule-row" [attr.data-rule]="$index">
                <div class="field">
                  <label class="sr-only" [attr.for]="'r-paper-' + $index">Subject</label>
                  <select [id]="'r-paper-' + $index" [name]="'rpaper' + $index" [(ngModel)]="rule.paper" (ngModelChange)="rule.topic = ''">
                    <option value="">Choose a subject</option>
                    @for (paper of papers(); track paper.id) { <option [value]="paper.id">{{ paper.name }}</option> }
                  </select>
                </div>
                <div class="field">
                  <label class="sr-only" [attr.for]="'r-topic-' + $index">Topic</label>
                  <select [id]="'r-topic-' + $index" [name]="'rtopic' + $index" [(ngModel)]="rule.topic" [disabled]="!rule.paper">
                    <option value="">Any topic</option>
                    @for (topic of topicsOf(rule.paper); track topic) { <option [value]="topic">{{ topic }}</option> }
                  </select>
                </div>
                <div class="field">
                  <label class="sr-only" [attr.for]="'r-level-' + $index">Level</label>
                  <select [id]="'r-level-' + $index" [name]="'rlevel' + $index" [(ngModel)]="rule.difficulty">
                    <option value="">Any level</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div class="field">
                  <label class="sr-only" [attr.for]="'r-count-' + $index">How many</label>
                  <input [id]="'r-count-' + $index" [name]="'rcount' + $index" type="number" min="1" max="200" placeholder="How many" [(ngModel)]="rule.count" />
                </div>
                <button class="icon-btn danger" type="button" title="Remove rule" [disabled]="draft.rules.length === 1" (click)="removeRule($index)"><app-icon name="x" /><span class="sr-only">Remove rule</span></button>
              </div>
            }
            @if (fieldErrors()['rules']) { <div class="error-text">{{ fieldErrors()['rules'] }}</div> }
            <div class="row" style="margin-bottom: 0.75rem">
              <button class="btn secondary small" type="button" id="add-rule" (click)="draft.rules.push(emptyRule())"><app-icon name="plus" [size]="16" /> Add rule</button>
              <button class="btn small" type="button" id="pick-now" [disabled]="picking()" (click)="pickNow()"><app-icon name="shuffle" [size]="16" /> {{ draft.questionIds.length ? 'Pick again' : 'Pick questions' }}</button>
            </div>
          </div>
        } @else {
          <div id="manual-picker">
            <div class="toolbar">
              <div class="field">
                <label class="sr-only" for="p-search">Search</label>
                <input id="p-search" name="psearch" type="text" placeholder="Search questions" [(ngModel)]="pickFilter.search" (ngModelChange)="bump()" />
              </div>
              <div class="field">
                <label class="sr-only" for="p-paper">Subject</label>
                <select id="p-paper" name="ppaper" [(ngModel)]="pickFilter.paper" (ngModelChange)="pickFilter.topic = ''; bump()">
                  <option value="">All subjects</option>
                  @for (paper of papers(); track paper.id) { <option [value]="paper.id">{{ paper.name }}</option> }
                </select>
              </div>
              <div class="field">
                <label class="sr-only" for="p-topic">Topic</label>
                <select id="p-topic" name="ptopic" [(ngModel)]="pickFilter.topic" (ngModelChange)="bump()" [disabled]="!pickFilter.paper">
                  <option value="">All topics</option>
                  @for (topic of topicsOf(pickFilter.paper); track topic) { <option [value]="topic">{{ topic }}</option> }
                </select>
              </div>
              <div class="field">
                <label class="sr-only" for="p-level">Level</label>
                <select id="p-level" name="plevel" [(ngModel)]="pickFilter.difficulty" (ngModelChange)="bump()">
                  <option value="">Any level</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            @if (bankLoading()) {
              <p class="muted">Loading questions…</p>
            } @else {
              <div class="row bulk">
                <label class="check">
                  <input type="checkbox" id="p-all" [checked]="allShownTicked()" (change)="tickAllShown($any($event.target).checked)" />
                  Select all {{ shown().length }}
                </label>
                @if (ticked().length) {
                  <button class="btn small" type="button" id="add-ticked" (click)="addTicked()"><app-icon name="plus" [size]="16" /> Add {{ ticked().length }}</button>
                }
                @if (poolSize() > shown().length) { <span class="soft">Showing {{ shown().length }} of {{ poolSize() }}. Narrow the search.</span> }
              </div>
              <div class="pick-list" id="pick-list">
                @for (item of shown(); track item.id) {
                  <label class="pick-row" [attr.data-pick]="item.id">
                    <input type="checkbox" [checked]="ticked().includes(item.id)" (change)="tick(item.id, $any($event.target).checked)" />
                    <span class="pick-text">{{ item.text }}</span>
                    <span class="soft">{{ paperName(item.paper) }} · {{ item.topic }} · {{ item.difficulty }}</span>
                  </label>
                } @empty {
                  <div class="empty-state"><app-icon name="help" [size]="28" /><p>No published questions match</p></div>
                }
              </div>
            }
          </div>
        }
        @if (fieldErrors()['question_ids']) { <div class="error-text">{{ fieldErrors()['question_ids'] }}</div> }
        @if (pickMessage(); as message) { <p class="soft" id="pick-message" role="status">{{ message }}</p> }

        <div class="selected-box" id="selected-box">
          <div class="row">
            <strong>{{ draft.questionIds.length }} {{ draft.questionIds.length === 1 ? 'question' : 'questions' }}</strong>
            <span class="soft" id="total-marks">· {{ totalMarks() }} marks</span>
            @for (entry of bySubject(); track entry[0]) { <span class="chip">{{ entry[0] }} {{ entry[1] }}</span> }
          </div>
          @for (id of draft.questionIds; track id) {
            <div class="selected-row" [attr.data-selected]="id">
              <span class="pick-text">{{ questionText(id) }}</span>
              <button class="icon-btn danger" type="button" title="Remove question" (click)="removeQuestion(id)"><app-icon name="x" /><span class="sr-only">Remove question</span></button>
            </div>
          }
        </div>

        <div class="grid-3" style="margin-top: 0.75rem">
          <div class="field">
            <label for="t-status">Status <app-info text="Only published tests are offered to students. A test needs questions and at least one course to be published." /></label>
            <app-choice name="status" id="t-status" label="Status" [options]="[{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }]" [(ngModel)]="draft.status" />
            @if (fieldErrors()['status']) { <div class="error-text">{{ fieldErrors()['status'] }}</div> }
          </div>
        </div>

        <div class="form-actions">
          <button class="btn" type="button" id="save-test" [disabled]="saving()" (click)="save()"><app-icon name="check" /> {{ saving() ? 'Saving…' : 'Save test' }}</button>
          <button class="icon-btn" type="button" title="Cancel" (click)="cancel()"><app-icon name="x" /><span class="sr-only">Cancel</span></button>
        </div>
      </div>
    }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (!tests().length) {
      <div class="empty-state"><app-icon name="clipboard" [size]="32" /><p>No tests yet</p></div>
    } @else {
      <div class="toolbar" id="test-filters">
        <div class="field" style="flex: 2 1 14rem">
          <label class="sr-only" for="tf-search">Search tests</label>
          <input id="tf-search" name="tfsearch" type="search" placeholder="Search tests by name" [ngModel]="testFilter().search" (ngModelChange)="setFilter('search', $event)" />
        </div>
        <div class="field">
          <label class="sr-only" for="tf-course">Course</label>
          <select id="tf-course" name="tfcourse" [ngModel]="testFilter().course" (ngModelChange)="setFilter('course', $event)">
            <option value="">All courses</option>
            @for (course of courses(); track course.id) { <option [value]="course.id">{{ course.name }}</option> }
          </select>
        </div>
        <div class="field">
          <label class="sr-only" for="tf-status">Status</label>
          <app-choice name="tfstatus" id="tf-status" label="Status" [options]="[{ value: '', label: 'All statuses' }, { value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }]" [ngModel]="testFilter().status" (ngModelChange)="setFilter('status', $event)" />
        </div>
        @if (filtering()) {
          <button class="icon-btn" type="button" id="tf-clear" title="Clear filters" (click)="clearFilters()"><app-icon name="x" /><span class="sr-only">Clear filters</span></button>
        }
      </div>
      <p class="soft" id="test-count">{{ shownTests().length === tests().length ? tests().length + (tests().length === 1 ? ' test' : ' tests') : shownTests().length + ' of ' + tests().length + ' tests' }}</p>
      @if (!shownTests().length) {
        <div class="empty-state"><app-icon name="search" [size]="28" /><p>No tests match</p></div>
      }
      <div class="table-wrap" [hidden]="!shownTests().length">
        <table class="compact" id="test-table">
          <thead><tr><th>Test</th><th class="hide-sm">Courses</th><th class="hide-sm">Window</th><th>Questions</th><th class="hide-sm">Time</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (item of shownTests(); track item.id) {
              <tr [attr.data-test]="item.title">
                <td><strong>{{ item.title }}</strong><div class="soft">{{ item.total_marks }} marks · pass {{ item.pass_percentage }}% · {{ item.max_attempts }} {{ item.max_attempts === 1 ? 'attempt' : 'attempts' }}</div></td>
                <td class="soft hide-sm">{{ courseNames(item) }}</td>
                <td class="soft hide-sm">{{ windowOf(item) }}</td>
                <td>{{ item.question_count }}</td>
                <td class="soft hide-sm">{{ item.duration_minutes }} min</td>
                <td><span class="status" [class.ok]="item.status === 'published'">{{ item.status }}</span></td>
                <td class="actions-cell">
                  <div class="icon-actions">
                    <a class="icon-btn with-count" title="Results" [routerLink]="['/', tenants.slug(), 'admin', 'tests', item.id, 'results']">
                      <app-icon name="chart" /><span class="sr-only">Results</span>
                      @if (item.attempt_count) { <span class="count-badge" [attr.aria-label]="item.attempt_count + ' attempts'">{{ item.attempt_count }}</span> }
                    </a>
                    <button class="icon-btn" type="button" title="Edit" (click)="startEdit(item)"><app-icon name="edit" /><span class="sr-only">Edit</span></button>
                    <button class="icon-btn" type="button" [attr.title]="item.status === 'published' ? 'Move to draft' : 'Publish'" [disabled]="saving()" (click)="toggleStatus(item)">
                      <app-icon [name]="item.status === 'published' ? 'eye-off' : 'eye'" /><span class="sr-only">{{ item.status === 'published' ? 'Move to draft' : 'Publish' }}</span>
                    </button>
                    @if (confirming() === item.id) {
                      <button class="btn danger small" type="button" [disabled]="saving()" (click)="remove(item)">Yes, delete</button>
                      <button class="icon-btn" type="button" title="Keep" (click)="confirming.set(null)"><app-icon name="x" /><span class="sr-only">Keep</span></button>
                    } @else {
                      <button class="icon-btn danger" type="button" title="Delete" (click)="confirming.set(item.id)"><app-icon name="trash" /><span class="sr-only">Delete</span></button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminTests implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);
  readonly emptyRule = emptyRule;

  readonly tests = signal<TestSummary[]>([]);
  /** The search words and the course and status chosen above the list. */
  readonly testFilter = signal({ search: '', course: '', status: '' });
  readonly filtering = computed(() => {
    const f = this.testFilter();
    return !!(f.search.trim() || f.course || f.status);
  });
  /** The tests that match the search and filters, in the same order as the full list. */
  readonly shownTests = computed(() => {
    const f = this.testFilter();
    const words = f.search.toLowerCase().split(/\s+/).filter(Boolean);
    return this.tests().filter(
      (item) =>
        words.every((word) => item.title.toLowerCase().includes(word)) &&
        (!f.course || item.courses.includes(f.course)) &&
        (!f.status || item.status === f.status),
    );
  });
  readonly courses = signal<AdminCourse[]>([]);
  readonly papers = signal<Paper[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly picking = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly notice = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly pickMessage = signal<string | null>(null);
  readonly form = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly confirming = signal<string | null>(null);

  /** Published questions, loaded when the form opens. */
  readonly bank = signal<Question[]>([]);
  readonly bankLoading = signal(false);
  /** Every question we know about for the selected list, including ones that came with the test being edited. */
  private readonly extra = signal<Record<string, Question>>({});
  readonly ticked = signal<string[]>([]);

  draft: Draft = emptyDraft();
  pickFilter = { search: '', paper: '', topic: '', difficulty: '' };

  private readonly known = computed(() => {
    const map: Record<string, Question> = { ...this.extra() };
    for (const item of this.bank()) map[item.id] = item;
    return map;
  });

  /** Published questions that match the filters and aren't in the test yet. */
  /** Bumped whenever the picker's filters or the chosen questions change, so the lists below are worked out again. */
  readonly version = signal(0);
  bump(): void {
    this.version.update((n) => n + 1);
  }

  private readonly pool = computed(() => {
    this.version();
    const f = this.pickFilter;
    const text = f.search.trim().toLowerCase();
    const chosen = new Set(this.draft.questionIds);
    return this.bank().filter(
      (item) =>
        !chosen.has(item.id) &&
        (!f.paper || item.paper === f.paper) &&
        (!f.topic || item.topic === f.topic) &&
        (!f.difficulty || item.difficulty === f.difficulty) &&
        (!text || item.text.toLowerCase().includes(text)),
    );
  });
  readonly poolSize = computed(() => this.pool().length);
  readonly shown = computed(() => this.pool().slice(0, SHOWN_AT_MOST));
  readonly allShownTicked = computed(() => this.shown().length > 0 && this.shown().every((item) => this.ticked().includes(item.id)));

  ngOnInit(): void {
    void this.start();
  }

  private async start(): Promise<void> {
    this.loading.set(true);
    try {
      this.papers.set(await this.api.papers());
      this.courses.set(await this.api.adminCourses());
      this.tests.set(await this.api.tests());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  setFilter(field: 'search' | 'course' | 'status', value: string): void {
    this.testFilter.update((f) => ({ ...f, [field]: value ?? '' }));
  }

  clearFilters(): void {
    this.testFilter.set({ search: '', course: '', status: '' });
  }

  topicsOf(paperId: string): string[] {
    return this.papers().find((paper) => paper.id === paperId)?.topics ?? [];
  }

  paperName(paperId: string): string {
    return this.papers().find((paper) => paper.id === paperId)?.name ?? paperId;
  }

  courseNames(item: TestSummary): string {
    return item.courses.map((id) => this.courses().find((course) => course.id === id)?.name ?? '?').join(', ') || '—';
  }

  windowOf(item: TestSummary): string {
    if (!item.start_at && !item.end_at) return 'Any time';
    const from = item.start_at ? formatDateTime(item.start_at) : 'now';
    return item.end_at ? `${from} → ${formatDateTime(item.end_at)}` : `From ${from}`;
  }

  questionText(id: string): string {
    const found = this.known()[id];
    return found ? found.text : 'A question that is no longer available';
  }

  /** The most marks a student can get with the questions chosen so far. */
  totalMarks(): string {
    const marks = Number(this.draft.marksCorrect);
    if (!isFinite(marks)) return '0';
    return String(Math.round(marks * this.draft.questionIds.length * 100) / 100);
  }

  /** How many chosen questions each subject has, as [subject, count]. */
  bySubject(): [string, number][] {
    const counts = new Map<string, number>();
    for (const id of this.draft.questionIds) {
      const found = this.known()[id];
      const name = found ? this.paperName(found.paper) : 'Other';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts];
  }

  clearError(field: string): void {
    if (!this.fieldErrors()[field]) return;
    const { [field]: _gone, ...rest } = this.fieldErrors();
    this.fieldErrors.set(rest);
  }

  toggleCourse(id: string, on: boolean): void {
    this.draft.courses = on ? [...this.draft.courses.filter((item) => item !== id), id] : this.draft.courses.filter((item) => item !== id);
    this.clearError('courses');
  }

  private resetMessages(): void {
    this.notice.set(null);
    this.error.set(null);
    this.fieldErrors.set({});
  }

  async startNew(): Promise<void> {
    this.resetMessages();
    this.draft = emptyDraft();
    this.bump();
    this.editingId.set(null);
    this.ticked.set([]);
    this.pickMessage.set(null);
    this.pickFilter = { search: '', paper: '', topic: '', difficulty: '' };
    this.bump();
    this.form.set(true);
    await this.loadBank();
  }

  async startEdit(item: TestSummary): Promise<void> {
    this.resetMessages();
    try {
      const detail = await this.api.test(item.id);
      const extra: Record<string, Question> = {};
      for (const question of detail.questions) extra[question.id] = question;
      this.extra.set(extra);
      this.draft = this.draftFrom(detail);
      this.bump();
    } catch (error) {
      this.error.set(error as ApiError);
      return;
    }
    this.editingId.set(item.id);
    this.ticked.set([]);
    this.pickMessage.set(null);
    this.pickFilter = { search: '', paper: '', topic: '', difficulty: '' };
    this.form.set(true);
    await this.loadBank();
  }

  private draftFrom(detail: TestDetail): Draft {
    return {
      title: detail.title,
      description: detail.description ?? '',
      startAt: detail.start_at ?? '',
      endAt: detail.end_at ?? '',
      duration: detail.duration_minutes,
      maxAttempts: detail.max_attempts,
      passPercentage: detail.pass_percentage,
      marksCorrect: detail.marks_correct,
      marksIncorrect: detail.marks_incorrect,
      showAnswers: detail.show_answers,
      courses: [...detail.courses],
      mode: detail.mode,
      kind: detail.kind ?? 'test',
      free: detail.free ?? false,
      year: detail.year ?? null,
      rules: detail.rules.length ? detail.rules.map((rule) => ({ ...rule, difficulty: rule.difficulty as AutoRule['difficulty'] })) : [emptyRule()],
      questionIds: [...detail.question_ids],
      status: detail.status,
    };
  }

  private async loadBank(): Promise<void> {
    if (this.bank().length) return;
    this.bankLoading.set(true);
    try {
      this.bank.set(await this.api.questions({ status: 'published' }));
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.bankLoading.set(false);
    }
  }

  cancel(): void {
    this.form.set(false);
    this.editingId.set(null);
    this.resetMessages();
  }

  // ---- Choosing questions by hand ----

  tick(id: string, on: boolean): void {
    this.ticked.update((list) => (on ? [...list, id] : list.filter((item) => item !== id)));
  }

  tickAllShown(on: boolean): void {
    this.ticked.set(on ? this.shown().map((item) => item.id) : []);
  }

  /** The ids, with the rest of each question's passage kept next to it, like the server does. */
  private expand(ids: string[]): string[] {
    const bank = this.bank();
    const byPassage = new Map<string, string[]>();
    for (const item of [...bank].sort((a, b) => (a.created_at + a.id).localeCompare(b.created_at + b.id))) {
      if (item.passage) byPassage.set(item.passage, [...(byPassage.get(item.passage) ?? []), item.id]);
    }
    const out: string[] = [];
    const add = (id: string) => { if (!out.includes(id)) out.push(id); };
    for (const id of ids) {
      add(id);
      const passage = this.known()[id]?.passage;
      for (const sibling of passage ? byPassage.get(passage) ?? [] : []) add(sibling);
    }
    return out;
  }

  addTicked(): void {
    const before = this.draft.questionIds.length;
    const wanted = this.ticked().length;
    this.draft.questionIds = this.expand([...this.draft.questionIds, ...this.ticked()]);
    const added = this.draft.questionIds.length - before;
    this.ticked.set([]);
    this.bump();
    this.clearError('question_ids');
    this.pickMessage.set(added > wanted ? `Added ${added} (${added - wanted} more from the same passage).` : null);
  }

  removeQuestion(id: string): void {
    this.draft.questionIds = this.draft.questionIds.filter((item) => item !== id);
    this.bump();
  }

  // ---- Choosing questions at random ----

  removeRule(index: number): void {
    this.draft.rules.splice(index, 1);
  }

  async pickNow(): Promise<void> {
    if (this.picking()) return;
    this.picking.set(true);
    this.clearError('rules');
    this.pickMessage.set(null);
    try {
      const rules = this.draft.rules.map((rule) => ({ paper: rule.paper, topic: rule.topic, difficulty: rule.difficulty, count: Number(rule.count) }));
      const result = await this.api.autoPick(rules, []);
      this.draft.questionIds = result.question_ids;
      this.bump();
      this.clearError('question_ids');
      const parts = [`Picked ${result.question_ids.length} ${result.question_ids.length === 1 ? 'question' : 'questions'}.`];
      if (result.added_for_passages) parts.push(`${result.added_for_passages} came with their passage.`);
      for (const gap of result.short) parts.push(`Rule ${gap.rule}: wanted ${gap.wanted}, found ${gap.found}.`);
      this.pickMessage.set(parts.join(' '));
    } catch (error) {
      this.fieldErrors.set({ ...this.fieldErrors(), rules: (error as ApiError).detail });
    } finally {
      this.picking.set(false);
    }
  }

  // ---- Saving ----

  private body(): TestInput {
    const d = this.draft;
    return {
      title: d.title,
      description: d.description,
      start_at: d.startAt,
      end_at: d.endAt,
      duration_minutes: d.duration as number,
      max_attempts: d.maxAttempts as number,
      pass_percentage: d.passPercentage as number,
      marks_correct: d.marksCorrect,
      marks_incorrect: d.marksIncorrect,
      show_answers: d.showAnswers,
      courses: d.courses,
      mode: d.mode,
      kind: d.kind,
      free: d.kind === 'mock' && d.free,
      year: d.kind === 'past_paper' ? d.year : null,
      rules: d.mode === 'auto' ? d.rules.map((rule) => ({ paper: rule.paper, topic: rule.topic, difficulty: rule.difficulty, count: Number(rule.count) })) : [],
      question_ids: d.questionIds,
      status: d.status,
    };
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.resetMessages();
    const editing = this.editingId();
    try {
      if (editing) await this.api.updateTest(editing, this.body());
      else await this.api.addTest(this.body());
      this.notice.set(editing ? 'Saved the test.' : 'Created the test.');
      this.form.set(false);
      this.editingId.set(null);
      this.tests.set(await this.api.tests());
    } catch (error) {
      const problem = error as ApiError;
      if (problem.errors) this.fieldErrors.set(problem.errors);
      else this.error.set(problem);
    } finally {
      this.saving.set(false);
    }
  }

  async toggleStatus(item: TestSummary): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.resetMessages();
    const next = item.status === 'published' ? 'draft' : 'published';
    try {
      await this.api.updateTest(item.id, { status: next });
      this.notice.set(next === 'published' ? `Published ${item.title}.` : `${item.title} is back to draft.`);
      this.tests.set(await this.api.tests());
    } catch (error) {
      const problem = error as ApiError;
      this.error.set({ status: problem.status, detail: problem.errors ? Object.values(problem.errors).join(' ') : problem.detail });
    } finally {
      this.saving.set(false);
    }
  }

  async remove(item: TestSummary): Promise<void> {
    this.saving.set(true);
    this.resetMessages();
    try {
      await this.api.deleteTest(item.id);
      this.notice.set(`Deleted ${item.title}.`);
      this.tests.set(await this.api.tests());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.confirming.set(null);
      this.saving.set(false);
    }
  }
}

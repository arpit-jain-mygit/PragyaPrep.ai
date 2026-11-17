import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ApiError, PICTURE_SLOTS, Paper, Picture, Question } from '../core/models';
import { PicturePicker } from './picture-picker';
import { QuestionUpload } from './question-upload';

interface Draft {
  kind: 'mcq' | 'fill_in';
  /** Fill in: what the student types. Text: accepted answers separated by | . Number: the number and a tolerance. */
  answerType: 'text' | 'number';
  answerText: string;
  answerNumber: string;
  tolerance: string;
  explanation: string;
  paper: string;
  topic: string;
  text: string;
  options: { text: string; why: string }[];
  correct: number | null;
  difficulty: 'easy' | 'medium' | 'hard';
  status: 'draft' | 'published';
  /** The picture in each position (question, A to D), or null. */
  pictures: Record<string, Picture | null>;
}

const LETTERS = ['A', 'B', 'C', 'D'];

function emptyDraft(): Draft {
  return {
    kind: 'mcq',
    answerType: 'text',
    answerText: '',
    answerNumber: '',
    tolerance: '',
    explanation: '',
    paper: '',
    topic: '',
    text: '',
    options: LETTERS.map(() => ({ text: '', why: '' })),
    correct: null,
    difficulty: 'medium',
    status: 'draft',
    pictures: { question: null, A: null, B: null, C: null, D: null },
  };
}

function draftFrom(question: Question): Draft {
  const answer = question.answer;
  return {
    kind: question.kind ?? 'mcq',
    answerType: answer?.type ?? 'text',
    answerText: answer?.type === 'text' ? answer.accepted.join(' | ') : '',
    answerNumber: answer?.type === 'number' ? answer.value : '',
    tolerance: answer?.type === 'number' && answer.tolerance !== '0' ? answer.tolerance : '',
    explanation: question.explanation ?? '',
    paper: question.paper,
    topic: question.topic,
    text: question.text,
    options: question.kind === 'fill_in' ? LETTERS.map(() => ({ text: '', why: '' })) : question.options.map((option) => ({ ...option })),
    correct: question.correct,
    difficulty: question.difficulty,
    status: question.status,
    pictures: Object.fromEntries(PICTURE_SLOTS.map((slot) => [slot, question.images?.[slot] ?? null])),
  };
}

/** The institute's question bank: choose a paper and topic, write the question, its four options and why each is right or wrong. */
@Component({
  selector: 'app-admin-questions',
  imports: [FormsModule, PicturePicker, QuestionUpload],
  template: `
    <h1>Question bank</h1>
    <p class="muted">Pick a paper and topic, write the question and its four options, mark the correct one, and explain why each option is right or wrong. Only published questions will be used in tests later.</p>

    @if (notice(); as text) { <div class="alert ok" role="status">{{ text }}</div> }
    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (!form()) {
      <div class="row" style="margin-bottom: 1rem">
        <button class="btn" type="button" (click)="startAdd()">Add a question</button>
      </div>
    } @else {
      <div class="card" id="question-form">
        <h2>{{ editingId() ? 'Edit question' : 'Add a question' }}</h2>
        @if (!editingId() && draft.paper && draft.topic) {
          <p class="hint" id="working-on">
            Adding to {{ paperName(draft.paper) }} · {{ draft.topic }}. After you save, the paper and topic stay selected for your next question.
            @if (addedCount()) { <strong>{{ addedCount() }} added so far.</strong> }
          </p>
        }
        <div class="field">
          <label for="q-kind">Type of question</label>
          <select id="q-kind" name="kind" [(ngModel)]="draft.kind" (ngModelChange)="kindChanged()">
            <option value="mcq">Multiple choice (four options)</option>
            <option value="fill_in">Fill in the answer (the student types it)</option>
          </select>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="q-paper">Paper</label>
            <select id="q-paper" name="paper" [(ngModel)]="draft.paper" (ngModelChange)="paperChanged(); clearError('paper')" [attr.aria-invalid]="fieldErrors()['paper'] ? 'true' : null">
              <option value="">Choose a paper</option>
              @for (group of groups(); track group.section) {
                <optgroup [label]="group.section">
                  @for (paper of group.papers; track paper.id) { <option [value]="paper.id">{{ paper.name }}</option> }
                </optgroup>
              }
            </select>
            @if (fieldErrors()['paper']) { <div class="error-text">{{ fieldErrors()['paper'] }}</div> }
          </div>
          <div class="field">
            <label for="q-topic">Topic</label>
            <select id="q-topic" name="topic" [(ngModel)]="draft.topic" (ngModelChange)="clearError('topic')" [disabled]="!draft.paper" [attr.aria-invalid]="fieldErrors()['topic'] ? 'true' : null">
              <option value="">Choose a topic</option>
              @for (topic of topicsOf(draft.paper); track topic) { <option [value]="topic">{{ topic }}</option> }
            </select>
            @if (fieldErrors()['topic']) { <div class="error-text">{{ fieldErrors()['topic'] }}</div> }
          </div>
        </div>

        <div class="field">
          <label for="q-text">Question</label>
          <textarea id="q-text" name="text" rows="3" [(ngModel)]="draft.text" (input)="clearError('text')" [attr.aria-invalid]="fieldErrors()['text'] ? 'true' : null"></textarea>
          @if (fieldErrors()['text']) { <div class="error-text">{{ fieldErrors()['text'] }}</div> }
        </div>
        <app-picture-picker inputId="pic-question" label="Picture for the question (optional, PNG or JPG, up to 1 MB)" [picture]="draft.pictures['question']" (changed)="setPicture('question', $event)" />

        @if (draft.kind === 'mcq') {
          <h3>Options</h3>
          <p class="hint">Mark the correct option, and for every option say why it is correct or why it is wrong.</p>
          @for (option of draft.options; track $index) {
            <fieldset class="option">
              <legend>Option {{ letters[$index] }}</legend>
              <div class="field">
                <label [attr.for]="'q-opt-' + $index">Option {{ letters[$index] }} text</label>
                <input [id]="'q-opt-' + $index" [name]="'opt' + $index" type="text" [(ngModel)]="option.text" (input)="clearError('options')" />
                <div class="hint">Leave the text empty if the option is only a picture.</div>
              </div>
              <app-picture-picker [inputId]="'pic-' + letters[$index]" [label]="'Picture for option ' + letters[$index] + ' (optional)'" [picture]="draft.pictures[letters[$index]]" (changed)="setPicture(letters[$index], $event)" />
              <div class="field">
                <label [attr.for]="'q-why-' + $index">Why option {{ letters[$index] }} is correct or wrong</label>
                <textarea [id]="'q-why-' + $index" [name]="'why' + $index" rows="2" [(ngModel)]="option.why" (input)="clearError('options')"></textarea>
              </div>
              <label class="inline">
                <input type="radio" name="correct" [id]="'q-correct-' + $index" [value]="$index" [(ngModel)]="draft.correct" (ngModelChange)="clearError('correct')" />
                This is the correct answer
              </label>
            </fieldset>
          }
          @if (fieldErrors()['options']) { <div class="error-text">{{ fieldErrors()['options'] }}</div> }
          @if (fieldErrors()['images']) { <div class="error-text">{{ fieldErrors()['images'] }}</div> }
          @if (fieldErrors()['correct']) { <div class="error-text">{{ fieldErrors()['correct'] }}</div> }

        } @else {
          <h3>Answer</h3>
          <p class="hint">The student sees one box under the question and types the answer.</p>
          <div class="grid-2">
            <div class="field">
              <label for="q-answer-type">The answer is</label>
              <select id="q-answer-type" name="answerType" [(ngModel)]="draft.answerType" (ngModelChange)="clearError('answer')">
                <option value="text">Text</option>
                <option value="number">A number</option>
              </select>
            </div>
            @if (draft.answerType === 'text') {
              <div class="field">
                <label for="q-answer-text">Correct answer</label>
                <input id="q-answer-text" name="answerText" type="text" [(ngModel)]="draft.answerText" (input)="clearError('answer')" [attr.aria-invalid]="fieldErrors()['answer'] ? 'true' : null" />
                <div class="hint">For other accepted answers, separate them with |, for example Mumbai | Bombay. Capitals and extra spaces don't matter.</div>
              </div>
            } @else {
              <div class="field">
                <label for="q-answer-number">Correct number</label>
                <input id="q-answer-number" name="answerNumber" type="text" inputmode="decimal" [(ngModel)]="draft.answerNumber" (input)="clearError('answer')" [attr.aria-invalid]="fieldErrors()['answer'] ? 'true' : null" />
              </div>
            }
          </div>
          @if (draft.answerType === 'number') {
            <div class="field">
              <label for="q-tolerance">Tolerance (optional)</label>
              <input id="q-tolerance" name="tolerance" type="text" inputmode="decimal" [(ngModel)]="draft.tolerance" (input)="clearError('answer')" />
              <div class="hint">How far off a student's number may be and still count, for example 0.01. Empty means exact.</div>
            </div>
          }
          @if (fieldErrors()['answer']) { <div class="error-text">{{ fieldErrors()['answer'] }}</div> }
          <div class="field">
            <label for="q-explanation">Explanation</label>
            <textarea id="q-explanation" name="explanation" rows="3" [(ngModel)]="draft.explanation" (input)="clearError('explanation')" [attr.aria-invalid]="fieldErrors()['explanation'] ? 'true' : null"></textarea>
            <div class="hint">Why this is the right answer.</div>
            @if (fieldErrors()['explanation']) { <div class="error-text">{{ fieldErrors()['explanation'] }}</div> }
          </div>
        }

        <div class="grid-2" style="margin-top: 0.75rem">
          <div class="field">
            <label for="q-difficulty">Difficulty</label>
            <select id="q-difficulty" name="difficulty" [(ngModel)]="draft.difficulty">
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div class="field">
            <label for="q-status">Status</label>
            <select id="q-status" name="status" [(ngModel)]="draft.status">
              <option value="draft">Draft (not ready)</option>
              <option value="published">Published (ready to use)</option>
            </select>
          </div>
        </div>

        <div class="actions">
          @if (editingId()) {
            <button class="btn" type="button" [disabled]="saving()" (click)="save(false)">Save changes</button>
          } @else {
            <button class="btn" type="button" [disabled]="saving()" (click)="save(true)">Save and add another</button>
            <button class="btn secondary" type="button" [disabled]="saving()" (click)="save(false)">Save and close</button>
          }
          <button class="btn secondary" type="button" (click)="cancel()">{{ addedCount() ? 'Done' : 'Cancel' }}</button>
        </div>
      </div>
    }

    <app-question-upload (imported)="uploaded($event)" />

    <div class="card">
      <h2>Questions</h2>
      <div class="grid-2">
        <div class="field">
          <label for="f-paper">Paper</label>
          <select id="f-paper" name="fpaper" [(ngModel)]="filter.paper" (ngModelChange)="filter.topic = ''; load()">
            <option value="">All papers</option>
            @for (paper of papers(); track paper.id) { <option [value]="paper.id">{{ paper.name }}</option> }
          </select>
        </div>
        <div class="field">
          <label for="f-topic">Topic</label>
          <select id="f-topic" name="ftopic" [(ngModel)]="filter.topic" (ngModelChange)="load()" [disabled]="!filter.paper">
            <option value="">All topics</option>
            @for (topic of topicsOf(filter.paper); track topic) { <option [value]="topic">{{ topic }}</option> }
          </select>
        </div>
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="f-status">Status</label>
          <select id="f-status" name="fstatus" [(ngModel)]="filter.status" (ngModelChange)="load()">
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div class="field">
          <label for="f-kind">Type</label>
          <select id="f-kind" name="fkind" [(ngModel)]="filter.kind" (ngModelChange)="load()">
            <option value="">All types</option>
            <option value="mcq">Multiple choice</option>
            <option value="fill_in">Fill in</option>
          </select>
        </div>
        <div class="field">
          <label for="f-pictures">Pictures</label>
          <select id="f-pictures" name="fpictures" [(ngModel)]="filter.pictures" (ngModelChange)="load()">
            <option value="">All questions</option>
            <option value="yes">With pictures</option>
            <option value="no">Without pictures</option>
          </select>
        </div>
      </div>

      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else {
        @for (question of questions(); track question.id) {
          <div class="question" [attr.data-question]="question.id">
            <div class="row">
              <span class="chip" [class]="'chip ' + (question.status === 'published' ? 'open' : 'hidden')">{{ question.status }}</span>
              <span class="muted">{{ paperName(question.paper) }} · {{ question.topic }} · {{ question.difficulty }}</span>
              @if (question.kind === 'fill_in') { <span class="chip pictures">fill in</span> }
              @if (hasPictures(question)) { <span class="chip pictures">pictures</span> }
            </div>
            <p><strong>{{ question.text }}</strong></p>
            @if (question.images?.['question']; as picture) {
              <img class="qimg" [src]="picture.url" alt="Picture for the question" />
            }
            @if (question.kind === 'fill_in') {
              <p class="answer">
                <strong>Answer:</strong> {{ answerShown(question) }}
                @if (question.answer?.type === 'number' && question.answer?.tolerance !== '0') { <span class="muted">(within {{ toleranceOf(question) }})</span> }
              </p>
              <div class="hint">{{ question.explanation }}</div>
            } @else {
            <ol class="options" type="A">
              @for (option of question.options; track $index) {
                <li [class.correct]="$index === question.correct">
                  {{ option.text }}
                  @if (question.images?.[letters[$index]]; as picture) {
                    <div><img class="qimg" [src]="picture.url" [alt]="'Picture for option ' + letters[$index]" /></div>
                  }
                  @if ($index === question.correct) { <span class="chip open">correct</span> }
                  <div class="hint">{{ option.why }}</div>
                </li>
              }
            </ol>
            }
            <div class="row">
              <button class="btn secondary small" type="button" (click)="startEdit(question)">Edit</button>
              @if (confirming() === question.id) {
                <button class="btn danger small" type="button" [disabled]="saving()" (click)="remove(question)">Yes, delete</button>
                <button class="btn secondary small" type="button" (click)="confirming.set(null)">Keep</button>
              } @else {
                <button class="btn secondary small" type="button" (click)="confirming.set(question.id)">Delete</button>
              }
            </div>
          </div>
        } @empty {
          <p class="empty">No questions yet. Add the first one above.</p>
        }
      }
    </div>
  `,
})
export class AdminQuestions implements OnInit {
  private readonly api = inject(ApiService);
  readonly letters = LETTERS;

  readonly papers = signal<Paper[]>([]);
  readonly questions = signal<Question[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly notice = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly form = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly confirming = signal<string | null>(null);
  /** How many questions were added in a row, without closing the form. */
  readonly addedCount = signal(0);

  draft: Draft = emptyDraft();
  /** The pictures the question already had when it was opened for editing, by position. */
  private original: Record<string, string> = {};
  filter = { paper: '', topic: '', status: '', pictures: '', kind: '' };

  /** Papers grouped by section, for the dropdown. */
  readonly groups = computed(() => {
    const sections = new Map<string, Paper[]>();
    for (const paper of this.papers()) sections.set(paper.section, [...(sections.get(paper.section) ?? []), paper]);
    return [...sections].map(([section, papers]) => ({ section, papers }));
  });

  ngOnInit(): void {
    void this.start();
  }

  private async start(): Promise<void> {
    this.loading.set(true);
    try {
      this.papers.set(await this.api.papers());
      this.questions.set(await this.api.questions());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  topicsOf(paperId: string): string[] {
    return this.papers().find((paper) => paper.id === paperId)?.topics ?? [];
  }

  /** The type was switched: option pictures can't stay on a fill-in question. */
  kindChanged(): void {
    this.fieldErrors.set({});
    if (this.draft.kind === 'fill_in') {
      for (const letter of LETTERS) {
        const picture = this.draft.pictures[letter];
        if (picture) this.setPicture(letter, null);
      }
    }
  }

  answerShown(question: Question): string {
    const answer = question.answer;
    if (!answer) return '';
    return answer.type === 'text' ? answer.accepted.join(' or ') : answer.value;
  }

  toleranceOf(question: Question): string {
    return question.answer?.type === 'number' ? question.answer.tolerance : '';
  }

  hasPictures(question: Question): boolean {
    return Object.keys(question.images ?? {}).length > 0;
  }

  paperName(paperId: string): string {
    return this.papers().find((paper) => paper.id === paperId)?.name ?? paperId;
  }

  async load(): Promise<void> {
    try {
      this.questions.set(await this.api.questions(this.filter));
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  /** Questions were imported from a file: say how many and show the fresh list. */
  async uploaded(count: number): Promise<void> {
    this.reset();
    this.notice.set(`Imported ${count} ${count === 1 ? 'question' : 'questions'}.`);
    this.filter = { paper: '', topic: '', status: '', pictures: '', kind: '' };
    await this.load();
  }

  paperChanged(): void {
    if (!this.topicsOf(this.draft.paper).includes(this.draft.topic)) this.draft.topic = '';
  }

  /** A picture was chosen, replaced or taken off. A new picture that is replaced or taken off is thrown away at once. */
  setPicture(slot: string, picture: Picture | null): void {
    const before = this.draft.pictures[slot];
    if (before && before.id !== this.original[slot] && before.id !== picture?.id) void this.api.discardQuestionPicture(before.id).catch(() => undefined);
    this.draft.pictures = { ...this.draft.pictures, [slot]: picture };
    this.clearError('images');
  }

  /** Pictures uploaded in a form that was never saved are removed from storage, so nothing is left behind. */
  private dropUnsavedPictures(): void {
    if (!this.form()) return;
    for (const [slot, picture] of Object.entries(this.draft.pictures)) {
      if (picture && picture.id !== this.original[slot]) void this.api.discardQuestionPicture(picture.id).catch(() => undefined);
    }
  }

  /** Only what changed: a new picture's id, or null where a picture was taken off. */
  private pictureChanges(): Record<string, string | null> {
    const changes: Record<string, string | null> = {};
    for (const slot of PICTURE_SLOTS) {
      const now = this.draft.pictures[slot]?.id ?? null;
      const before = this.original[slot] ?? null;
      if (now !== before) changes[slot] = now;
    }
    return changes;
  }

  clearError(field: string): void {
    if (!this.fieldErrors()[field]) return;
    const { [field]: _gone, ...rest } = this.fieldErrors();
    this.fieldErrors.set(rest);
  }

  startAdd(): void {
    this.dropUnsavedPictures();
    this.reset();
    this.draft = emptyDraft();
    this.original = {};
    this.addedCount.set(0);
    this.editingId.set(null);
    this.form.set(true);
  }

  startEdit(question: Question): void {
    this.dropUnsavedPictures();
    this.reset();
    this.draft = draftFrom(question);
    this.original = Object.fromEntries(Object.entries(question.images ?? {}).map(([slot, picture]) => [slot, picture.id]));
    this.editingId.set(question.id);
    this.form.set(true);
  }

  cancel(): void {
    this.dropUnsavedPictures();
    this.reset();
    this.form.set(false);
  }

  private reset(): void {
    this.error.set(null);
    this.notice.set(null);
    this.fieldErrors.set({});
  }

  /** Save the question. With addAnother, the form stays open with the same paper, topic, difficulty and status. */
  async save(addAnother: boolean): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.reset();
    const images = this.pictureChanges();
    const d = this.draft;
    const common = { kind: d.kind, paper: d.paper, topic: d.topic, text: d.text, difficulty: d.difficulty, status: d.status };
    const kindFields =
      d.kind === 'fill_in'
        ? {
            answer:
              d.answerType === 'number'
                ? { type: 'number' as const, value: d.answerNumber, tolerance: d.tolerance }
                : { type: 'text' as const, accepted: d.answerText.split('|') },
            explanation: d.explanation,
          }
        : { options: d.options, correct: d.correct as number };
    const body = { ...common, ...kindFields, ...(Object.keys(images).length ? { images } : {}) };
    const editing = this.editingId();
    try {
      if (editing) await this.api.updateQuestion(editing, body);
      else await this.api.addQuestion(body);

      if (!editing && addAnother) {
        this.addedCount.update((count) => count + 1);
        const total = this.addedCount();
        this.notice.set(`Added question ${total} in ${this.paperName(body.paper)} · ${body.topic}. Add the next one.`);
        this.draft = { ...emptyDraft(), kind: body.kind, answerType: d.answerType, paper: body.paper, topic: body.topic, difficulty: body.difficulty, status: body.status };
        // Show the list for the same paper and topic, so the admin sees what is already there.
        this.filter = { ...this.filter, paper: body.paper, topic: body.topic };
        this.scrollToForm();
      } else {
        this.notice.set(editing ? 'Saved the question.' : 'Added the question.');
        this.form.set(false);
        this.editingId.set(null);
      }
      await this.load();
    } catch (error) {
      const problem = error as ApiError;
      if (problem.errors) this.fieldErrors.set(problem.errors);
      else this.error.set(problem);
    } finally {
      this.saving.set(false);
    }
  }

  private scrollToForm(): void {
    setTimeout(() => document.getElementById('q-text')?.focus());
  }

  async remove(question: Question): Promise<void> {
    this.saving.set(true);
    this.reset();
    try {
      await this.api.deleteQuestion(question.id);
      this.notice.set('Deleted the question.');
      await this.load();
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.confirming.set(null);
      this.saving.set(false);
    }
  }
}

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ApiError, PICTURE_SLOTS, Paper, Picture, Question } from '../core/models';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';
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
  /** The reading passage's text, or '' for none. Questions with the same text are shown together. */
  passageText: string;
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
    passageText: '',
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
    passageText: question.passage_text ?? '',
    pictures: Object.fromEntries(PICTURE_SLOTS.map((slot) => [slot, question.images?.[slot] ?? null])),
  };
}

/** The institute's question bank: choose a subject and topic, write the question, its four options and why each is right or wrong. */
@Component({
  selector: 'app-admin-questions',
  imports: [FormsModule, PicturePicker, QuestionUpload, Icon, InfoTip],
  template: `
    <div class="page-head">
      <h1>
        Question bank
        <app-info text="Pick a subject and topic, write the question and its options, and say why each option is right or wrong. Only published questions will be used in tests." />
      </h1>
      @if (!form()) {
        <button class="btn" type="button" (click)="startAdd()"><app-icon name="plus" /> Add question</button>
      }
    </div>

    @if (notice(); as text) { <div class="alert ok" role="status">{{ text }}</div> }
    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (form()) {
      <div class="form-panel" id="question-form">
        <h2>{{ editingId() ? 'Edit question' : 'Add question' }}</h2>
        @if (!editingId() && draft.paper && draft.topic) {
          <p class="soft" id="working-on">
            {{ paperName(draft.paper) }} · {{ draft.topic }}
            @if (addedCount()) { · <strong>{{ addedCount() }} added</strong> }
          </p>
        }
        <div class="grid-3">
          <div class="field">
            <label for="q-kind">Type</label>
            <select id="q-kind" name="kind" [(ngModel)]="draft.kind" (ngModelChange)="kindChanged()">
              <option value="mcq">Multiple choice</option>
              <option value="fill_in">Fill in</option>
            </select>
          </div>
          <div class="field">
            <label for="q-subject">Subject</label>
            <select id="q-subject" name="paper" [(ngModel)]="draft.paper" (ngModelChange)="paperChanged(); clearError('paper')" [attr.aria-invalid]="fieldErrors()['paper'] ? 'true' : null">
              <option value="">Choose a subject</option>
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
        <div class="grid-3">
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
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="q-passage">Passage <app-info text="Optional. Paste the passage for questions that refer to a text. Questions with the same passage are shown together, with the passage once above them." /></label>
          <textarea id="q-passage" name="passage" rows="3" [(ngModel)]="draft.passageText" (input)="clearError('passage')" [attr.aria-invalid]="fieldErrors()['passage'] ? 'true' : null"></textarea>
          @if (fieldErrors()['passage']) { <div class="error-text">{{ fieldErrors()['passage'] }}</div> }
        </div>

        <div class="field">
          <label for="q-text">Question</label>
          <textarea id="q-text" name="text" rows="3" [(ngModel)]="draft.text" (input)="clearError('text')" [attr.aria-invalid]="fieldErrors()['text'] ? 'true' : null"></textarea>
          @if (fieldErrors()['text']) { <div class="error-text">{{ fieldErrors()['text'] }}</div> }
        </div>
        <app-picture-picker inputId="pic-question" label="Question picture" [picture]="draft.pictures['question']" (changed)="setPicture('question', $event)" />

        @if (draft.kind === 'mcq') {
          <h3>Options <app-info text="Mark the correct option, and for every option say why it is correct or wrong." /></h3>
          @for (option of draft.options; track $index) {
            <fieldset class="option">
              <legend>Option {{ letters[$index] }}</legend>
              <div class="grid-2">
                <div class="field">
                  <label [attr.for]="'q-opt-' + $index">Text <app-info text="Leave the text empty if the option is only a picture." /></label>
                  <input [id]="'q-opt-' + $index" [name]="'opt' + $index" type="text" [(ngModel)]="option.text" (input)="clearError('options')" />
                </div>
                <div class="field">
                  <label [attr.for]="'q-why-' + $index">Why right or wrong</label>
                  <textarea [id]="'q-why-' + $index" [name]="'why' + $index" rows="2" [(ngModel)]="option.why" (input)="clearError('options')"></textarea>
                </div>
              </div>
              <app-picture-picker [inputId]="'pic-' + letters[$index]" [label]="'Option ' + letters[$index] + ' picture'" [picture]="draft.pictures[letters[$index]]" (changed)="setPicture(letters[$index], $event)" />
              <label class="inline">
                <input type="radio" name="correct" [id]="'q-correct-' + $index" [value]="$index" [(ngModel)]="draft.correct" (ngModelChange)="clearError('correct')" />
                Correct answer
              </label>
            </fieldset>
          }
          @if (fieldErrors()['options']) { <div class="error-text">{{ fieldErrors()['options'] }}</div> }
          @if (fieldErrors()['images']) { <div class="error-text">{{ fieldErrors()['images'] }}</div> }
          @if (fieldErrors()['correct']) { <div class="error-text">{{ fieldErrors()['correct'] }}</div> }

        } @else {
          <h3>Answer <app-info text="The student sees one box under the question and types the answer." /></h3>
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
                <label for="q-answer-text">Correct answer <app-info text="For other accepted answers, separate them with |, for example Mumbai | Bombay. Capitals and extra spaces don't matter." /></label>
                <input id="q-answer-text" name="answerText" type="text" [(ngModel)]="draft.answerText" (input)="clearError('answer')" [attr.aria-invalid]="fieldErrors()['answer'] ? 'true' : null" />
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
              <label for="q-tolerance">Tolerance <app-info text="Optional. How far off a student's number may be and still count, for example 0.01. Empty means exact." /></label>
              <input id="q-tolerance" name="tolerance" type="text" inputmode="decimal" [(ngModel)]="draft.tolerance" (input)="clearError('answer')" />
            </div>
          }
          @if (fieldErrors()['answer']) { <div class="error-text">{{ fieldErrors()['answer'] }}</div> }
          <div class="field">
            <label for="q-explanation">Explanation <app-info text="Why this is the right answer." /></label>
            <textarea id="q-explanation" name="explanation" rows="3" [(ngModel)]="draft.explanation" (input)="clearError('explanation')" [attr.aria-invalid]="fieldErrors()['explanation'] ? 'true' : null"></textarea>
            @if (fieldErrors()['explanation']) { <div class="error-text">{{ fieldErrors()['explanation'] }}</div> }
          </div>
        }

        <div class="actions">
          @if (editingId()) {
            <button class="btn" type="button" [disabled]="saving()" (click)="save(false)"><app-icon name="check" /> Save changes</button>
          } @else {
            <button class="btn" type="button" [disabled]="saving()" (click)="save(true)"><app-icon name="plus" /> Save and add another</button>
            <button class="btn secondary" type="button" [disabled]="saving()" (click)="save(false)">Save and close</button>
          }
          <button class="btn secondary" type="button" (click)="cancel()">{{ addedCount() ? 'Done' : 'Cancel' }}</button>
        </div>
      </div>
    }

    <div class="tabs" role="tablist" aria-label="Question bank sections">
      <button class="tab with-icon" role="tab" type="button" [attr.aria-selected]="tab() === 'questions'" (click)="tab.set('questions')"><app-icon name="list" [size]="16" /> Questions</button>
      <button class="tab with-icon" role="tab" type="button" [attr.aria-selected]="tab() === 'upload'" (click)="tab.set('upload')"><app-icon name="upload" [size]="16" /> Upload</button>
    </div>

    @if (tab() === 'upload') {
      <app-question-upload (imported)="uploaded($event)" (failed)="uploadFailed($event)" />
    }

    @if (tab() === 'questions') {
      <div class="toolbar">
        <div class="field">
          <label class="sr-only" for="f-subject">Subject</label>
          <select id="f-subject" name="fpaper" [(ngModel)]="filter.paper" (ngModelChange)="filter.topic = ''; load()">
            <option value="">All subjects</option>
            @for (paper of papers(); track paper.id) { <option [value]="paper.id">{{ paper.name }}</option> }
          </select>
        </div>
        <div class="field">
          <label class="sr-only" for="f-topic">Topic</label>
          <select id="f-topic" name="ftopic" [(ngModel)]="filter.topic" (ngModelChange)="load()" [disabled]="!filter.paper">
            <option value="">All topics</option>
            @for (topic of topicsOf(filter.paper); track topic) { <option [value]="topic">{{ topic }}</option> }
          </select>
        </div>
        <div class="field">
          <label class="sr-only" for="f-status">Status</label>
          <select id="f-status" name="fstatus" [(ngModel)]="filter.status" (ngModelChange)="load()">
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div class="field">
          <label class="sr-only" for="f-kind">Type</label>
          <select id="f-kind" name="fkind" [(ngModel)]="filter.kind" (ngModelChange)="load()">
            <option value="">All types</option>
            <option value="mcq">Multiple choice</option>
            <option value="fill_in">Fill in</option>
          </select>
        </div>
        <div class="field">
          <label class="sr-only" for="f-passage">Passage</label>
          <select id="f-passage" name="fpassage" [(ngModel)]="filter.passage" (ngModelChange)="load()">
            <option value="">Any passage</option>
            <option value="any">With a passage</option>
            <option value="none">Without a passage</option>
          </select>
        </div>
        <div class="field">
          <label class="sr-only" for="f-pictures">Pictures</label>
          <select id="f-pictures" name="fpictures" [(ngModel)]="filter.pictures" (ngModelChange)="load()">
            <option value="">Any pictures</option>
            <option value="yes">With pictures</option>
            <option value="no">Without pictures</option>
          </select>
        </div>
      </div>

      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else {
        @if (questions().length) {
          <div class="row bulk">
            <label class="check">
              <input type="checkbox" id="select-all" [checked]="allSelected()" (change)="toggleAll($any($event.target).checked)" />
              Select all {{ questions().length }}
            </label>
            @if (selectedCount()) {
              <span class="muted" id="selected-count">{{ selectedCount() }} selected</span>
              <button class="btn small" type="button" [disabled]="saving()" (click)="setStatus('published')"><app-icon name="check" [size]="16" /> Publish selected</button>
              <button class="btn secondary small" type="button" [disabled]="saving()" (click)="setStatus('draft')">Move to draft</button>
              <button class="icon-btn danger" type="button" title="Delete selected" [disabled]="saving()" (click)="askDeleteMany()"><app-icon name="trash" /><span class="sr-only">Delete selected</span></button>
              <button class="icon-btn" type="button" title="Clear" (click)="selected.set([]); deleteAsk.set(false)"><app-icon name="x" /><span class="sr-only">Clear</span></button>
            }
          </div>
          @if (deleteAsk() && selectedCount()) {
            <div class="danger-box" id="bulk-delete-box">
              <p>
                <strong>Delete {{ selectedCount() }} {{ selectedCount() === 1 ? 'question' : 'questions' }} for good?</strong>
                Pictures go too. No undo.
              </p>
              <div class="field">
                <label for="bulk-confirm">Type DELETE to confirm</label>
                <input id="bulk-confirm" name="bulkconfirm" autocomplete="off" [ngModel]="deleteWord()" (ngModelChange)="deleteWord.set($event)" />
              </div>
              <div class="row">
                <button class="btn danger small" id="bulk-delete-go" type="button" [disabled]="saving() || deleteWord() !== 'DELETE'" (click)="deleteMany()"><app-icon name="trash" [size]="16" /> Delete {{ selectedCount() }}</button>
                <button class="icon-btn" type="button" title="Keep them" (click)="deleteAsk.set(false)"><app-icon name="x" /><span class="sr-only">Keep them</span></button>
              </div>
            </div>
          }
        }
        @for (question of ordered(); track question.id; let first = $first; let at = $index) {
          @if (question.passage && (first || ordered()[at - 1].passage !== question.passage)) {
            <div class="passage-head" [attr.data-passage-head]="question.passage">
              <div class="row q-head">
                <strong><app-icon name="file" [size]="16" /> Passage</strong>
                @if (editingPassage() !== question.passage) {
                  <div class="icon-actions q-actions">
                    <button class="icon-btn" type="button" title="Edit passage" (click)="startPassageEdit(question)"><app-icon name="edit" /><span class="sr-only">Edit passage</span></button>
                  </div>
                }
              </div>
              @if (editingPassage() === question.passage) {
                <div class="field">
                  <textarea id="passage-edit" name="passageEdit" rows="6" aria-label="Passage text" [(ngModel)]="passageDraft" (input)="passageError.set(null)"></textarea>
                  <div class="soft">Changes the passage for every question below that shares it. {{ passageDraft.length }} / 5000</div>
                  @if (passageError(); as problem) { <div class="error-text">{{ problem }}</div> }
                </div>
                <div class="form-actions">
                  <button class="btn small" type="button" id="save-passage-edit" [disabled]="saving()" (click)="savePassage(question)"><app-icon name="check" [size]="16" /> Save passage</button>
                  <button class="icon-btn" type="button" title="Cancel" (click)="editingPassage.set(null)"><app-icon name="x" /><span class="sr-only">Cancel passage edit</span></button>
                </div>
              } @else {
                <p class="passage-text">{{ question.passage_text }}</p>
              }
            </div>
          }
          <div class="question" [class.in-passage]="!!question.passage" [attr.data-question]="question.id">
            <div class="row q-head">
              <input type="checkbox" class="pick" [attr.aria-label]="'Select question: ' + question.text"
                [checked]="selected().includes(question.id)" (change)="toggle(question.id, $any($event.target).checked)" />
              <span class="status" [class.ok]="question.status === 'published'">{{ question.status }}</span>
              <span class="soft">{{ paperName(question.paper) }} · {{ question.topic }} · {{ question.difficulty }}</span>
              @if (question.kind === 'fill_in') { <span class="chip pictures">fill in</span> }
              @if (hasPictures(question)) { <span class="chip pictures"><app-icon name="image" [size]="12" /> pictures</span> }
              <div class="icon-actions q-actions">
                <button class="icon-btn" type="button" title="Edit" (click)="startEdit(question)"><app-icon name="edit" /><span class="sr-only">Edit</span></button>
                @if (confirming() === question.id) {
                  <button class="btn danger small" type="button" [disabled]="saving()" (click)="remove(question)">Yes, delete</button>
                  <button class="icon-btn" type="button" title="Keep" (click)="confirming.set(null)"><app-icon name="x" /><span class="sr-only">Keep</span></button>
                } @else {
                  <button class="icon-btn danger" type="button" title="Delete" (click)="confirming.set(question.id)"><app-icon name="trash" /><span class="sr-only">Delete</span></button>
                }
              </div>
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
          </div>
        } @empty {
          <div class="empty-state"><app-icon name="help" [size]="32" /><p>No questions yet</p></div>
        }
      }
    }
  `,
})
export class AdminQuestions implements OnInit {
  private readonly api = inject(ApiService);
  readonly letters = LETTERS;

  readonly papers = signal<Paper[]>([]);
  readonly tab = signal<'questions' | 'upload'>('questions');
  readonly questions = signal<Question[]>([]);
  /** The questions with those of one passage kept together, so the passage is shown once above them. */
  readonly ordered = computed(() => {
    const groups = new Map<string, Question[]>();
    for (const question of this.questions()) {
      const key = question.passage || `single:${question.id}`;
      groups.set(key, [...(groups.get(key) ?? []), question]);
    }
    return [...groups.values()].flat();
  });
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly notice = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly form = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly confirming = signal<string | null>(null);
  /** The ids ticked for a bulk change. */
  readonly selected = signal<string[]>([]);
  /** The typed-confirmation box for deleting the ticked questions. */
  readonly deleteAsk = signal(false);
  readonly deleteWord = signal('');
  readonly selectedCount = computed(() => this.selected().length);
  readonly allSelected = computed(() => this.questions().length > 0 && this.selected().length === this.questions().length);
  /** How many questions were added in a row, without closing the form. */
  readonly addedCount = signal(0);

  draft: Draft = emptyDraft();
  /** The pictures the question already had when it was opened for editing, by position. */
  private original: Record<string, string> = {};
  /** The passage text the question had when the form opened, so only a change is sent. */
  private originalPassageText = '';
  readonly editingPassage = signal<string | null>(null);
  readonly passageError = signal<string | null>(null);
  passageDraft = '';
  filter = { paper: '', topic: '', status: '', pictures: '', kind: '', passage: '' };

  /** Subjects grouped by section, for the dropdown. */
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

  startPassageEdit(question: Question): void {
    this.reset();
    this.passageDraft = question.passage_text ?? '';
    this.passageError.set(null);
    this.editingPassage.set(question.passage ?? null);
  }

  /** Change the passage text for every question in the group. */
  async savePassage(question: Question): Promise<void> {
    if (!question.passage || this.saving()) return;
    this.saving.set(true);
    this.passageError.set(null);
    try {
      await this.api.updatePassage(question.passage, { text: this.passageDraft });
      this.editingPassage.set(null);
      this.notice.set('Saved the passage.');
      await this.load();
    } catch (error) {
      const problem = error as ApiError;
      this.passageError.set(problem.errors?.['text'] ?? problem.detail);
    } finally {
      this.saving.set(false);
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

  toggle(id: string, on: boolean): void {
    this.selected.update((ids) => (on ? [...ids, id] : ids.filter((item) => item !== id)));
  }

  toggleAll(on: boolean): void {
    this.selected.set(on ? this.questions().map((question) => question.id) : []);
  }

  askDeleteMany(): void {
    this.deleteWord.set('');
    this.deleteAsk.set(true);
  }

  /** Delete every ticked question. The button only works once DELETE has been typed. */
  async deleteMany(): Promise<void> {
    const ids = this.selected();
    if (!ids.length || this.deleteWord() !== 'DELETE') return;
    this.saving.set(true);
    this.reset();
    try {
      const result = await this.api.deleteQuestions(ids);
      this.notice.set(`Deleted ${result.deleted} ${result.deleted === 1 ? 'question' : 'questions'}.`);
      this.deleteAsk.set(false);
      await this.load();
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.saving.set(false);
    }
  }

  /** Publish or un-publish every ticked question, then show the fresh list. */
  async setStatus(status: 'draft' | 'published'): Promise<void> {
    const ids = this.selected();
    if (!ids.length) return;
    this.saving.set(true);
    this.reset();
    try {
      const result = await this.api.setQuestionStatus(ids, status);
      const word = status === 'published' ? 'Published' : 'Moved to draft:';
      const skipped = result.unchanged ? ` ${result.unchanged} already ${status === 'published' ? 'published' : 'drafts'}.` : '';
      this.notice.set(`${word} ${result.changed} ${result.changed === 1 ? 'question' : 'questions'}.${skipped}`);
      await this.load();
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.saving.set(false);
    }
  }

  async load(): Promise<void> {
    try {
      this.selected.set([]);
      this.deleteAsk.set(false);
      this.questions.set(await this.api.questions(this.filter));
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  /** Questions were imported from a file: say how many and show the fresh list. */
  async uploaded(count: number): Promise<void> {
    this.reset();
    this.tab.set('questions');
    this.notice.set(`Imported ${count} ${count === 1 ? 'question' : 'questions'}.`);
    this.filter = { paper: '', topic: '', status: '', pictures: '', kind: '', passage: '' };
    await this.load();
  }

  /** Some files of an upload couldn't be imported: say so on the page, since the upload tab has closed. */
  uploadFailed(message: string): void {
    this.error.set({ status: 0, detail: message });
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
    this.originalPassageText = '';
    this.addedCount.set(0);
    this.editingId.set(null);
    this.form.set(true);
  }

  startEdit(question: Question): void {
    this.dropUnsavedPictures();
    this.reset();
    this.draft = draftFrom(question);
    this.originalPassageText = question.passage_text ?? '';
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

  /** Save the question. With addAnother, the form stays open with the same subject, topic, difficulty and status. */
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
    const passage = d.passageText.trim() !== this.originalPassageText.trim() ? { passage_text: d.passageText } : {};
    const body = { ...common, ...kindFields, ...passage, ...(Object.keys(images).length ? { images } : {}) };
    const editing = this.editingId();
    try {
      if (editing) await this.api.updateQuestion(editing, body);
      else await this.api.addQuestion(body);

      if (!editing && addAnother) {
        this.addedCount.update((count) => count + 1);
        const total = this.addedCount();
        this.notice.set(`Added question ${total} in ${this.paperName(body.paper)} · ${body.topic}. Add the next one.`);
        this.draft = { ...emptyDraft(), kind: body.kind, answerType: d.answerType, paper: body.paper, topic: body.topic, difficulty: body.difficulty, status: body.status, passageText: d.passageText };
        this.originalPassageText = '';
        // Show the list for the same subject and topic, so the admin sees what is already there.
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

import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, PiQuestionInput, PiQuestionRow } from '../core/models';

/**
 * The institute admin's PI question bank. The admin adds a question with its topic, an optional subtopic and an
 * optional hint, and can remove a question. Students see the questions grouped by topic and subtopic.
 */
@Component({
  selector: 'app-admin-pi-bank',
  template: `
    <div class="page-head"><h1>PI question bank</h1></div>
    <p class="hint">Add personal interview questions with their topic. Students practise them as a list or as flashcards. Leave the subtopic empty to file a question under General.</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="pi-admin-error">{{ problem.detail }}</div> }

    <section class="card">
      <h2>Add a question</h2>
      <label class="field">Topic <input id="topic-input" type="text" maxlength="60" [value]="draft().topic" (input)="setField('topic', read($event))" /></label>
      <label class="field">Subtopic (optional) <input id="subtopic-input" type="text" maxlength="60" [value]="draft().subtopic" (input)="setField('subtopic', read($event))" /></label>
      <label class="field">Question <textarea id="question-input" maxlength="300" [value]="draft().question" (input)="setField('question', read($event))"></textarea></label>
      <label class="field">Hint for the answer (optional) <textarea id="hint-input" maxlength="500" [value]="draft().hint" (input)="setField('hint', read($event))"></textarea></label>
      <button class="btn" id="add-question" type="button" [disabled]="busy()" (click)="add()">Add question</button>
    </section>

    @if (loaded()) {
      @if (rows().length) {
        <div class="table-wrap">
          <table class="compact" id="pi-admin-table">
            <thead><tr><th>Topic</th><th>Subtopic</th><th>Question</th><th></th></tr></thead>
            <tbody>
              @for (row of rows(); track row.id) {
                <tr [attr.data-question]="row.id">
                  <td>{{ row.topic }}</td><td>{{ row.subtopic }}</td><td>{{ row.question }}</td>
                  <td><button type="button" class="link" [attr.aria-label]="'Remove ' + row.question" (click)="remove(row)">Remove</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="muted" id="pi-admin-empty">No questions yet.</p>
      }
    }
  `,
})
export class AdminPiBankPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly rows = signal<PiQuestionRow[]>([]);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly draft = signal<PiQuestionInput>(blank());

  async ngOnInit(): Promise<void> {
    try {
      this.rows.set(await this.api.piQuestions());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loaded.set(true);
    }
  }

  setField(field: keyof PiQuestionInput, value: string): void {
    this.draft.update((current) => ({ ...current, [field]: value }));
  }

  async add(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const added = await this.api.addPiQuestion(this.draft());
      this.rows.update((rows) => [...rows, added]);
      this.draft.set(blank());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(row: PiQuestionRow): Promise<void> {
    this.error.set(null);
    try {
      await this.api.removePiQuestion(row.id);
      this.rows.update((rows) => rows.filter((item) => item.id !== row.id));
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }
}

function blank(): PiQuestionInput {
  return { topic: '', subtopic: '', question: '', hint: '' };
}

import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ApiError, Passage } from '../core/models';

/** Reading passages: write a passage once, then point many questions at it. */
@Component({
  selector: 'app-admin-passages',
  imports: [FormsModule],
  template: `
    <div class="card" id="passages-card">
      <div class="row" style="justify-content: space-between; align-items: center">
        <h2>Reading passages</h2>
        @if (!open()) { <button class="btn secondary small" type="button" id="add-passage" (click)="startAdd()">Add a passage</button> }
      </div>
      <p class="hint">A passage is saved once, and any number of questions can use it. Choose it in the question form, or name it in the Excel file.</p>

      @if (notice(); as text) { <div class="alert ok" role="status">{{ text }}</div> }
      @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

      @if (open()) {
        <div class="passage-form" id="passage-form">
          <div class="field">
            <label for="p-title">Title</label>
            <input id="p-title" name="ptitle" [(ngModel)]="title" (input)="clearError('title')" [attr.aria-invalid]="fieldErrors()['title'] ? 'true' : null" />
            @if (fieldErrors()['title']) { <div class="error-text">{{ fieldErrors()['title'] }}</div> }
          </div>
          <div class="field">
            <label for="p-text">Passage</label>
            <textarea id="p-text" name="ptext" rows="8" [(ngModel)]="body" (input)="clearError('text')" [attr.aria-invalid]="fieldErrors()['text'] ? 'true' : null"></textarea>
            <div class="hint">{{ body.length }} / 5000 characters. Blank lines keep your paragraphs apart.</div>
            @if (fieldErrors()['text']) { <div class="error-text">{{ fieldErrors()['text'] }}</div> }
          </div>
          <div class="row">
            <button class="btn small" type="button" id="save-passage" [disabled]="saving()" (click)="save()">{{ saving() ? 'Saving…' : editingId() ? 'Save passage' : 'Add passage' }}</button>
            <button class="btn secondary small" type="button" (click)="open.set(false)">Cancel</button>
          </div>
        </div>
      }

      @for (passage of passages(); track passage.id) {
        <div class="passage-row" [attr.data-passage]="passage.id">
          <div class="row">
            <strong>{{ passage.title }}</strong>
            <span class="chip">{{ passage.questions }} {{ passage.questions === 1 ? 'question' : 'questions' }}</span>
          </div>
          <p class="hint">{{ preview(passage.text) }}</p>
          <div class="row">
            <button class="btn secondary small" type="button" (click)="startEdit(passage)">Edit</button>
            @if (confirming() === passage.id) {
              <button class="btn danger small" type="button" [disabled]="saving()" (click)="remove(passage)">Yes, delete</button>
              <button class="btn secondary small" type="button" (click)="confirming.set(null)">Keep</button>
            } @else {
              <button class="btn secondary small" type="button" (click)="confirming.set(passage.id)">Delete</button>
            }
          </div>
        </div>
      } @empty {
        <p class="empty">No passages yet.</p>
      }
    </div>
  `,
})
export class AdminPassages {
  private readonly api = inject(ApiService);
  /** Tells the page the passages changed, so it can refresh its dropdown and list. */
  readonly changed = output<void>();

  /** The institute's passages, loaded by the page. */
  readonly passages = input.required<Passage[]>();
  readonly open = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly confirming = signal<string | null>(null);
  readonly saving = signal(false);
  readonly notice = signal<string | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  title = '';
  body = '';

  preview(text: string): string {
    const flat = text.replace(/\s+/g, ' ');
    return flat.length > 160 ? flat.slice(0, 160) + '…' : flat;
  }

  clearError(field: string): void {
    const { [field]: _gone, ...rest } = this.fieldErrors();
    this.fieldErrors.set(rest);
  }

  startAdd(): void {
    this.reset();
    this.title = '';
    this.body = '';
    this.editingId.set(null);
    this.open.set(true);
  }

  startEdit(passage: Passage): void {
    this.reset();
    this.title = passage.title;
    this.body = passage.text;
    this.editingId.set(passage.id);
    this.open.set(true);
  }

  private reset(): void {
    this.notice.set(null);
    this.error.set(null);
    this.fieldErrors.set({});
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.reset();
    const editing = this.editingId();
    try {
      if (editing) await this.api.updatePassage(editing, { title: this.title, text: this.body });
      else await this.api.addPassage({ title: this.title, text: this.body });
      this.notice.set(editing ? 'Saved the passage.' : 'Added the passage.');
      this.open.set(false);
      this.changed.emit();
    } catch (error) {
      const problem = error as ApiError;
      if (problem.errors) this.fieldErrors.set(problem.errors);
      else this.error.set(problem);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(passage: Passage): Promise<void> {
    this.saving.set(true);
    this.reset();
    try {
      await this.api.deletePassage(passage.id);
      this.notice.set('Deleted the passage.');
      this.changed.emit();
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.confirming.set(null);
      this.saving.set(false);
    }
  }
}

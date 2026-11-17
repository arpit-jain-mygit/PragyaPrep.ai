import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ApiError, Passage } from '../core/models';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

/** Reading passages: write a passage once, then point many questions at it. */
@Component({
  selector: 'app-admin-passages',
  imports: [FormsModule, Icon, InfoTip],
  template: `
    <div id="passages-card">
      <div class="row spread" style="margin-bottom: 0.75rem">
        <span class="soft">Write a passage once; many questions can use it. <app-info text="Choose it in the question form, or name it in the Excel file." /></span>
        @if (!open()) { <button class="btn small" type="button" id="add-passage" (click)="startAdd()"><app-icon name="plus" [size]="16" /> Add passage</button> }
      </div>

      @if (notice(); as text) { <div class="alert ok" role="status">{{ text }}</div> }
      @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

      @if (open()) {
        <div class="form-panel" id="passage-form">
          <div class="field">
            <label for="p-title">Title</label>
            <input id="p-title" name="ptitle" [(ngModel)]="title" (input)="clearError('title')" [attr.aria-invalid]="fieldErrors()['title'] ? 'true' : null" />
            @if (fieldErrors()['title']) { <div class="error-text">{{ fieldErrors()['title'] }}</div> }
          </div>
          <div class="field">
            <label for="p-text">Passage</label>
            <textarea id="p-text" name="ptext" rows="8" [(ngModel)]="body" (input)="clearError('text')" [attr.aria-invalid]="fieldErrors()['text'] ? 'true' : null"></textarea>
            <div class="soft">{{ body.length }} / 5000</div>
            @if (fieldErrors()['text']) { <div class="error-text">{{ fieldErrors()['text'] }}</div> }
          </div>
          <div class="row">
            <button class="btn small" type="button" id="save-passage" [disabled]="saving()" (click)="save()"><app-icon name="check" [size]="16" /> {{ saving() ? 'Saving…' : editingId() ? 'Save passage' : 'Add passage' }}</button>
            <button class="icon-btn" type="button" title="Cancel" (click)="open.set(false)"><app-icon name="x" /><span class="sr-only">Cancel</span></button>
          </div>
        </div>
      }

      @for (passage of passages(); track passage.id) {
        <div class="passage-row" [attr.data-passage]="passage.id">
          <div class="row q-head">
            <strong>{{ passage.title }}</strong>
            <span class="chip">{{ passage.questions }} {{ passage.questions === 1 ? 'question' : 'questions' }}</span>
            <div class="icon-actions q-actions">
              <button class="icon-btn" type="button" title="Edit" (click)="startEdit(passage)"><app-icon name="edit" /><span class="sr-only">Edit</span></button>
              @if (confirming() === passage.id) {
                <button class="btn danger small" type="button" [disabled]="saving()" (click)="remove(passage)">Yes, delete</button>
                <button class="icon-btn" type="button" title="Keep" (click)="confirming.set(null)"><app-icon name="x" /><span class="sr-only">Keep</span></button>
              } @else {
                <button class="icon-btn danger" type="button" title="Delete" (click)="confirming.set(passage.id)"><app-icon name="trash" /><span class="sr-only">Delete</span></button>
              }
            </div>
          </div>
          <p class="soft" style="margin: 0.25rem 0 0">{{ preview(passage.text) }}</p>
        </div>
      } @empty {
        <div class="empty-state"><app-icon name="file" [size]="32" /><p>No passages yet</p></div>
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

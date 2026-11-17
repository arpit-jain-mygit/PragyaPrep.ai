import { Component, inject, output, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, QuestionImport } from '../core/models';
import { UploadService } from '../core/upload.service';

const MAX_PICTURE_BYTES = 1024 * 1024;

interface Staged {
  name: string;
  id: string | null;
  state: 'uploading' | 'done' | 'error';
  error?: string;
}

/** Upload many questions from an Excel file: download the template, choose the filled-in file, see a preview, then import. */
@Component({
  selector: 'app-question-upload',
  template: `
    <div class="card" id="question-upload">
      <h2>Upload many questions</h2>
      <p class="muted">Download the Excel template, fill in one row per question, and upload it here. You see a preview first, and nothing is saved until you confirm.</p>

      @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

      <div class="row">
        <button class="btn secondary" type="button" [disabled]="busy()" (click)="download()">Download template</button>
      </div>

      @if (!result()) {
        <div class="field" style="margin-top: 0.75rem">
          <label for="upload-pictures">Step 1 (only if your questions have pictures): choose all the pictures</label>
          <input id="upload-pictures" name="uploadPictures" type="file" multiple accept=".png,.jpg,.jpeg,image/png,image/jpeg" (change)="picturesPicked($event)" [disabled]="busy()" />
          <div class="hint">PNG or JPG, up to 1 MB each. In the Excel file, type each picture's file name (for example circuit1.png) in the Question image or Image A to D column.</div>
          @if (staged().length) {
            <ul class="staged" id="staged-pictures">
              @for (item of staged(); track $index) {
                <li [attr.data-staged]="item.name">
                  {{ item.name }}
                  @if (item.state === 'uploading') { <span class="muted">uploading…</span> }
                  @if (item.state === 'done') { <span class="chip open">ready</span> }
                  @if (item.state === 'error') { <span class="error-text">{{ item.error }}</span> }
                  @if (item.state !== 'uploading') {
                    <button class="btn secondary small" type="button" (click)="unstage(item)">Remove</button>
                  }
                </li>
              }
            </ul>
          }
        </div>
        <div class="field">
          <label for="upload-file">{{ staged().length ? 'Step 2: ' : '' }}Filled-in Excel file (.xlsx)</label>
          <input id="upload-file" name="uploadFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" (change)="picked($event)" [disabled]="busy()" />
          @if (busy()) { <div class="hint">Checking the file…</div> }
        </div>
      } @else {
        @let r = result()!;
        <div class="preview" id="upload-preview">
          <p>
            <strong>{{ r.ready.length }} ready</strong>
            @if (picturesIn(r); as count) { ({{ count }} {{ count === 1 ? 'picture' : 'pictures' }}) }
            @if (r.problems.length) { · <span class="bad">{{ r.problems.length }} with problems</span> }
            @if (r.duplicates.length) { · {{ r.duplicates.length }} already in the bank (skipped) }
          </p>

          @if (r.problems.length) {
            <div class="table-wrap">
              <table>
                <thead><tr><th>Row</th><th>What to fix</th></tr></thead>
                <tbody>
                  @for (problem of r.problems; track problem.row) {
                    <tr>
                      <td>{{ problem.row }}</td>
                      <td>
                        @for (entry of entries(problem.errors); track entry[0]) {
                          <div><strong>{{ entry[0] }}:</strong> {{ entry[1] }}</div>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="hint">Rows with problems are not imported. Fix them in your file and upload it again; questions already imported are skipped the second time.</p>
          }

          @if (r.duplicates.length) {
            <p class="hint">Skipped as duplicates: rows {{ rowsOf(r.duplicates) }}.</p>
          }

          <div class="actions">
            <button class="btn" type="button" [disabled]="busy() || !r.ready.length" (click)="confirm()">
              {{ busy() ? 'Importing…' : 'Import ' + r.ready.length + (r.ready.length === 1 ? ' question' : ' questions') }}
            </button>
            <button class="btn secondary" type="button" [disabled]="busy()" (click)="reset()">Choose another file</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class QuestionUpload {
  private readonly api = inject(ApiService);
  private readonly uploader = inject(UploadService);

  /** Said when questions were saved, with how many. */
  readonly imported = output<number>();

  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly result = signal<QuestionImport | null>(null);
  readonly staged = signal<Staged[]>([]);
  private file: File | null = null;

  picturesIn(result: QuestionImport): number {
    return result.ready.reduce((sum, item) => sum + (item.pictures ?? 0), 0);
  }

  /** Send the chosen pictures one after another, each straight to storage. */
  async picturesPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const file of files) {
      const item: Staged = { name: file.name, id: null, state: 'uploading' };
      this.staged.update((list) => [...list, item]);
      const refresh = (change: Partial<Staged>) => {
        Object.assign(item, change);
        this.staged.update((list) => [...list]);
      };
      if (!/\.(png|jpe?g)$/i.test(file.name)) { refresh({ state: 'error', error: 'A picture must be a PNG or JPG.' }); continue; }
      if (file.size > MAX_PICTURE_BYTES) { refresh({ state: 'error', error: 'A picture can be up to 1 MB.' }); continue; }
      try {
        const started = await this.api.startQuestionPicture({ filename: file.name, size: file.size });
        await this.uploader.send(started.upload, file, () => undefined);
        await this.api.finishQuestionPicture(started.id);
        refresh({ id: started.id, state: 'done' });
      } catch (error) {
        refresh({ state: 'error', error: (error as ApiError).detail });
      }
    }
  }

  unstage(item: Staged): void {
    this.staged.update((list) => list.filter((entry) => entry.name !== item.name || entry.id !== item.id));
    if (item.id) void this.api.discardQuestionPicture(item.id).catch(() => undefined);
  }

  /** Pictures that were uploaded for this file but not used are thrown away. Used ones are on their questions now. */
  private dropStaged(): void {
    for (const item of this.staged()) {
      if (item.id) void this.api.discardQuestionPicture(item.id).catch(() => undefined);
    }
    this.staged.set([]);
  }

  entries(errors: Record<string, string>): [string, string][] {
    return Object.entries(errors);
  }

  rowsOf(items: { row: number }[]): string {
    return items.map((item) => item.row).join(', ');
  }

  async download(): Promise<void> {
    this.error.set(null);
    try {
      const blob = await this.api.questionTemplate();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'question-bank-template.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async picked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
    this.error.set(null);
    if (!this.file) return;
    if (!/\.xlsx$/i.test(this.file.name)) {
      this.error.set({ status: 0, detail: 'Choose an Excel file that ends in .xlsx. Download the template to start.' });
      input.value = '';
      this.file = null;
      return;
    }
    this.busy.set(true);
    try {
      this.result.set(await this.api.importQuestions(this.file, false));
    } catch (error) {
      this.error.set(error as ApiError);
      input.value = '';
    } finally {
      this.busy.set(false);
    }
  }

  async confirm(): Promise<void> {
    if (!this.file || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const done = await this.api.importQuestions(this.file, true);
      this.result.set(null);
      this.file = null;
      this.dropStaged();
      this.imported.emit(done.imported);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  reset(): void {
    this.result.set(null);
    this.file = null;
    this.error.set(null);
  }
}

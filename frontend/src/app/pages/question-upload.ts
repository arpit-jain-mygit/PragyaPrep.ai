import { Component, computed, inject, output, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, QuestionImport } from '../core/models';
import { UploadService } from '../core/upload.service';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

const MAX_PICTURE_BYTES = 1024 * 1024;
const MAX_ZIP_BYTES = 250 * 1024 * 1024;
const MAX_SHEETS = 30;
const MAX_PICTURES = 1000;
const PARALLEL_PICTURES = 4;

interface Staged {
  name: string;
  id: string | null;
  state: 'uploading' | 'done' | 'error';
  error?: string;
}

/** One Excel file in the run, with what the server said about it. */
interface Sheet {
  name: string;
  file: File;
  state: 'checking' | 'ready' | 'error';
  result?: QuestionImport;
  error?: string;
}

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Upload many questions in one go. Choose a zip (with Excel files and pictures inside) or several files together.
 * The browser unzips, sends the pictures straight to storage, has the server check every Excel file, shows one combined
 * preview, and one Import saves every ready question.
 */
@Component({
  selector: 'app-question-upload',
  imports: [Icon, InfoTip],
  template: `
    <div class="form-panel" id="question-upload">
      @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

      <div class="row">
        <button class="btn secondary" type="button" [disabled]="busy()" (click)="download()"><app-icon name="download" /> Download template</button>
        <app-info text="Fill in one row per question. You see a preview first, and nothing is saved until you confirm." />
      </div>

      @if (!sheets().length) {
        <div class="field" style="margin-top: 0.75rem">
          <label for="upload-files">
            Files or a zip
            <app-info text="Choose one .zip holding your Excel files and pictures, or select the files together. Each Excel file can have up to 500 questions (2 MB). Pictures are PNG or JPG, up to 1 MB each, and are matched by the file name typed in the Excel file." />
          </label>
          <input id="upload-files" name="uploadFiles" type="file" multiple accept=".zip,.xlsx,.png,.jpg,.jpeg,application/zip,image/png,image/jpeg" (change)="chosen($event)" [disabled]="busy()" />
        </div>

        @if (progress(); as p) {
          <div class="field" role="status" id="picture-progress">
            <label for="picture-bar">Pictures {{ p.done }} / {{ p.total }}</label>
            <progress id="picture-bar" [max]="p.total" [value]="p.done" style="width: 100%"></progress>
          </div>
        } @else if (busy()) {
          <p class="soft" role="status">Working…</p>
        }

        @if (stagedDone() || stagedErrors().length) {
          <p class="soft" id="staged-pictures">
            <app-icon name="image" [size]="14" />
            {{ stagedDone() }} {{ stagedDone() === 1 ? 'picture' : 'pictures' }} ready
            @if (stagedErrors().length) { · <span class="bad">{{ stagedErrors().length }} not uploaded</span> }
          </p>
          @for (item of stagedErrors(); track $index) {
            <div class="error-text" [attr.data-staged]="item.name"><strong>{{ item.name }}:</strong> {{ item.error }}</div>
          }
        }
        @if (notes().length) {
          <p class="soft" id="upload-notes">{{ notes().join(' ') }}</p>
        }
      } @else {
        <div class="preview" id="upload-preview">
          <p>
            <strong>{{ totalReady() }} ready</strong>
            @if (totalPictures(); as count) { ({{ count }} {{ count === 1 ? 'picture' : 'pictures' }}) }
            @if (totalNewPassages()) { · {{ totalNewPassages() }} new {{ totalNewPassages() === 1 ? 'passage' : 'passages' }} }
            @if (totalProblems()) { · <span class="bad">{{ totalProblems() }} with problems</span> }
            @if (totalDuplicates()) { · {{ totalDuplicates() }} already in the bank (skipped) }
          </p>

          <div class="table-wrap">
            <table class="compact" id="sheet-table">
              <thead><tr><th>File</th><th>Ready</th><th>Problems</th><th>Skipped</th></tr></thead>
              <tbody>
                @for (sheet of sheets(); track $index) {
                  <tr [attr.data-sheet]="sheet.name">
                    <td><strong>{{ sheet.name }}</strong></td>
                    @if (sheet.state === 'checking') {
                      <td colspan="3" class="soft">Checking…</td>
                    } @else if (sheet.state === 'error') {
                      <td colspan="3" class="error-text">{{ sheet.error }}</td>
                    } @else {
                      <td>{{ sheet.result!.ready.length }}</td>
                      <td [class.bad]="sheet.result!.problems.length">{{ sheet.result!.problems.length }}</td>
                      <td class="soft">{{ sheet.result!.duplicates.length }}</td>
                    }
                  </tr>
                  @if (sheet.result?.problems?.length) {
                    <tr [attr.data-problems]="sheet.name">
                      <td colspan="4">
                        <details>
                          <summary class="soft">What to fix in {{ sheet.name }}</summary>
                          <table class="compact">
                            <thead><tr><th>Row</th><th>What to fix</th></tr></thead>
                            <tbody>
                              @for (problem of sheet.result!.problems; track problem.row) {
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
                        </details>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
          @if (totalProblems()) {
            <p class="soft">Rows with problems are skipped. Fix them and upload again; imported questions are skipped the second time.</p>
          }

          <div class="actions">
            <button class="btn" type="button" [disabled]="busy() || !totalReady()" (click)="confirm()">
              <app-icon name="upload" /> {{ busy() ? 'Importing…' : 'Import ' + totalReady() + (totalReady() === 1 ? ' question' : ' questions') }}
            </button>
            <button class="btn secondary" type="button" [disabled]="busy()" (click)="reset()"><app-icon name="rotate" /> Choose other files</button>
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
  /** Said after that when some files couldn't be imported, with a message about them. */
  readonly failed = output<string>();

  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly sheets = signal<Sheet[]>([]);
  readonly staged = signal<Staged[]>([]);
  readonly notes = signal<string[]>([]);
  readonly progress = signal<{ done: number; total: number } | null>(null);

  readonly stagedDone = computed(() => this.staged().filter((item) => item.state === 'done').length);
  readonly stagedErrors = computed(() => this.staged().filter((item) => item.state === 'error'));
  private readonly results = computed(() => this.sheets().flatMap((sheet) => (sheet.result ? [sheet.result] : [])));
  readonly totalReady = computed(() => this.results().reduce((sum, r) => sum + r.ready.length, 0));
  readonly totalProblems = computed(() => this.results().reduce((sum, r) => sum + r.problems.length, 0));
  readonly totalDuplicates = computed(() => this.results().reduce((sum, r) => sum + r.duplicates.length, 0));
  readonly totalPictures = computed(() => this.results().reduce((sum, r) => sum + r.ready.reduce((n, item) => n + (item.pictures ?? 0), 0), 0));
  readonly totalNewPassages = computed(() => this.results().reduce((sum, r) => sum + (r.new_passages ?? 0), 0));

  entries(errors: Record<string, string>): [string, string][] {
    return Object.entries(errors);
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

  /** The admin chose files: unzip what is a zip, send the pictures, then have every Excel file checked. */
  async chosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    if (!picked.length || this.busy()) return;
    this.error.set(null);
    this.notes.set([]);
    this.busy.set(true);
    try {
      const found = await this.collect(picked);
      if (!found.sheets.length && !found.pictures.length) {
        this.error.set({ status: 0, detail: 'Nothing to upload. Choose a zip, Excel (.xlsx) files, or PNG or JPG pictures.' });
        return;
      }
      if (found.sheets.length > MAX_SHEETS) {
        this.error.set({ status: 0, detail: `That is ${found.sheets.length} Excel files. Upload up to ${MAX_SHEETS} at a time.` });
        return;
      }
      if (found.pictures.length > MAX_PICTURES) {
        this.error.set({ status: 0, detail: `That is ${found.pictures.length} pictures. Upload up to ${MAX_PICTURES} at a time.` });
        return;
      }
      if (found.skipped.length) {
        const shown = found.skipped.slice(0, 3).join(', ');
        this.notes.set([`Ignored ${found.skipped.length} ${found.skipped.length === 1 ? 'file' : 'files'} that are not Excel or pictures (${shown}${found.skipped.length > 3 ? ', …' : ''}).`]);
      }
      await this.uploadPictures(found.pictures);
      await this.checkSheets(found.sheets);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.progress.set(null);
      this.busy.set(false);
    }
  }

  /** Sort what was chosen into Excel files and pictures. A zip is opened, and the files inside are sorted the same way. */
  private async collect(picked: File[]): Promise<{ sheets: File[]; pictures: File[]; skipped: string[] }> {
    const sheets: File[] = [];
    const pictures: File[] = [];
    const skipped: string[] = [];
    const seen = new Set<string>();

    const add = (file: File) => {
      const ext = extension(file.name);
      if (ext === 'xlsx') {
        sheets.push(file);
      } else if (ext in IMAGE_TYPES) {
        const key = file.name.toLowerCase();
        if (seen.has(key)) {
          skipped.push(`${file.name} (name used twice)`);
        } else {
          seen.add(key);
          pictures.push(file);
        }
      } else {
        skipped.push(file.name);
      }
    };

    for (const file of picked) {
      if (extension(file.name) !== 'zip') {
        add(file);
        continue;
      }
      if (file.size > MAX_ZIP_BYTES) throw { status: 0, detail: `${file.name} is too big. Keep a zip under 250 MB.` } as ApiError;
      let zip;
      try {
        const { default: JSZip } = await import('jszip');
        zip = await JSZip.loadAsync(file);
      } catch {
        throw { status: 0, detail: `${file.name} couldn't be opened as a zip.` } as ApiError;
      }
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const base = entry.name.split('/').pop() ?? entry.name;
        // Files a computer adds on its own: macOS resource forks, Excel lock files, hidden files.
        if (entry.name.includes('__MACOSX/') || base.startsWith('.') || base.startsWith('~$')) continue;
        const ext = extension(base);
        if (ext !== 'xlsx' && !(ext in IMAGE_TYPES)) {
          skipped.push(base);
          continue;
        }
        const blob = await entry.async('blob');
        add(new File([blob], base, { type: ext === 'xlsx' ? XLSX_TYPE : IMAGE_TYPES[ext] }));
      }
    }
    return { sheets, pictures, skipped };
  }

  /** Send pictures straight to storage, a few at a time. A picture that fails is listed; the rest carry on. */
  private async uploadPictures(files: File[]): Promise<void> {
    if (!files.length) return;
    let done = 0;
    this.progress.set({ done, total: files.length });
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const file = files[next++];
        const item: Staged = { name: file.name, id: null, state: 'uploading' };
        this.staged.update((list) => [...list, item]);
        const finish = (change: Partial<Staged>) => {
          Object.assign(item, change);
          this.staged.update((list) => [...list]);
          this.progress.set({ done: ++done, total: files.length });
        };
        if (file.size > MAX_PICTURE_BYTES) {
          finish({ state: 'error', error: 'A picture can be up to 1 MB.' });
          continue;
        }
        try {
          const started = await this.api.startQuestionPicture({ filename: file.name, size: file.size });
          await this.uploader.send(started.upload, file, () => undefined);
          await this.api.finishQuestionPicture(started.id);
          finish({ id: started.id, state: 'done' });
        } catch (error) {
          finish({ state: 'error', error: (error as ApiError).detail });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_PICTURES, files.length) }, worker));
  }

  /** Have the server check each Excel file, one after another. One bad file doesn't stop the others. */
  private async checkSheets(files: File[]): Promise<void> {
    const sheets: Sheet[] = files.map((file) => ({ name: file.name, file, state: 'checking' }));
    this.sheets.set(sheets);
    for (const sheet of sheets) {
      try {
        sheet.result = await this.api.importQuestions(sheet.file, false);
        sheet.state = 'ready';
      } catch (error) {
        sheet.state = 'error';
        sheet.error = (error as ApiError).detail;
      }
      this.sheets.update((list) => [...list]);
    }
  }

  /** Import every file, one after another. A question already saved by an earlier file is skipped as a duplicate. */
  async confirm(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    let total = 0;
    const failed: string[] = [];
    try {
      for (const sheet of this.sheets()) {
        if (sheet.state !== 'ready' || !sheet.result?.ready.length) continue;
        try {
          total += (await this.api.importQuestions(sheet.file, true)).imported;
        } catch (error) {
          failed.push(`${sheet.name}: ${(error as ApiError).detail}`);
        }
      }
    } finally {
      this.busy.set(false);
    }
    this.sheets.set([]);
    this.dropStaged();
    this.imported.emit(total);
    if (failed.length) this.failed.emit(`Some files couldn't be imported. ${failed.join(' ')}`);
  }

  /** Pictures that were uploaded but not used are thrown away. Used ones are on their questions now. */
  private dropStaged(): void {
    for (const item of this.staged()) {
      if (item.id) void this.api.discardQuestionPicture(item.id).catch(() => undefined);
    }
    this.staged.set([]);
  }

  reset(): void {
    this.sheets.set([]);
    this.error.set(null);
  }
}

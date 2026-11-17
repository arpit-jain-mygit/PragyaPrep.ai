import { Component, inject, input, output, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { Picture, ApiError } from '../core/models';
import { UploadService } from '../core/upload.service';

const MAX_BYTES = 1024 * 1024;

/** One optional picture for a question or an option: choose a PNG or JPG, see it, replace it or take it off. */
@Component({
  selector: 'app-picture-picker',
  template: `
    <div class="picture" [attr.data-picture]="inputId()">
      <label [attr.for]="inputId()">{{ label() }}</label>
      @if (picture(); as current) {
        <div class="thumb"><img [src]="current.url" [alt]="label()" /></div>
      }
      <div class="row">
        <input [id]="inputId()" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" (change)="picked($event)" [disabled]="busy()" />
        @if (picture() && !busy()) {
          <button class="btn secondary small" type="button" (click)="remove()">Remove picture</button>
        }
      </div>
      @if (busy()) { <div class="hint">Uploading… {{ progress() }}%</div> }
      @if (error(); as problem) { <div class="error-text">{{ problem }}</div> }
    </div>
  `,
})
export class PicturePicker {
  private readonly api = inject(ApiService);
  private readonly uploader = inject(UploadService);

  readonly label = input.required<string>();
  readonly inputId = input.required<string>();
  readonly picture = input<Picture | null>(null);
  /** The picture after a change: the new one, or null when it was taken off. */
  readonly changed = output<Picture | null>();

  readonly busy = signal(false);
  readonly progress = signal(0);
  readonly error = signal<string | null>(null);

  async picked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.error.set(null);
    if (!file) return;
    if (!/\.(png|jpe?g)$/i.test(file.name)) return this.refuse(input, 'A picture must be a PNG or JPG.');
    if (file.size > MAX_BYTES) return this.refuse(input, 'A picture can be up to 1 MB.');

    this.busy.set(true);
    this.progress.set(0);
    try {
      const started = await this.api.startQuestionPicture({ filename: file.name, size: file.size });
      await this.uploader.send(started.upload, file, (percent) => this.progress.set(percent));
      const done = await this.api.finishQuestionPicture(started.id);
      this.changed.emit(done);
    } catch (error) {
      this.error.set((error as ApiError).detail);
    } finally {
      this.busy.set(false);
      input.value = '';
    }
  }

  remove(): void {
    this.error.set(null);
    this.changed.emit(null);
  }

  private refuse(input: HTMLInputElement, message: string): void {
    this.error.set(message);
    input.value = '';
  }
}

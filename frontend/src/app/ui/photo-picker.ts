import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ApiError } from '../core/models';
import { LoadedPicture, PhotoService } from '../core/photo.service';
import { clampOffset, cropFor } from '../core/avatar';
import { Avatar } from './avatar';
import { Icon } from './icon';

/** The size of the round window the picture is positioned in. */
export const VIEW = 220;

/**
 * Choose a picture, drag and zoom it inside a round window, and keep the result as a small square photo.
 * It sends the finished photo out as a Blob (or null when removed); saving it is up to whoever uses the picker.
 */
@Component({
  selector: 'app-photo-picker',
  imports: [Avatar, Icon],
  template: `
    @if (!picture()) {
      <div class="photo-row">
        <app-avatar [url]="shownUrl()" [first]="first()" [last]="last()" [email]="email()" [size]="72" />
        <label class="btn secondary small photo-choose">
          <input type="file" id="photo-file" accept="image/jpeg,image/png,image/webp" class="sr-only" [disabled]="disabled()" (change)="chosen($event)" />
          <app-icon name="upload" [size]="16" /> {{ shownUrl() ? 'Change photo' : 'Add photo' }}
        </label>
        @if (shownUrl()) { <button class="icon-btn danger" type="button" id="photo-remove" title="Remove photo" [disabled]="disabled()" (click)="remove()"><app-icon name="trash" /><span class="sr-only">Remove photo</span></button> }
      </div>
      @if (error(); as problem) { <div class="error-text" role="alert" id="photo-error">{{ problem.detail }}</div> }
    } @else {
      <div class="crop" id="crop">
        <div class="crop-view" [style.width.px]="view" [style.height.px]="view" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="up($event)">
          <img [src]="picture()!.url" alt="Photo being positioned" draggable="false" [style.width.px]="shown().width" [style.height.px]="shown().height" [style.left.px]="shown().ox" [style.top.px]="shown().oy" />
        </div>
        <label class="crop-zoom">
          <span class="soft">Zoom</span>
          <input type="range" id="photo-zoom" min="1" max="3" step="0.01" [value]="zoom()" (input)="setZoom($any($event.target).valueAsNumber)" aria-label="Zoom" />
        </label>
        <div class="row">
          <button class="btn small" type="button" id="photo-use" [disabled]="busy()" (click)="use()"><app-icon name="check" [size]="16" /> Use photo</button>
          <button class="btn secondary small" type="button" id="photo-cancel" (click)="cancel()">Cancel</button>
        </div>
      </div>
    }
  `,
})
export class PhotoPicker {
  private readonly photos = inject(PhotoService);

  /** The photo they have now (a link), if any. */
  readonly current = input<string | null | undefined>('');
  readonly first = input<string | null | undefined>('');
  readonly last = input<string | null | undefined>('');
  readonly email = input<string | null | undefined>('');
  readonly disabled = input(false);

  /** The finished photo, or null when it was removed. */
  readonly photo = output<Blob | null>();

  readonly view = VIEW;
  readonly picture = signal<LoadedPicture | null>(null);
  readonly zoom = signal(1);
  readonly ox = signal(0);
  readonly oy = signal(0);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  /** The photo just made, shown until the page has a link to the saved one. */
  readonly preview = signal('');
  private readonly removed = signal(false);
  private drag: { x: number; y: number; ox: number; oy: number } | null = null;

  readonly shownUrl = computed(() => (this.removed() ? '' : this.preview() || this.current() || ''));

  /** Where the picture sits in the window, with the offsets kept inside it. */
  readonly shown = computed(() => {
    const picture = this.picture();
    if (!picture) return { width: 0, height: 0, ox: 0, oy: 0 };
    const fit = clampOffset(picture.width, picture.height, VIEW, this.zoom(), this.ox(), this.oy());
    return { width: picture.width * fit.scale, height: picture.height * fit.scale, ox: fit.ox, oy: fit.oy };
  });

  async chosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set(null);
    try {
      const picture = await this.photos.load(file);
      this.picture.set(picture);
      this.zoom.set(1);
      // Start with the middle of the picture in the window.
      const fit = clampOffset(picture.width, picture.height, VIEW, 1, 0, 0);
      this.ox.set((VIEW - picture.width * fit.scale) / 2);
      this.oy.set((VIEW - picture.height * fit.scale) / 2);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  down(event: PointerEvent): void {
    this.drag = { x: event.clientX, y: event.clientY, ox: this.shown().ox, oy: this.shown().oy };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  move(event: PointerEvent): void {
    if (!this.drag) return;
    this.ox.set(this.drag.ox + event.clientX - this.drag.x);
    this.oy.set(this.drag.oy + event.clientY - this.drag.y);
  }

  up(event: PointerEvent): void {
    this.drag = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  /** Zoom around the middle of the window, so what is in the middle stays there. */
  setZoom(value: number): void {
    const picture = this.picture();
    if (!picture || Number.isNaN(value)) return;
    const before = this.shown();
    const centerX = (VIEW / 2 - before.ox) / before.width;
    const centerY = (VIEW / 2 - before.oy) / before.height;
    this.zoom.set(value);
    const after = clampOffset(picture.width, picture.height, VIEW, value, 0, 0);
    this.ox.set(VIEW / 2 - centerX * picture.width * after.scale);
    this.oy.set(VIEW / 2 - centerY * picture.height * after.scale);
  }

  async use(): Promise<void> {
    const picture = this.picture();
    if (!picture) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const shown = this.shown();
      const blob = await this.photos.render(picture, cropFor(picture.width, picture.height, VIEW, this.zoom(), shown.ox, shown.oy));
      this.removed.set(false);
      this.preview.set(URL.createObjectURL(blob));
      this.close();
      this.photo.emit(blob);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  cancel(): void {
    this.close();
  }

  remove(): void {
    this.removed.set(true);
    this.preview.set('');
    this.photo.emit(null);
  }

  private close(): void {
    this.picture()?.release();
    this.picture.set(null);
  }
}

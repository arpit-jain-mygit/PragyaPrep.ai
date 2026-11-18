import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ApiError } from '../core/models';
import { PhotoService } from '../core/photo.service';
import { Icon } from './icon';

/** A small form to write to the platform admin, with an optional screenshot (chosen, or pasted into the message). Sent by email. */
@Component({
  selector: 'app-support-box',
  imports: [FormsModule, Icon],
  template: `
    <div class="support-backdrop" (click)="close.emit()"></div>
    <section class="card support-box" role="dialog" aria-label="Contact the platform admin" id="support-box">
      <div class="row" style="justify-content: space-between">
        <h2 style="margin: 0">Contact support</h2>
        <button class="icon-btn" type="button" title="Close" (click)="close.emit()"><app-icon name="x" /><span class="sr-only">Close</span></button>
      </div>
      @if (sent()) {
        <div class="alert ok" id="support-sent" role="status" style="margin-top: 0.8rem">Sent. The platform admin will reply to your email.</div>
        <button class="btn" type="button" (click)="close.emit()">Done</button>
      } @else {
        <p class="soft">Tell us what went wrong or what you need. Add a screenshot if it helps.</p>
        @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
        <form (ngSubmit)="send()">
          <div class="field">
            <label for="support-message">Message</label>
            <textarea id="support-message" name="message" rows="5" maxlength="2000" [(ngModel)]="message" (paste)="paste($event)"></textarea>
          </div>
          <div class="row" style="gap: 0.6rem; align-items: center">
            <label class="btn secondary small">
              <app-icon name="image" [size]="15" /> {{ picture() ? 'Change screenshot' : 'Add screenshot' }}
              <input id="support-file" type="file" accept="image/png,image/jpeg,image/webp" hidden (change)="choose($event)" />
            </label>
            @if (picture(); as chosen) {
              <span class="soft" id="support-picture">{{ chosen.name }}</span>
              <button class="icon-btn" type="button" title="Remove screenshot" (click)="picture.set(null)"><app-icon name="x" /></button>
            }
          </div>
          <div class="row" style="margin-top: 0.8rem">
            <button class="btn" type="submit" id="support-send" [disabled]="busy()"><app-icon name="mail" [size]="16" /> {{ busy() ? 'Sending…' : 'Send' }}</button>
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    .support-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.35); z-index: 40; }
    .support-box { position: fixed; z-index: 41; top: 4.5rem; left: 50%; transform: translateX(-50%); width: min(32rem, calc(100vw - 2rem)); max-height: calc(100vh - 6rem); overflow: auto; }
  `,
})
export class SupportBox {
  private readonly api = inject(ApiService);
  private readonly photos = inject(PhotoService);
  private readonly router = inject(Router);

  readonly close = output<void>();
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly picture = signal<{ name: string; data: string } | null>(null);
  message = '';

  async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.take(file);
  }

  /** An image pasted into the message becomes the screenshot. */
  paste(event: ClipboardEvent): void {
    const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    void this.take(file);
  }

  private async take(file: File): Promise<void> {
    this.error.set(null);
    try {
      this.picture.set({ name: file.name || 'screenshot', data: await this.photos.screenshotText(file) });
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async send(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const picture = this.picture();
      await this.api.sendSupport({ message: this.message, page: this.router.url, ...(picture ? { screenshot: picture.data } : {}) });
      this.sent.set(true);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }
}

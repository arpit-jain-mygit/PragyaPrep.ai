import { Component, HostListener, signal } from '@angular/core';

/**
 * Put this once on a page. Any picture with the class "qimg" (a question or option picture) opens full screen when tapped,
 * and closes on a tap, a click or Escape. Pictures are never changed or reloaded.
 */
@Component({
  selector: 'app-lightbox',
  template: `
    @if (src(); as picture) {
      <div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Picture" (click)="src.set(null)">
        <img [src]="picture" alt="The picture, larger" />
        <button type="button" class="lightbox-close" aria-label="Close picture">Close</button>
      </div>
    }
  `,
})
export class Lightbox {
  readonly src = signal<string | null>(null);

  @HostListener('document:click', ['$event'])
  clicked(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target instanceof HTMLImageElement && target.classList.contains('qimg') && target.src) this.src.set(target.src);
  }

  @HostListener('document:keydown.escape')
  escape(): void {
    this.src.set(null);
  }
}

import { Component, HostListener, inject, signal } from '@angular/core';
import { BusyService } from '../core/busy.service';

/** The IIMs, in the order they go round the ring. */
export const IIM_NAMES = [
  'Ahmedabad', 'Bangalore', 'Calcutta', 'Lucknow', 'Kozhikode', 'Indore', 'Shillong', 'Rohtak', 'Ranchi', 'Raipur', 'Tiruchirappalli',
  'Udaipur', 'Kashipur', 'Nagpur', 'Amritsar', 'Bodh Gaya', 'Sambalpur', 'Sirmaur', 'Jammu', 'Visakhapatnam', 'Mumbai',
];

/**
 * A ring of IIM names that spins next to the mouse pointer while the page waits for the server.
 * On touch screens there is no pointer, so it sits in a corner. It never takes clicks.
 */
@Component({
  selector: 'app-busy-cursor',
  template: `
    @if (busy.visible()) {
      <div class="busy-cursor" [class.at-corner]="!moved()" [style.left.px]="x()" [style.top.px]="y()" role="status" aria-live="polite">
        <span class="sr-only">Loading</span>
        <svg viewBox="0 0 100 100" width="112" height="112" aria-hidden="true">
          <defs><path id="busy-ring" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" /></defs>
          <circle cx="50" cy="50" r="46" class="busy-bg" />
          <g class="busy-spin"><text><textPath href="#busy-ring" textLength="236" lengthAdjust="spacing">{{ ring }}</textPath></text></g>
        </svg>
      </div>
    }
  `,
})
export class BusyCursor {
  protected readonly busy = inject(BusyService);
  protected readonly ring = IIM_NAMES.join(' · ') + ' · ';
  protected readonly x = signal(0);
  protected readonly y = signal(0);
  protected readonly moved = signal(false);

  @HostListener('document:pointermove', ['$event'])
  protected onMove(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    this.x.set(event.clientX + 22);
    this.y.set(event.clientY + 22);
    this.moved.set(true);
  }
}

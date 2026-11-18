import { Component, HostListener, inject, signal } from '@angular/core';
import { BusyService } from '../core/busy.service';

/** The IIMs shown as badges round the ring: short code and the colour of its badge. */
export const IIM_BADGES = [
  { code: 'IIMA', name: 'Ahmedabad', color: '#b91c1c' },
  { code: 'IIMB', name: 'Bangalore', color: '#1d4ed8' },
  { code: 'IIMC', name: 'Calcutta', color: '#047857' },
  { code: 'IIML', name: 'Lucknow', color: '#7c3aed' },
  { code: 'IIMK', name: 'Kozhikode', color: '#c2410c' },
  { code: 'IIMI', name: 'Indore', color: '#0e7490' },
  { code: 'IIMR', name: 'Ranchi', color: '#a21caf' },
  { code: 'IIMU', name: 'Udaipur', color: '#4d7c0f' },
].map((badge, i, all) => {
  const angle = (i / all.length) * 2 * Math.PI - Math.PI / 2;
  return { ...badge, x: +(50 + 36 * Math.cos(angle)).toFixed(2), y: +(50 + 36 * Math.sin(angle)).toFixed(2) };
});

/**
 * A ring of IIM badges (IIMA, IIMB, ...) that spins next to the mouse pointer while the page waits for the server.
 * On touch screens there is no pointer, so it sits in a corner. It never takes clicks.
 */
@Component({
  selector: 'app-busy-cursor',
  template: `
    @if (busy.visible()) {
      <div class="busy-cursor" [class.at-corner]="!moved()" [style.left.px]="x()" [style.top.px]="y()" role="status" aria-live="polite">
        <span class="sr-only">Loading</span>
        <svg viewBox="0 0 100 100" width="112" height="112" aria-hidden="true">
          <circle cx="50" cy="50" r="48" class="busy-bg" />
          <g class="busy-spin">
            @for (badge of badges; track badge.code) {
              <g class="busy-badge" [attr.transform]="'translate(' + badge.x + ' ' + badge.y + ')'">
                <title>{{ badge.name }}</title>
                <circle r="11" [attr.fill]="badge.color" />
                <text class="busy-label" text-anchor="middle" dy="2.3">{{ badge.code }}</text>
              </g>
            }
          </g>
        </svg>
      </div>
    }
  `,
})
export class BusyCursor {
  protected readonly busy = inject(BusyService);
  protected readonly badges = IIM_BADGES;
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

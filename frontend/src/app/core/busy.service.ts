import { Injectable, signal } from '@angular/core';

/**
 * Keeps count of the requests in flight, so the page can show a loading cursor.
 * `visible` turns on only if something is still running after `delay` ms, so quick calls never flicker.
 */
@Injectable({ providedIn: 'root' })
export class BusyService {
  /** How long a request must run before the cursor shows. Tests shorten it. */
  static delay = 300;

  private running = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly shown = signal(false);
  readonly visible = this.shown.asReadonly();

  begin(): void {
    this.running += 1;
    if (this.running === 1 && !this.shown() && this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.running > 0) this.shown.set(true);
      }, BusyService.delay);
    }
  }

  end(): void {
    this.running = Math.max(0, this.running - 1);
    if (this.running > 0) return;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.shown.set(false);
  }
}

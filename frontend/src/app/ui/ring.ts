import { Component, computed, input } from '@angular/core';

/** A small progress ring: the part done out of the total, with the percentage in the middle. Colours follow the institute's. */
@Component({
  selector: 'app-ring',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 36 36" role="img" [attr.aria-label]="label()">
      <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" stroke-opacity="0.2" stroke-width="3.5" />
      <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="97.4" [attr.stroke-dashoffset]="offset()" transform="rotate(-90 18 18)" />
      <text x="18" y="21.5" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor">{{ percent() }}%</text>
    </svg>
  `,
  styles: `:host { display: inline-flex; line-height: 0; flex: none; }`,
})
export class Ring {
  readonly done = input(0);
  readonly total = input(0);
  readonly size = input(44);

  readonly percent = computed(() => (this.total() > 0 ? Math.round((Math.min(this.done(), this.total()) / this.total()) * 100) : 0));
  readonly offset = computed(() => 97.4 * (1 - this.percent() / 100));
  readonly label = computed(() => `${this.done()} of ${this.total()} done, ${this.percent()} percent`);
}

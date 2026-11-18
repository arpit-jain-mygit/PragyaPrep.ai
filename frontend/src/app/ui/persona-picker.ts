import { Component, input, output } from '@angular/core';
import { PERSONAS, Persona } from '../core/persona';
import { Icon } from './icon';

/** Three big buttons: "I am an institute / a student / a parent". */
@Component({
  selector: 'app-persona-picker',
  imports: [Icon],
  template: `
    <div class="persona-grid" [class.compact]="compact()" role="group" aria-label="Who are you?">
      @for (p of personas; track p.id) {
        <button type="button" class="persona-btn" [class.on]="current() === p.id" [attr.aria-pressed]="current() === p.id" [attr.data-persona]="p.id" (click)="choose.emit(p.id)">
          <app-icon [name]="p.icon" [size]="compact() ? 20 : 26" />
          <strong>{{ p.label }}</strong>
          @if (!compact()) { <span class="soft">{{ p.blurb }}</span> }
        </button>
      }
    </div>
  `,
})
export class PersonaPicker {
  readonly current = input<Persona | null>(null);
  /** Small pills for the hero, without the one-line description. */
  readonly compact = input(false);
  readonly choose = output<Persona>();
  readonly personas = PERSONAS;
}

import { Component, input, output } from '@angular/core';
import { PERSONAS, Persona } from '../core/persona';
import { Icon } from './icon';

/** Three big buttons: "I am an institute / a student / a parent". */
@Component({
  selector: 'app-persona-picker',
  imports: [Icon],
  template: `
    <div class="persona-grid" role="group" aria-label="Who are you?">
      @for (p of personas; track p.id) {
        <button type="button" class="persona-btn" [class.on]="current() === p.id" [attr.aria-pressed]="current() === p.id" [attr.data-persona]="p.id" (click)="choose.emit(p.id)">
          <app-icon [name]="p.icon" [size]="26" />
          <strong>{{ p.label }}</strong>
          <span class="soft">{{ p.blurb }}</span>
        </button>
      }
    </div>
  `,
})
export class PersonaPicker {
  readonly current = input<Persona | null>(null);
  readonly choose = output<Persona>();
  readonly personas = PERSONAS;
}

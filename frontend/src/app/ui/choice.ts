import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface ChoiceOption {
  value: string;
  label: string;
}

let nextGroup = 0;

/**
 * A short list of choices (two or three, or a few more) shown as a row of tick-style buttons, instead of a dropdown.
 * Only one can be on at a time. It works with ngModel like a select, so the form code does not change:
 *   <app-choice name="kind" label="Question type" [options]="[{ value: 'mcq', label: 'Multiple choice' }]" [(ngModel)]="kind" />
 */
@Component({
  selector: 'app-choice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Choice), multi: true }],
  styles: `
    .choice-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .choice { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--border-strong, #cbd5e1); border-radius: 999px; background: var(--surface-1, #fff); color: var(--text-primary, #111827); font-size: 13px; cursor: pointer; user-select: none; }
    .choice.on { border-color: var(--text-accent, #2563eb); background: var(--bg-accent, #eff6ff); }
    .choice.off-state { opacity: 0.6; cursor: not-allowed; }
    .choice input { margin: 0; accent-color: #2563eb; }
  `,
  template: `
    <div class="choice-row" role="radiogroup" [attr.aria-label]="label()">
      @for (option of options(); track option.value) {
        <label class="choice" [class.on]="option.value === current()" [class.off-state]="disabled()">
          <input type="radio" [name]="group" [value]="option.value" [checked]="option.value === current()" [disabled]="disabled()" (change)="pick(option.value)" />
          <span>{{ option.label }}</span>
        </label>
      }
    </div>
  `,
})
export class Choice implements ControlValueAccessor {
  /** The choices, in the order they should appear. */
  readonly options = input.required<ChoiceOption[]>();
  /** A short name for screen readers, such as "Question type". */
  readonly label = input('');

  /** Keeps the radio buttons of this group separate from other groups on the same page. */
  readonly group = `choice-${nextGroup++}`;
  readonly current = signal('');
  readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.current.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  pick(value: string): void {
    this.current.set(value);
    this.onChange(value);
    this.onTouched();
  }
}

import { Component, ElementRef, OnInit, inject, input, output } from '@angular/core';
import { Icon } from './icon';

/**
 * A popup: a centred box, or a drawer that slides in from the right (side). It closes with Escape, a click outside it, or the cross.
 * Put the content inside it; use the footer slot (an element with slot="footer") for the buttons.
 */
@Component({
  selector: 'app-modal',
  host: { '(document:keydown.escape)': 'close.emit()' },
  imports: [Icon],
  template: `
    <div class="dialog-backdrop" (click)="close.emit()"></div>
    <section class="card modal" [class.side]="side()" role="dialog" aria-modal="true" [attr.aria-label]="title()" [attr.id]="boxId()">
      <header class="modal-head">
        <h2>{{ title() }}</h2>
        <button class="icon-btn" type="button" title="Close" (click)="close.emit()"><app-icon name="x" /><span class="sr-only">Close</span></button>
      </header>
      <div class="modal-body"><ng-content /></div>
      <footer class="modal-foot"><ng-content select="[slot=footer]" /></footer>
    </section>
  `,
})
export class Modal implements OnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly title = input.required<string>();
  readonly side = input(false);
  readonly boxId = input<string | null>(null);
  readonly close = output<void>();

  /** Put the keyboard inside the popup, on its first button, so Enter and Tab work from the start. */
  ngOnInit(): void {
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('.modal-body button, .modal-foot button, .modal-body input')?.focus());
  }
}

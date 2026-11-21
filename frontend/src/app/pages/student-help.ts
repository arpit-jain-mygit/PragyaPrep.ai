import { Component, signal } from '@angular/core';
import { Icon } from '../ui/icon';
import { SupportBox } from '../ui/support-box';

/**
 * Help: where a student goes when something is not working. It opens the same "Contact support" box that the
 * header has, so a message from here and one from the header reach the platform admin the same way.
 */
@Component({
  selector: 'app-student-help',
  imports: [Icon, SupportBox],
  template: `
    <div class="page-head"><h1>Help</h1></div>
    <section class="card" id="help-card">
      <h2><app-icon name="help" [size]="18" /> Need a hand?</h2>
      <p class="soft">Tell us what went wrong or what you need. Add a screenshot if it helps.</p>
      <button class="btn" type="button" id="help-contact" (click)="support.set(true)"><app-icon name="mail" [size]="16" /> Contact support</button>
    </section>
    @if (support()) { <app-support-box (close)="support.set(false)" /> }
  `,
})
export class StudentHelp {
  readonly support = signal(false);
}

import { Component, OnInit, input, signal } from '@angular/core';
import { Icon } from './icon';
import { Modal } from './modal';

interface Step { icon: string; text: string }

const STEPS: Record<string, { title: string; steps: Step[] }> = {
  tenant_admin: {
    title: 'Welcome! Three steps to get started',
    steps: [
      { icon: 'book', text: 'Add your courses under Courses, with their subjects and coursework.' },
      { icon: 'users', text: 'Add students under Registrations (one by one or from an Excel sheet), then approve them. Group them in Batches.' },
      { icon: 'clipboard', text: 'Fill the Question bank and create a Test. Tap your photo any time to edit My institute.' },
    ],
  },
  student: {
    title: 'Welcome! Here is where things are',
    steps: [
      { icon: 'home', text: 'Home shows your batch, tests and what is due.' },
      { icon: 'book', text: 'My Learning has your coursework, live classes, tests and results.' },
      { icon: 'bell', text: 'Notices brings messages from your institute. Tap your photo for your profile.' },
    ],
  },
  parent: {
    title: 'Welcome! Here is where things are',
    steps: [
      { icon: 'users', text: 'My children shows how each child is doing in each course.' },
      { icon: 'chart', text: 'Open a child to see what is overdue and where they need practice, and set a practice test.' },
      { icon: 'bell', text: 'Tap your photo to choose how you get progress summaries.' },
    ],
  },
  free: {
    title: 'Welcome! Try PragyaPrep free',
    steps: [
      { icon: 'book', text: 'Pick one course and open its free sub-topic, with its notes and files.' },
      { icon: 'clipboard', text: 'Take your one free test and see your score with the right answers.' },
      { icon: 'help', text: 'Want everything? Tap the help button to message the PragyaPrep team.' },
    ],
  },
};

/** A short one-time welcome for each kind of person, remembered on this device so it is not shown again. */
@Component({
  selector: 'app-welcome',
  imports: [Icon, Modal],
  template: `
    @if (show() && content(); as c) {
      <app-modal [title]="c.title" boxId="welcome" (close)="done()">
        <ul class="plain-list rules">
          @for (s of c.steps; track s.text) { <li><app-icon [name]="s.icon" [size]="18" /><span>{{ s.text }}</span></li> }
        </ul>
        <ng-container slot="footer"><button class="btn" type="button" id="welcome-done" (click)="done()">Got it</button></ng-container>
      </app-modal>
    }
  `,
})
export class Welcome implements OnInit {
  readonly role = input.required<string>();
  readonly tenant = input.required<string>();
  readonly email = input.required<string>();
  readonly show = signal(false);

  content(): { title: string; steps: Step[] } | undefined {
    return STEPS[this.tenant() === 'free' ? 'free' : this.role()];
  }

  private key(): string {
    return `pragyaprep.welcomed.${this.tenant()}.${this.email()}`;
  }

  ngOnInit(): void {
    if (!this.content()) return;
    try {
      this.show.set(localStorage.getItem(this.key()) === null);
    } catch {
      this.show.set(false); // storage blocked: better to skip the welcome than to show it on every visit
    }
  }

  done(): void {
    this.show.set(false);
    try {
      localStorage.setItem(this.key(), '1');
    } catch {
      /* nothing to do */
    }
  }
}

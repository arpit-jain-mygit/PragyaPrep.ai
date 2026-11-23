import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TenantService } from '../core/tenant.service';

/** The home of one Study Hub subject: Learn, Quiz and Create a test. */
@Component({
  selector: 'app-study-hub-subject',
  imports: [RouterLink],
  template: `
    <p class="crumb"><a [routerLink]="base">Study Hub</a></p>
    <h2>{{ title() }}</h2>
    <p class="sub">{{ subtitle() }}</p>

    <div class="links">
      <a class="link-tile" [routerLink]="base + '/' + subject() + '/learn'">
        <span class="icon" aria-hidden="true">📚</span>
        <strong>Learn</strong>
        <span>Simple notes from each chapter</span>
      </a>
      <a class="link-tile" [routerLink]="base + '/' + subject() + '/quiz'">
        <span class="icon" aria-hidden="true">🎯</span>
        <strong>Quiz</strong>
        <span>{{ quizNote() }}</span>
      </a>
      <a class="link-tile" [routerLink]="base + '/' + subject() + '/tests'">
        <span class="icon" aria-hidden="true">✍️</span>
        <strong>Create a test</strong>
        <span>Pick chapters and question types, then test yourself</span>
      </a>
    </div>
  `,
  styles: [`
    .crumb { color: var(--muted); font-size: 14px; margin: 0 0 6px; }
    .crumb a { color: var(--muted); }
    h2 { font-size: 26px; margin: 4px 0; }
    .sub { color: var(--muted); margin: 0 0 16px; }
    .links { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .link-tile { display: flex; flex-direction: column; gap: 4px; padding: 18px 14px; border-radius: 18px; background: var(--card); border: 1px solid var(--line); color: var(--ink); text-decoration: none; min-height: 150px; min-width: 0; }
    .link-tile:hover { border-color: var(--brand); }
    .icon { font-size: 34px; }
    .link-tile strong { font-size: 18px; }
    .link-tile span:last-child { color: var(--muted); font-size: 14px; }
    @media (max-width: 480px) { .links { grid-template-columns: 1fr; } }
  `],
})
export class StudyHubSubject {
  private readonly route = inject(ActivatedRoute);
  private readonly tenants = inject(TenantService);
  readonly base = `/${this.tenants.slug()}/learning/study-hub`;
  readonly subject = signal<string>('wm');

  constructor() {
    this.route.paramMap.subscribe((p) => this.subject.set(p.get('subject') ?? 'wm'));
  }

  title() {
    return this.subject() === 'cm' ? 'Cambridge Maths Stage 8' : 'Wren & Martin Grammar';
  }

  subtitle() {
    return 'Read the notes for a chapter, then test yourself on it.';
  }

  quizNote() {
    return this.subject() === 'cm' ? 'A quiz for every chapter' : 'Questions from the book and practice questions';
  }
}

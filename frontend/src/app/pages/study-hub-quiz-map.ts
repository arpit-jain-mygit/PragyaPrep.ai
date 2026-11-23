import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { TenantService } from '../core/tenant.service';

/** The chapters of one subject that have a quiz. Tap one to start it. */
@Component({
  selector: 'app-study-hub-quiz-map',
  imports: [RouterLink],
  template: `
    <p class="crumb"><a [routerLink]="base">Study Hub</a> &middot; {{ title() }}</p>
    <h2>🎯 Quiz</h2>
    <p class="sub">Pick a chapter and answer every question.</p>

    @if (loading()) {
      <p class="sub">Loading the chapters...</p>
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else {
      <div class="list">
        @for (ch of chapters(); track ch.chapter) {
          <a class="row" [routerLink]="base + '/' + subject() + '/quiz/' + ch.chapter">
            <span class="num">Ch {{ ch.chapter }}</span>
            <span class="title">{{ ch.title }}</span>
            <span class="count">{{ ch.count }} questions</span>
          </a>
        }
      </div>
    }
  `,
  styles: [`
    .crumb { color: var(--muted); font-size: 14px; margin: 0 0 6px; }
    .crumb a { color: var(--muted); }
    h2 { font-size: 26px; margin: 4px 0; }
    .sub { color: var(--muted); margin: 0 0 16px; }
    .list { display: grid; gap: 8px; }
    .row { display: grid; grid-template-columns: 56px 1fr auto; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 16px; background: var(--card); border: 1px solid var(--line); color: var(--ink); text-decoration: none; min-height: 52px; min-width: 0; }
    .row:hover { border-color: var(--brand); }
    .num { font-size: 13px; color: var(--brand); font-weight: 700; }
    .title { font-weight: 600; overflow-wrap: anywhere; }
    .count { color: var(--muted); font-size: 14px; white-space: nowrap; }
    .error { color: var(--danger); }
  `],
})
export class StudyHubQuizMap {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly tenants = inject(TenantService);
  readonly base = `/${this.tenants.slug()}/learning/study-hub`;
  readonly subject = signal<string>('wm');
  readonly chapters = signal<{ chapter: number; title: string; count: number }[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    this.route.paramMap.subscribe((p) => {
      this.subject.set(p.get('subject') ?? 'wm');
      this.load();
    });
  }

  title() {
    return this.subject() === 'cm' ? 'Cambridge Maths Stage 8' : 'Wren & Martin Grammar';
  }

  private async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      if (this.subject() === 'cm') {
        const { chapters } = await this.api.hubCmChapters();
        this.chapters.set(chapters.map((c) => ({ chapter: c.chapter, title: c.title, count: c.questions })));
      } else {
        this.chapters.set((await this.api.hubWmChapters()).chapters);
      }
    } catch {
      this.error.set('Could not load the quiz. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}

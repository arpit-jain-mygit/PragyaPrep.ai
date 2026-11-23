import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { TenantService } from '../core/tenant.service';

/** Study Hub Learn: the chapters of one subject, to tap and read. */
@Component({
  selector: 'app-study-hub-learn-list',
  imports: [RouterLink],
  template: `
    <p class="crumb"><a [routerLink]="base">Study Hub</a> &middot; {{ title() }}</p>
    <h2>📚 Learn</h2>
    <p class="sub">Short notes for every chapter, in simple words. Tap a chapter to read it.</p>

    @if (loading()) {
      <p class="sub">Opening the book...</p>
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else {
      <div class="grid">
        @for (c of chapters(); track c.chapter) {
          <a class="tile" [routerLink]="base + '/' + subject() + '/learn/' + c.chapter">
            <span class="num">Chapter {{ c.chapter }}</span>
            <span class="title">{{ c.title }}</span>
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
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
    .tile { display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: 16px; background: var(--card); border: 1px solid var(--line); color: var(--ink); text-decoration: none; min-height: 100px; min-width: 0; }
    .tile:hover { border-color: var(--brand); }
    .num { font-size: 12px; color: var(--brand); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .title { font-weight: 600; overflow-wrap: anywhere; }
    .error { color: var(--danger); }
  `],
})
export class StudyHubLearnList {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly tenants = inject(TenantService);
  readonly base = `/${this.tenants.slug()}/learning/study-hub`;
  readonly subject = signal<string>('wm');
  readonly chapters = signal<{ chapter: number; title: string }[]>([]);
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
        this.chapters.set((await this.api.hubCmChapters()).chapters);
      } else {
        this.chapters.set((await this.api.hubWmNotes()).notes);
      }
    } catch {
      this.error.set('Could not load the chapter notes. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}

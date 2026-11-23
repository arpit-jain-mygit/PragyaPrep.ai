import { Component, OnInit, inject, signal } from '@angular/core';
import { TenantService } from '../core/tenant.service';
import { learnBase } from './base';
import { RouterLink } from '@angular/router';
import { StudyHubApi } from './api';
import { CmChapter } from './models';

// Cambridge Stage 8: the list of chapters to read.
@Component({
  selector: 'app-cm-learn-list',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>📚 Learn</h1>
    <p class="sub">Short notes for every chapter, in simple words. Tap a chapter to read it.</p>

    @if (loading()) {
      <p class="sub">Opening the book...</p>
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else {
      <div class="grid">
        @for (c of chapters(); track c.chapter) {
          <a class="tile" [routerLink]="[hub + '/cambridge/learn', c.chapter]">
            <span class="num">Chapter {{ c.chapter }}</span>
            <span class="title">{{ c.title }}</span>
          </a>
        }
      </div>
    }
  `,
  styles: [`
    h1 { font-family: var(--display); font-size: 30px; margin: 8px 0 4px; }
    .sub { color: var(--muted); margin: 0 0 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
    .tile { display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); color: var(--fg); text-decoration: none; min-height: 100px; min-width: 0; }
    .tile:hover { border-color: var(--accent); }
    .num { font-size: 12px; color: var(--accent); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .title { font-weight: 600; overflow-wrap: anywhere; }
    .error { color: var(--retry); }
  `],
})
export class CmLearnListPage implements OnInit {
  readonly learn = learnBase(inject(TenantService));
  readonly hub = this.learn + '/study-hub';
  private api = inject(StudyHubApi);
  chapters = signal<CmChapter[]>([]);
  loading = signal(true);
  error = signal('');

  ngOnInit() {
    this.api.cmChapters().subscribe({
      next: (res) => {
        this.chapters.set(res.chapters);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load the chapters. Please try again.');
        this.loading.set(false);
      },
    });
  }
}

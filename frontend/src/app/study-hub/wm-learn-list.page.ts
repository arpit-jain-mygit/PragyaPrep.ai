import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TenantService } from '../core/tenant.service';
import { learnBase } from './base';
import { RouterLink } from '@angular/router';
import { WmNote } from './models';

@Component({
  selector: 'app-wm-learn-list',
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
        @for (n of notes(); track n.chapter) {
          <a class="tile" [routerLink]="[hub + '/wren-martin/learn', n.chapter]">
            <span class="num">Chapter {{ n.chapter }}</span>
            <span class="title">{{ n.title }}</span>
          </a>
        }
      </div>
    }
  `,
  styles: [`
    h1 { font-family: var(--display); font-size: 30px; margin: 8px 0 4px; }
    .sub { color: var(--muted); margin: 0 0 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
    .tile { display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); color: var(--fg); text-decoration: none; min-height: 100px; }
    .tile:hover { border-color: var(--accent); }
    .num { font-size: 12px; color: var(--accent); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .title { font-weight: 600; }
    .error { color: var(--retry); }
  `],
})
export class WmLearnListPage implements OnInit {
  readonly learn = learnBase(inject(TenantService));
  readonly hub = this.learn + '/study-hub';
  private http = inject(HttpClient);
  notes = signal<WmNote[]>([]);
  loading = signal(true);
  error = signal('');

  ngOnInit() {
    this.http.get<WmNote[]>('/data/wren-martin-notes.json').subscribe({
      next: (notes) => {
        this.notes.set(notes);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load the chapter notes. Please try again.');
        this.loading.set(false);
      },
    });
  }
}

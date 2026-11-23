import { Component, OnChanges, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TenantService } from '../core/tenant.service';
import { learnBase } from './base';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { StudyHubApi } from './api';
import { WmNote } from './models';

@Component({
  selector: 'app-wm-learn-chapter',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (note(); as n) {
      <p class="crumb"><a [routerLink]="hub + '/wren-martin/learn'">📚 Learn</a> &middot; Chapter {{ n.chapter }} of {{ total() }}</p>
      <h1>{{ n.title }}</h1>
      <p class="summary">{{ n.summary }}</p>

      <h2>Key points</h2>
      <ul>
        @for (p of n.points; track p) {
          <li>{{ p }}</li>
        }
      </ul>

      <h2>Examples</h2>
      <ul class="examples">
        @for (e of n.examples; track e) {
          <li>{{ e }}</li>
        }
      </ul>

      <p class="tip"><strong>Remember:</strong> {{ n.tip }}</p>

      @if (hasQuiz()) {
        <a class="btn block" [routerLink]="[hub + '/wren-martin/quiz', n.chapter]">🎯 Practise chapter {{ n.chapter }} quiz</a>
      }

      <nav class="pager" aria-label="Chapters">
        @if (n.chapter > 1) {
          <a [routerLink]="[hub + '/wren-martin/learn', n.chapter - 1]">&larr; Chapter {{ n.chapter - 1 }}</a>
        } @else {
          <span></span>
        }
        @if (n.chapter < total()) {
          <a [routerLink]="[hub + '/wren-martin/learn', n.chapter + 1]">Chapter {{ n.chapter + 1 }} &rarr;</a>
        }
      </nav>
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else {
      <p class="sub">Opening the chapter...</p>
    }
  `,
  styles: [`
    .crumb, .sub { color: var(--muted); font-size: 15px; }
    .crumb a { color: var(--muted); }
    h1 { font-family: var(--display); font-size: 30px; margin: 6px 0 8px; }
    h2 { font-family: var(--display); font-size: 21px; margin: 22px 0 6px; }
    .summary { font-size: 18px; margin: 0; }
    ul { padding-left: 20px; margin: 0; display: grid; gap: 8px; }
    .examples li { color: var(--fg); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 15px; }
    .tip { margin-top: 20px; padding: 14px 16px; border-radius: 14px; background: var(--tile); }
    .btn { margin-top: 18px; }
    .pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
    .error { color: var(--retry); }
  `],
})
export class WmLearnChapterPage implements OnChanges {
  readonly learn = learnBase(inject(TenantService));
  readonly hub = this.learn + '/study-hub';
  chapter = '';
  private http = inject(HttpClient);
  private api = inject(StudyHubApi);
  note = signal<WmNote | null>(null);
  total = signal(0);
  hasQuiz = signal(false);
  error = signal('');

  constructor() {
    // The chapter number is in the address. Read it when the page opens, and again when it changes.
    inject(ActivatedRoute).paramMap.subscribe((p) => {
      this.chapter = p.get('chapter') ?? '';
      this.ngOnChanges();
    });
  }

  ngOnChanges() {
    const number = Number(this.chapter);
    forkJoin({
      notes: this.http.get<WmNote[]>('/data/wren-martin-notes.json'),
      chapters: this.api.wmChapters(),
    }).subscribe({
      next: ({ notes, chapters }) => {
        this.total.set(notes.length);
        const found = notes.find((n) => n.chapter === number) ?? null;
        this.note.set(found);
        this.hasQuiz.set(chapters.chapters.some((c) => c.chapter === number));
        if (!found) this.error.set('That chapter is not in the book notes.');
      },
      error: () => this.error.set('Could not load this chapter. Please try again.'),
    });
  }
}

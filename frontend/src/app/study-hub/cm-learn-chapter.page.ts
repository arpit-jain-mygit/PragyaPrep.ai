import { Component, OnChanges, inject, signal } from '@angular/core';
import { TenantService } from '../core/tenant.service';
import { learnBase } from './base';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StudyHubApi } from './api';
import { CmNote } from './models';

// Cambridge Stage 8: one chapter's notes, with links to the chapter quiz and the next chapter.
@Component({
  selector: 'app-cm-learn-chapter',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (note(); as n) {
      <p class="crumb"><a [routerLink]="hub + '/cambridge/learn'">📚 Learn</a> &middot; Chapter {{ n.chapter }} of {{ total() }}</p>
      <h1>{{ n.title }}</h1>

      @for (s of n.notes; track s.heading) {
        <h2>{{ s.heading }}</h2>
        @for (p of s.paragraphs; track p) {
          <p class="para">{{ p }}</p>
        }
      }

      @if (n.questions > 0) {
        <a class="btn" [routerLink]="[hub + '/cambridge/quiz', n.chapter]">🎯 Practise chapter {{ n.chapter }} quiz</a>
      }

      <nav class="pager" aria-label="Chapters">
        @if (n.chapter > 1) {
          <a [routerLink]="[hub + '/cambridge/learn', n.chapter - 1]">&larr; Chapter {{ n.chapter - 1 }}</a>
        } @else {
          <span></span>
        }
        @if (n.chapter < total()) {
          <a [routerLink]="[hub + '/cambridge/learn', n.chapter + 1]">Chapter {{ n.chapter + 1 }} &rarr;</a>
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
    h1 { font-family: var(--display); font-size: 30px; margin: 6px 0 8px; overflow-wrap: anywhere; }
    h2 { font-family: var(--display); font-size: 20px; margin: 22px 0 6px; }
    .para { margin: 0 0 10px; line-height: 1.55; overflow-wrap: anywhere; }
    .btn { display: block; text-align: center; margin-top: 18px; padding: 12px 16px; border-radius: 14px; background: var(--accent); color: #fff; font-weight: 700; text-decoration: none; min-height: 46px; }
    .pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
    .error { color: var(--retry); }
  `],
})
export class CmLearnChapterPage implements OnChanges {
  readonly learn = learnBase(inject(TenantService));
  readonly hub = this.learn + '/study-hub';
  chapter = '';
  private api = inject(StudyHubApi);
  note = signal<CmNote | null>(null);
  total = signal(25);
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
    this.error.set('');
    this.api.cmChapter(number).subscribe({
      next: (n) => this.note.set(n),
      error: () => this.error.set('That chapter could not be loaded. Please try again.'),
    });
  }
}

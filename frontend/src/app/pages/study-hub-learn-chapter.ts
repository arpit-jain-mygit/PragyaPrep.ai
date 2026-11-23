import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { HubCmNote, HubWmNote } from '../core/models';
import { TenantService } from '../core/tenant.service';

/** One chapter's notes, for Wren & Martin or Cambridge Maths, with links to its quiz and the next chapter. */
@Component({
  selector: 'app-study-hub-learn-chapter',
  imports: [RouterLink],
  template: `
    <p class="crumb"><a [routerLink]="base + '/' + subject() + '/learn'">📚 Learn</a> &middot; Chapter {{ chapter() }} of {{ total() }}</p>

    @if (wm(); as n) {
      <h2>{{ n.title }}</h2>
      <p class="summary">{{ n.summary }}</p>

      <h3>Key points</h3>
      <ul>
        @for (p of n.points; track p) {
          <li>{{ p }}</li>
        }
      </ul>

      <h3>Examples</h3>
      <ul class="examples">
        @for (e of n.examples; track e) {
          <li>{{ e }}</li>
        }
      </ul>

      <p class="tip"><strong>Remember:</strong> {{ n.tip }}</p>
    }

    @if (cm(); as n) {
      <h2>{{ n.title }}</h2>
      @for (s of n.notes; track s.heading) {
        <h3>{{ s.heading }}</h3>
        @for (p of s.paragraphs; track p) {
          <p class="para">{{ p }}</p>
        }
      }
    }

    @if (note()) {
      <a class="btn" [routerLink]="base + '/' + subject() + '/quiz/' + chapter()">🎯 Practise chapter {{ chapter() }} quiz</a>
    }

    @if (note()) {
      <nav class="pager" aria-label="Chapters">
        @if (chapter() > 1) {
          <a [routerLink]="base + '/' + subject() + '/learn/' + (chapter() - 1)">&larr; Chapter {{ chapter() - 1 }}</a>
        } @else {
          <span></span>
        }
        @if (chapter() < total()) {
          <a [routerLink]="base + '/' + subject() + '/learn/' + (chapter() + 1)">Chapter {{ chapter() + 1 }} &rarr;</a>
        }
      </nav>
    }

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else if (!note()) {
      <p class="sub">Opening the chapter...</p>
    }
  `,
  styles: [`
    .crumb, .sub { color: var(--muted); font-size: 15px; }
    .crumb a { color: var(--muted); }
    h2 { font-size: 26px; margin: 6px 0 8px; overflow-wrap: anywhere; }
    h3 { font-size: 19px; margin: 22px 0 6px; }
    .summary { font-size: 17px; margin: 0; }
    .para { margin: 0 0 10px; line-height: 1.55; overflow-wrap: anywhere; }
    ul { padding-left: 20px; margin: 0; display: grid; gap: 8px; }
    .examples li { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 15px; overflow-wrap: anywhere; }
    .tip { margin-top: 20px; padding: 14px 16px; border-radius: 14px; background: var(--card); border: 1px solid var(--line); }
    .btn { display: block; text-align: center; margin-top: 18px; padding: 12px 16px; border-radius: 14px; background: var(--brand); color: var(--brand-text); font-weight: 700; text-decoration: none; min-height: 46px; }
    .pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
    .error { color: var(--danger); }
  `],
})
export class StudyHubLearnChapter {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly tenants = inject(TenantService);
  readonly base = `/${this.tenants.slug()}/learning/study-hub`;
  readonly subject = signal<string>('wm');
  readonly chapter = signal(1);
  readonly total = signal(0);
  readonly wm = signal<HubWmNote | null>(null);
  readonly cm = signal<HubCmNote | null>(null);
  readonly note = signal(false);
  readonly error = signal('');

  constructor() {
    this.route.paramMap.subscribe((p) => {
      this.subject.set(p.get('subject') ?? 'wm');
      this.chapter.set(Number(p.get('chapter')));
      this.load();
    });
  }

  private async load() {
    this.error.set('');
    this.note.set(false);
    this.wm.set(null);
    this.cm.set(null);
    try {
      if (this.subject() === 'cm') {
        const [note, chapters] = await Promise.all([this.api.hubCmChapter(this.chapter()), this.api.hubCmChapters()]);
        this.cm.set(note);
        this.total.set(chapters.chapters.length);
      } else {
        const { notes } = await this.api.hubWmNotes();
        this.total.set(notes.length);
        const found = notes.find((n) => n.chapter === this.chapter()) ?? null;
        if (!found) {
          this.error.set('That chapter is not in the book notes.');
          return;
        }
        this.wm.set(found);
      }
      this.note.set(true);
    } catch {
      this.error.set('Could not load this chapter. Please try again.');
    }
  }
}

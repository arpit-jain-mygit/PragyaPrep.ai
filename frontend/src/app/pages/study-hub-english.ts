import { Component, computed, inject, signal } from '@angular/core';
import { TenantService } from '../core/tenant.service';

// Cambridge Stage 8 English: unofficial practice papers, in sets of six. Each paper has an exam paper,
// a mark scheme and a student copy, all PDFs. The newest set is listed first.
// NOTE: the PDF files are not in the repository yet. Until they are uploaded to the site under /papers/, the links show a missing page.
interface EnglishPaper {
  number: number;
  title: string;
  file: string; // the exam paper file name, without the document type
}

interface EnglishSet {
  label: string;
  date: string; // the date and version part of each file name
  papers: EnglishPaper[];
}

const BASE = '/papers/cambridge-stage8-english/';

const PAPER_FILES: { number: number; title: string; file: string }[] = [
  { number: 1, title: 'Non-fiction: recount', file: 'Paper_1_Nonfiction' },
  { number: 2, title: 'Fiction: story', file: 'Paper_2_Fiction' },
  { number: 3, title: 'Explanatory: two texts', file: 'Paper_3_Explanatory' },
  { number: 4, title: 'Persuasive: opinion article', file: 'Paper_4_Persuasive' },
  { number: 5, title: 'Drama: playscript', file: 'Paper_5_Drama' },
  { number: 6, title: 'Poetry: two poems', file: 'Paper_6_Poetry' },
];

const SETS: EnglishSet[] = [
  { label: 'Set 7 (23 Nov 2026, 17:00)', date: '2026-11-23_1700_v1_Stage8', papers: PAPER_FILES },
  { label: 'Set 6 (23 Nov 2026, 16:00)', date: '2026-11-23_1600_v1_Stage8', papers: PAPER_FILES },
  { label: 'Set 5 (23 Nov 2026, 15:00)', date: '2026-11-23_1500_v1_Stage8', papers: PAPER_FILES },
  { label: 'Set 4 (23 Nov 2026, 14:00)', date: '2026-11-23_1400_v1_Stage8', papers: PAPER_FILES },
  { label: 'Set 3 (23 Nov 2026, 13:00)', date: '2026-11-23_1300_v1_Stage8', papers: PAPER_FILES },
  {
    label: 'Set 2 (23 Nov 2026)',
    date: '2026-11-23_1200_v1_Stage8',
    papers: [
      { number: 1, title: 'Non-fiction: memoir', file: 'Paper_1_Nonfiction' },
      { number: 2, title: 'Fiction: adventure story', file: 'Paper_2_Fiction' },
      { number: 3, title: 'Explanatory: two texts', file: 'Paper_3_Explanatory' },
      { number: 4, title: 'Persuasive: opinion article', file: 'Paper_4_Persuasive' },
      { number: 5, title: 'Drama: playscript', file: 'Paper_5_Drama' },
      { number: 6, title: 'Poetry: two poems', file: 'Paper_6_Poetry' },
    ],
  },
  {
    label: 'Set 1 (14 Oct 2026)',
    date: '2026-10-14_1340_v2_Stage8',
    papers: [
      { number: 1, title: 'Non-fiction: memoir', file: 'Paper_1_Nonfiction' },
      { number: 2, title: 'Fiction: comic-gothic story', file: 'Paper_2_Fiction' },
      { number: 3, title: 'Explanatory: two texts', file: 'Paper_3_Explanatory' },
      { number: 4, title: 'Persuasive: opinion writing', file: 'Paper_4_Persuasive' },
      { number: 5, title: 'Drama: playscript about conflict', file: 'Paper_5_Drama' },
      { number: 6, title: 'Poetry: two poems on growing up', file: 'Paper_6_Poetry' },
    ],
  },
];

@Component({
  selector: 'app-study-hub-english',
  imports: [],
  template: `
    <p class="crumb"><a [href]="'/' + tenants.slug() + '/learning/study-hub'">Study Hub</a> &middot; Cambridge English</p>
    <h2>📝 English Stage 8</h2>
    <p class="sub">Unofficial practice papers in the Cambridge style. Pick a set, then open the paper, the mark scheme or the student copy.</p>

    <div class="sets" role="radiogroup" aria-label="Paper set">
      @for (s of sets; track s.date; let i = $index) {
        <button type="button" class="pill" role="radio" [attr.aria-checked]="setIndex() === i"
                [class.on]="setIndex() === i" (click)="setIndex.set(i)">{{ s.label }}</button>
      }
    </div>

    @for (p of current().papers; track p.number) {
      <section class="paper">
        <h3>Paper {{ p.number }}: {{ p.title }}</h3>
        <div class="links">
          <a [href]="url(p.file)" target="_blank" rel="noopener">📄 Exam paper</a>
          <a [href]="url(p.number, 'Mark_Scheme')" target="_blank" rel="noopener">✅ Mark scheme</a>
          <a [href]="url(p.number, 'Student_Copy')" target="_blank" rel="noopener">✏️ Student copy</a>
        </div>
      </section>
    }
  `,
  styles: [`
    .crumb { color: var(--muted); font-size: 14px; margin: 0 0 6px; }
    .crumb a { color: var(--muted); }
    h2 { font-size: 26px; margin: 4px 0; }
    .sub { color: var(--muted); margin: 0 0 16px; }
    .sets { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .pill { padding: 8px 16px; border-radius: 999px; border: 1px solid var(--line); background: var(--page); color: var(--ink); min-height: 44px; font: inherit; }
    .pill.on { border-color: var(--brand); background: var(--brand); color: var(--brand-text); }
    .paper { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; margin-bottom: 12px; min-width: 0; }
    h3 { font-size: 17px; margin: 0 0 10px; overflow-wrap: anywhere; }
    .links { display: flex; gap: 8px; flex-wrap: wrap; }
    .links a { padding: 10px 14px; border-radius: 12px; border: 1px solid var(--line); color: var(--ink); text-decoration: none; min-height: 44px; display: inline-flex; align-items: center; }
    .links a:hover { border-color: var(--brand); }
  `],
})
export class StudyHubEnglish {
  private readonly tenants = inject(TenantService);
  readonly sets = SETS;
  readonly setIndex = signal(0);
  readonly current = computed(() => SETS[this.setIndex()]);

  // Exam paper: "Paper_1_Nonfiction_<date>.pdf". Mark scheme and student copy use the same pattern with a different type word.
  url(p: string | number, type?: string): string {
    const date = this.current().date;
    if (typeof p === 'string') return `${BASE}${p}_${date}.pdf`;
    return `${BASE}Paper_${p}_${type}_${date}.pdf`;
  }
}

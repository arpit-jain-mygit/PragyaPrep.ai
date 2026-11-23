import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TenantService } from '../core/tenant.service';

/** Study Hub: the study areas a student can open from My Learning. */
@Component({
  selector: 'app-study-hub-home',
  imports: [RouterLink],
  template: `
    <section class="hero">
      <h2>Study Hub</h2>
      <p>Pick what you want to study today.</p>
    </section>

    <section class="choices">
      <a class="big wm" [routerLink]="base + '/wm'">
        <span class="emoji" aria-hidden="true">📖</span>
        <strong>Wren &amp; Martin Grammar</strong>
        <span>Simple notes for every chapter, and grammar quizzes from the book.</span>
      </a>
      <a class="big cm" [routerLink]="base + '/cm'">
        <span class="emoji" aria-hidden="true">📐</span>
        <strong>Cambridge Maths Stage 8</strong>
        <span>Notes for all 25 chapters, a quiz for each chapter, and tests you build yourself.</span>
      </a>
      <a class="big en" [routerLink]="base + '/english'">
        <span class="emoji" aria-hidden="true">📝</span>
        <strong>Cambridge English Stage 8</strong>
        <span>Practice papers in the Cambridge style, each with a mark scheme and a student copy.</span>
      </a>
    </section>
  `,
  styles: [`
    .hero { text-align: center; padding-top: 8px; }
    .hero h2 { font-size: 28px; margin: 4px 0; }
    .hero p { color: var(--muted); margin: 0; }
    .choices { display: grid; grid-template-columns: 1fr; gap: 14px; margin: 24px 0; }
    @media (min-width: 640px) { .choices { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); } }
    .big { display: flex; flex-direction: column; gap: 6px; padding: 24px 20px; border-radius: 22px; text-decoration: none; color: var(--ink); border: 2px solid var(--line); background: var(--card); min-height: 170px; min-width: 0; }
    .big strong { font-size: 20px; }
    .big span:last-child { color: var(--muted); }
    .big.wm { border-color: var(--brand); }
    .big.cm { border-color: var(--brand); }
    .big.en { border-color: var(--ok); }
    .big:hover { filter: brightness(0.98); }
    .emoji { font-size: 40px; }
  `],
})
export class StudyHubHome {
  private readonly tenants = inject(TenantService);
  readonly base = `/${this.tenants.slug()}/learning/study-hub`;
}

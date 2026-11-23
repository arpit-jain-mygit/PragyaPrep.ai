import { Component, inject } from '@angular/core';
import { TenantService } from '../core/tenant.service';
import { learnBase } from './base';
import { RouterLink } from '@angular/router';
import { PlayerService } from './player';

// Wren & Martin home: four links, like the Word Wizard home (Learn, Quiz, Shop, Board).
@Component({
  selector: 'app-wm-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>📖 Wren &amp; Martin Grammar</h1>
    <p class="sub">Read the notes for a chapter, then test yourself on it.</p>

    <div class="links">
      <a class="link-tile" [routerLink]="hub + '/wren-martin/learn'">
        <span class="icon" aria-hidden="true">📚</span>
        <strong>Learn</strong>
        <span>Simple notes from each chapter</span>
      </a>
      <a class="link-tile" [routerLink]="hub + '/wren-martin/quiz'">
        <span class="icon" aria-hidden="true">🎯</span>
        <strong>Quiz</strong>
        <span>Questions from the book and practice questions</span>
      </a>
      <a class="link-tile" [routerLink]="hub + '/wren-martin/tests'">
        <span class="icon" aria-hidden="true">✍️</span>
        <strong>Create a test</strong>
        <span>Pick chapters and question types, then test yourself</span>
      </a>
      <a class="link-tile" [routerLink]="hub + '/wren-martin/shop'">
        <span class="icon" aria-hidden="true">🛍️</span>
        <strong>Shop</strong>
        <span>Spend candies on your wizard's look</span>
      </a>
      <a class="link-tile" [routerLink]="hub + '/wren-martin/board'">
        <span class="icon" aria-hidden="true">🏆</span>
        <strong>Board</strong>
        <span>See who has the most points</span>
      </a>
    </div>

    @if (!player.profile() && !player.savedCode()) {
      <p class="hint">Quiz, Shop and Board need a wizard. Start one on <a [routerLink]="learn + '/vocabulary'">Word Wizard</a> first.</p>
    }
  `,
  styles: [`
    h1 { font-family: var(--display); font-size: 30px; margin: 8px 0 4px; }
    .sub, .hint { color: var(--muted); margin: 0 0 16px; }
    .links { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .link-tile { display: flex; flex-direction: column; gap: 4px; padding: 18px 14px; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); color: var(--fg); text-decoration: none; min-height: 150px; }
    .link-tile:hover { border-color: var(--accent); }
    .icon { font-size: 34px; }
    .link-tile strong { font-family: var(--display); font-size: 22px; }
    .link-tile span:last-child { color: var(--muted); font-size: 14px; }
  `],
})
export class WmHomePage {
  readonly learn = learnBase(inject(TenantService));
  readonly hub = this.learn + '/study-hub';
  player = inject(PlayerService);
}

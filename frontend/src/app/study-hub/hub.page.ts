import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TenantService } from '../core/tenant.service';
import { learnBase } from './base';
import { StudyHubApi } from './api';
import { AvatarComponent } from './avatar';
import { PlayerService } from './player';

// Study Hub home: four tiles, one wizard code for all of them.
// A wizard is started elsewhere; this page only greets a wizard already on this device.
@Component({
  selector: 'app-study-hub-home',
  standalone: true,
  imports: [RouterLink, AvatarComponent],
  template: `
    @if (player.profile(); as p) {
      <section class="hero">
        <app-avatar [equipped]="p.equipped" [catalog]="emojiById()" [size]="120"></app-avatar>
        <h1>Hi, {{ p.name }}!</h1>
        <p>Your wizard code: <strong class="code">{{ p.code }}</strong></p>
        <p class="hint">Write this code down. Use it to come back to your spells on any device.</p>
      </section>
    } @else {
      <section class="hero">
        <div class="sparkle" aria-hidden="true">✨</div>
        <h1>Study Hub</h1>
        <p>Pick what you want to study today. Your wizard code works in all of them.</p>
      </section>
    }

    <section class="choices">
      <a class="big ww" [routerLink]="learn + '/vocabulary'">
        <span class="emoji" aria-hidden="true">🧙</span>
        <strong>Word Wizard</strong>
        <span>Learn root words, then cast them in a quiz to earn points and candies.</span>
      </a>
      <a class="big wm" [routerLink]="hub + '/wren-martin'">
        <span class="emoji" aria-hidden="true">📖</span>
        <strong>Wren &amp; Martin Grammar</strong>
        <span>Simple notes for every chapter, and grammar quizzes from the book.</span>
      </a>
      <a class="big cm" [routerLink]="hub + '/cambridge'">
        <span class="emoji" aria-hidden="true">📐</span>
        <strong>Cambridge Maths Stage 8</strong>
        <span>Notes for all 25 chapters, a quiz for each chapter, and tests you build yourself.</span>
      </a>
      <a class="big en" [routerLink]="hub + '/cambridge/english'">
        <span class="emoji" aria-hidden="true">📝</span>
        <strong>Cambridge English Stage 8</strong>
        <span>Practice papers in the Cambridge style, each with a mark scheme and a student copy.</span>
      </a>
    </section>

    @if (player.profile(); as p) {
      <p class="center"><a [routerLink]="hub + '/board'">🏆 See the leaderboard</a></p>
      <p class="center small"><button class="link" (click)="switchPlayer()">Play as someone else</button></p>
    }
  `,
  styles: [`
    .hero { text-align: center; padding-top: 12px; }
    .sparkle { font-size: 64px; line-height: 1; }
    h1 { font-family: var(--display); font-size: 40px; margin: 8px 0 4px; }
    .hero p { color: var(--muted); margin: 0; }
    .code { font-family: var(--display); letter-spacing: 0.15em; font-size: 22px; color: var(--accent); }
    .hint, .small { color: var(--muted); font-size: 15px; }
    .choices { display: grid; grid-template-columns: 1fr; gap: 14px; margin: 24px 0; }
    @media (min-width: 640px) { .choices { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); } }
    .big { display: flex; flex-direction: column; gap: 6px; padding: 26px 22px; border-radius: 22px; text-decoration: none; color: var(--fg); border: 2px solid var(--line); background: var(--surface); min-height: 180px; }
    .big strong { font-family: var(--display); font-size: 26px; }
    .big span:last-child { color: var(--muted); }
    .big.ww { border-color: var(--accent); }
    .big.wm { border-color: var(--correct); }
    .big.cm { border-color: var(--accent); }
    .big.en { border-color: var(--correct); }
    .big:hover { filter: brightness(0.98); }
    .emoji { font-size: 44px; }
    .center { text-align: center; }
    .form { max-width: 420px; margin: 24px auto 0; display: flex; flex-direction: column; gap: 10px; }
    .form label { font-weight: 600; }
    .form input { min-height: 52px; padding: 12px 14px; font: inherit; font-size: 17px; border-radius: 14px; border: 2px solid var(--line); background: var(--bg); color: var(--fg); }
    .row { display: flex; gap: 8px; }
    .row input { flex: 1; min-width: 0; }
    hr { border: 0; border-top: 1px solid var(--line); margin: 8px 0; }
    .error { color: var(--retry); margin: 0; }
    .link { background: none; border: 0; color: var(--accent); font: inherit; cursor: pointer; text-decoration: underline; min-height: 44px; }
  `],
})
export class HubPage implements OnInit {
  player = inject(PlayerService);
  private api = inject(StudyHubApi);
  // Addresses inside this institute: the vocabulary tab and the Study Hub.
  readonly learn = learnBase(inject(TenantService));
  readonly hub = this.learn + '/study-hub';
  emojiById = signal<Record<string, string>>({});

  ngOnInit() {
    this.api.shop().subscribe({
      next: (r) => this.emojiById.set(Object.fromEntries(r.items.map((i) => [i.id, i.emoji]))),
    });
    const saved = this.player.savedCode();
    if (saved && !this.player.profile()) {
      this.player.resume(saved).subscribe({ error: () => this.player.forget() });
    }
  }

  switchPlayer() {
    this.player.forget();
  }
}

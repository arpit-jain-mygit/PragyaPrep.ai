import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PITCH, Persona, TIERS, loadPersona, savePersona } from '../core/persona';
import { GlimpseDialog } from '../ui/glimpse-dialog';
import { Icon } from '../ui/icon';
import { PersonaPicker } from '../ui/persona-picker';
import { PublicBar } from '../ui/public-bar';

/**
 * The home page for anyone who has not signed in. A short pitch, three questions-free buttons (institute, student, parent),
 * a peek inside the courses, and the three plans with their best perks.
 */
@Component({
  selector: 'app-landing',
  imports: [RouterLink, Icon, PersonaPicker, PublicBar, GlimpseDialog],
  template: `
    <app-public-bar />
    <section class="hero-band">
      <div class="hero-inner">
        <h1>Crack your exam. <span>Together.</span></h1>
        <p>Courses, live classes and tests for institutes, students and parents.</p>
        <p class="hero-q">I am…</p>
        <app-persona-picker [compact]="true" [current]="persona()" (choose)="pick($event)" />
        @if (pitch(); as p) {
          <p class="hero-line" id="pitch" [attr.data-persona]="persona()">{{ p.line }}</p>
          <p class="chips-row" id="pitch-chips">@for (c of p.chips; track c) { <span class="hero-chip">{{ c }}</span> }</p>
        }
        <button class="btn light" type="button" id="peek" (click)="peek.set(true)"><app-icon name="eye" [size]="16" /> Peek inside the courses</button>
      </div>
    </section>

    <main class="page">
      <h2 class="center">Pick your plan</h2>
      <div class="tier-grid" id="tiers">
        @for (tier of tiers; track tier.id) {
          <article class="card tier" [class.suits]="pitch()?.tier === tier.id" [attr.data-tier]="tier.id">
            <div class="row"><span class="chip approved">{{ tier.tag }}</span>@if (pitch()?.tier === tier.id) { <span class="chip pending" id="suggested">For you</span> }</div>
            <h3>{{ tier.name }}</h3>
            <p class="price"><strong>{{ tier.price }}</strong></p>
            <ul class="plain-list perks">
              @for (f of tier.perks.slice(0, 4); track f.text) { <li><app-icon [name]="f.icon" [size]="16" /> {{ f.text }}</li> }
            </ul>
          </article>
        }
      </div>
      <p class="center"><a class="btn secondary" routerLink="/pricing" id="see-pricing">Compare the plans</a></p>
    </main>
    <p class="footer">PragyaPrep</p>

    @if (peek()) { <app-glimpse-dialog (close)="peek.set(false)" /> }
  `,
})
export class Landing {
  readonly tiers = TIERS;
  readonly persona = signal<Persona | null>(loadPersona());
  readonly peek = signal(false);
  readonly pitch = () => (this.persona() ? PITCH[this.persona()!] : null);

  pick(persona: Persona): void {
    this.persona.set(persona);
    savePersona(persona);
  }
}

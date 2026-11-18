import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PITCH, Persona, TIERS, loadPersona, savePersona } from '../core/persona';
import { Icon } from '../ui/icon';
import { PersonaPicker } from '../ui/persona-picker';
import { PublicBar } from '../ui/public-bar';

/** The three plans side by side, with the one that suits the visitor's kind (institute, student, parent) picked out. */
@Component({
  selector: 'app-pricing',
  imports: [RouterLink, Icon, PersonaPicker, PublicBar],
  template: `
    <app-public-bar />
    <main class="page">
      <div class="center">
        <h1>Plans</h1>
        <p class="muted">Start free. Move up when you want the whole course, and parents and AI in the picture.</p>
      </div>
      <div class="card">
        <h2 style="margin-top: 0">Show me the plan for…</h2>
        <app-persona-picker [current]="persona()" (choose)="pick($event)" />
      </div>

      <div class="tier-grid" id="tiers">
        @for (tier of tiers; track tier.id) {
          <article class="card tier" [class.suits]="suggested() === tier.id" [attr.data-tier]="tier.id">
            <div class="row"><span class="chip approved">{{ tier.tag }}</span>@if (suggested() === tier.id) { <span class="chip pending" id="suggested">Suits you</span> }</div>
            <h2>{{ tier.name }}</h2>
            <p class="price"><strong>{{ tier.price }}</strong><br /><span class="soft">{{ tier.priceNote }}</span></p>
            <p class="soft">{{ tier.summary }}</p>
            <ul class="plain-list">
              @for (f of tier.features; track f) { <li><app-icon name="check" [size]="15" class="ok-icon" /> {{ f }}</li> }
              @for (f of tier.missing; track f) { <li class="soft"><app-icon name="x" [size]="15" /> {{ f }}</li> }
            </ul>
            <button class="btn" type="button" disabled [attr.data-cta]="tier.id">{{ tier.id === 'free' ? 'Sign-up opens soon' : 'Pricing to be announced' }}</button>
          </article>
        }
      </div>

      <p class="center soft">Already with an institute? <a routerLink="/" fragment="institute">Open your institute's page</a>.</p>
    </main>
    <p class="footer">PragyaPrep</p>
  `,
})
export class Pricing {
  readonly tiers = TIERS;
  readonly persona = signal<Persona | null>(loadPersona());
  readonly suggested = () => (this.persona() ? PITCH[this.persona()!].tier : null);

  pick(persona: Persona): void {
    this.persona.set(persona);
    savePersona(persona);
  }
}

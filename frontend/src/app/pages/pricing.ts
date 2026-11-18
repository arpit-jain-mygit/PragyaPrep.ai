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
        <p class="muted">Start free. Go further when you are ready.</p>
        <app-persona-picker [compact]="true" [current]="persona()" (choose)="pick($event)" />
      </div>

      <div class="tier-grid" id="tiers">
        @for (tier of tiers; track tier.id) {
          <article class="card tier" [class.suits]="suggested() === tier.id" [attr.data-tier]="tier.id">
            <div class="row"><span class="chip approved">{{ tier.tag }}</span>@if (suggested() === tier.id) { <span class="chip pending" id="suggested">For you</span> }</div>
            <h2>{{ tier.name }}</h2>
            <p class="price"><strong>{{ tier.price }}</strong><br /><span class="soft">{{ tier.priceNote }}</span></p>
            <ul class="plain-list perks">
              @for (f of tier.perks; track f.text) { <li><app-icon [name]="f.icon" [size]="16" /> {{ f.text }}</li> }
              @for (f of tier.missing; track f) { <li class="soft"><app-icon name="x" [size]="15" /> {{ f }}</li> }
            </ul>
            @if (tier.id === 'free') {
              <a class="btn" routerLink="/signup" [queryParams]="{ as: persona() ?? 'student' }" data-cta="free">Start free</a>
            } @else {
              <button class="btn" type="button" disabled [attr.data-cta]="tier.id">Pricing to be announced</button>
            }
          </article>
        }
      </div>
      <p class="center"><a routerLink="/">Back to home</a></p>
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

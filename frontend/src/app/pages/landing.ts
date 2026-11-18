import { AfterViewInit, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { PITCH, Persona, TIERS, loadPersona, savePersona } from '../core/persona';
import { Icon } from '../ui/icon';
import { PersonaPicker } from '../ui/persona-picker';
import { PublicBar } from '../ui/public-bar';

/**
 * The home page for anyone who has not signed in: it asks who the visitor is (institute, student or parent), speaks to them,
 * shows the three plans in brief, and still lets people open their institute by its short name.
 */
@Component({
  selector: 'app-landing',
  imports: [FormsModule, RouterLink, Icon, PersonaPicker, PublicBar],
  template: `
    <app-public-bar />
    <main class="page home">
      <section class="hero card">
        <h1>Exam preparation that fits everyone involved</h1>
        <p class="lead">PragyaPrep brings institutes, students and parents onto one platform: a clear plan, live class recordings, tests and honest progress.</p>
        <h2 id="who">Who are you?</h2>
        <app-persona-picker [current]="persona()" (choose)="pick($event)" />
      </section>

      @if (pitch(); as p) {
        <section class="card pitch" id="pitch" [attr.data-persona]="persona()">
          <h2>{{ p.headline }}</h2>
          <p class="lead">{{ p.lead }}</p>
          <div class="point-grid">
            @for (point of p.points; track point.title) {
              <div class="point"><app-icon [name]="point.icon" [size]="22" /><strong>{{ point.title }}</strong><span class="soft">{{ point.text }}</span></div>
            }
          </div>
          <a class="btn" id="pitch-cta" routerLink="/pricing">{{ p.cta }}</a>
        </section>
      }

      <section class="tiers-teaser" id="tiers">
        <h2 class="center">Three plans</h2>
        <div class="tier-grid">
          @for (tier of tiers; track tier.id) {
            <div class="card tier" [class.suits]="pitch()?.tier === tier.id" [attr.data-tier]="tier.id">
              <span class="chip approved">{{ tier.tag }}</span>
              <h3>{{ tier.name }}</h3>
              <p class="soft">{{ tier.summary }}</p>
            </div>
          }
        </div>
        <p class="center"><a routerLink="/pricing" id="see-pricing">Compare the plans</a></p>
      </section>

      <section class="card" id="institute">
        <h2>Already with an institute?</h2>
        <p class="muted">Open your institute's page to register or log in.</p>
        <form (ngSubmit)="open()" class="row">
          <label class="label" for="slug" style="width: 100%">Your institute's short name</label>
          <input id="slug" name="slug" type="text" [(ngModel)]="slug" placeholder="for example {{ example }}"
                 autocomplete="off" autocapitalize="none" style="flex: 1 1 12rem" />
          <button class="btn" type="submit" [disabled]="!slug.trim()">Open</button>
        </form>
        <p class="hint">
          Or go straight to <a [routerLink]="['/', example]">{{ example }}</a>.
          @if (sandbox) { <span>(This is the local test version.)</span> }
        </p>
      </section>
    </main>
    <p class="footer">PragyaPrep</p>
  `,
})
export class Landing implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  slug = '';
  readonly sandbox = environment.name === 'sandbox';
  readonly example = this.sandbox ? 'demo' : 'aaptprep';
  readonly tiers = TIERS;
  readonly persona = signal<Persona | null>(loadPersona());
  readonly pitch = () => (this.persona() ? PITCH[this.persona()!] : null);

  /** A link such as /#institute scrolls to that part of the page. */
  ngAfterViewInit(): void {
    const target = this.route.snapshot.fragment;
    if (target) document.getElementById(target)?.scrollIntoView?.();
  }

  pick(persona: Persona): void {
    this.persona.set(persona);
    savePersona(persona);
  }

  open(): void {
    const slug = this.slug.trim().toLowerCase();
    if (slug) this.router.navigate(['/', slug]);
  }
}

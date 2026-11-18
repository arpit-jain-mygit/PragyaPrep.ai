import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** The top bar of the pages anyone can open (home and pricing). It carries the platform's own look, never an institute's. */
@Component({
  selector: 'app-public-bar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand-name" routerLink="/">PragyaPrep</a>
        <nav class="nav" aria-label="Main">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Home</a>
          <a routerLink="/pricing" routerLinkActive="active">Pricing</a>
          <a routerLink="/" fragment="institute" id="find-institute">Log in</a>
        </nav>
      </div>
    </header>
  `,
})
export class PublicBar {}

import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { environment } from '../../environments/environment';

/** The top bar of the pages anyone can open (home and pricing). Log in asks for the institute's short name, then opens its page. */
@Component({
  selector: 'app-public-bar',
  imports: [FormsModule, RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand-name" routerLink="/">PragyaPrep</a>
        <nav class="nav" aria-label="Main">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Home</a>
          <a routerLink="/pricing" routerLinkActive="active">Pricing</a>
          <button type="button" class="linklike" id="login-open" [attr.aria-expanded]="open()" (click)="open.set(!open())">Log in</button>
        </nav>
      </div>
    </header>
    @if (open()) {
      <div class="login-pop card" id="login-pop" role="dialog" aria-label="Log in to your institute">
        <form (ngSubmit)="go()" class="row">
          <label class="label" for="slug" style="width: 100%">Your institute's short name</label>
          <input id="slug" name="slug" type="text" [(ngModel)]="slug" [placeholder]="'for example ' + example" autocomplete="off" autocapitalize="none" style="flex: 1 1 10rem" />
          <button class="btn" type="submit" [disabled]="!slug.trim()">Open</button>
        </form>
        <p class="hint">Or go straight to <a [routerLink]="['/', example]" (click)="open.set(false)">{{ example }}</a>.@if (sandbox) { <span> (This is the local test version.)</span> }</p>
      </div>
    }
  `,
})
export class PublicBar {
  private readonly router = inject(Router);
  readonly open = signal(false);
  slug = '';
  readonly sandbox = environment.name === 'sandbox';
  readonly example = this.sandbox ? 'demo' : 'aaptprep';

  go(): void {
    const slug = this.slug.trim().toLowerCase();
    if (!slug) return;
    this.open.set(false);
    this.router.navigate(['/', slug]);
  }
}

import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../core/session.service';
import { TenantService } from '../core/tenant.service';

/**
 * The frame around every page of an institute: its name and colour at the top, and links that suit
 * who is signed in. If the institute can't be loaded (unknown, switched off, or no connection), this explains why.
 */
@Component({
  selector: 'app-tenant-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (tenants.loading()) {
      <p class="center muted" style="margin-top: 3rem">Loading…</p>
    } @else if (tenants.error(); as problem) {
      <main class="page narrow">
        <div class="card">
          <h1>{{ problem.status === 404 ? 'Institute not found' : "This page isn't available" }}</h1>
          <p>{{ problem.detail }}</p>
          <a class="btn secondary" routerLink="/">Back to the start</a>
        </div>
      </main>
    } @else if (tenants.info(); as info) {
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand-name" [routerLink]="homeLink()">
            {{ info.branding.display_name }}
          </a>
          <nav class="nav" aria-label="Main">
            @if (!member()) {
              @if (info.slug !== 'platform') {
                <a [routerLink]="['/', info.slug, 'register']" routerLinkActive="active">Register</a>
              }
              <a [routerLink]="['/', info.slug, 'login']" routerLinkActive="active">Log in</a>
            } @else {
              @if (isPlatformAdmin()) {
                <a routerLink="/platform-admin" routerLinkActive="active">Institutes</a>
              } @else if (isAdmin()) {
                <a [routerLink]="['/', info.slug, 'admin', 'registrations']" routerLinkActive="active">Registrations</a>
                <a [routerLink]="['/', info.slug, 'admin', 'courses']" routerLinkActive="active">Courses</a>
              } @else {
                <a [routerLink]="['/', info.slug, 'home']" routerLinkActive="active">Home</a>
              }
              <span class="who">{{ member()!.first_name }}</span>
              <button class="linklike" type="button" (click)="signOut()">Sign out</button>
            }
          </nav>
        </div>
      </header>
      <main class="page">
        <router-outlet />
      </main>
      <p class="footer">Powered by PragyaPrep</p>
    }
  `,
})
export class TenantShell {
  readonly tenants = inject(TenantService);
  private readonly sessions = inject(SessionService);
  private readonly router = inject(Router);

  readonly member = computed(() => this.sessions.member(this.tenants.slug()));
  readonly isAdmin = computed(() => this.member()?.role === 'tenant_admin');

  readonly isPlatformAdmin = computed(() => this.member()?.role === 'platform_admin');

  /** Where the institute's name in the top bar leads. Each part of the address is its own item, so slashes aren't escaped. */
  readonly homeLink = computed(() => {
    const slug = this.tenants.slug() ?? '';
    if (this.isPlatformAdmin()) return ['/', 'platform-admin'];
    if (this.isAdmin()) return ['/', slug, 'admin', 'registrations'];
    return ['/', slug, this.member() ? 'home' : 'login'];
  });

  signOut(): void {
    const slug = this.tenants.slug();
    if (slug) {
      this.sessions.clear(slug);
      this.router.navigate(['/', slug, 'login']);
    }
  }
}

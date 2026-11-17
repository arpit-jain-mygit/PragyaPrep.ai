import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { logoSrc } from '../core/format';
import { Icon } from '../ui/icon';
import { SessionService } from '../core/session.service';
import { TenantService } from '../core/tenant.service';

/**
 * The frame around every page of an institute: its name and colour at the top, and links that suit
 * who is signed in. If the institute can't be loaded (unknown, switched off, or no connection), this explains why.
 */
@Component({
  selector: 'app-tenant-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
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
            @if (logo(info.branding.logo_url); as src) { <img class="logo" [src]="src" alt="" /> }
            {{ info.branding.display_name }}
          </a>
          <nav class="nav" aria-label="Main">
            @if (!member()) {
              @if (info.slug !== 'platform') {
                <a [routerLink]="['/', info.slug, 'register']" routerLinkActive="active"><app-icon name="plus" /><span class="nav-label">Register</span></a>
              }
              <a [routerLink]="['/', info.slug, 'login']" routerLinkActive="active"><app-icon name="logout" /><span class="nav-label">Log in</span></a>
            } @else {
              @if (isPlatformAdmin()) {
                <a routerLink="/platform-admin" routerLinkActive="active"><app-icon name="building" /><span class="nav-label">Institutes</span></a>
              } @else if (isAdmin()) {
                <a [routerLink]="['/', info.slug, 'admin', 'registrations']" routerLinkActive="active"><app-icon name="users" /><span class="nav-label">Registrations</span></a>
                <a [routerLink]="['/', info.slug, 'admin', 'courses']" routerLinkActive="active"><app-icon name="book" /><span class="nav-label">Courses</span></a>
                <a [routerLink]="['/', info.slug, 'admin', 'questions']" routerLinkActive="active"><app-icon name="help" /><span class="nav-label">Question bank</span></a>
                <a [routerLink]="['/', info.slug, 'admin', 'tests']" routerLinkActive="active"><app-icon name="clipboard" /><span class="nav-label">Tests</span></a>
              } @else {
                <a [routerLink]="['/', info.slug, 'home']" routerLinkActive="active"><app-icon name="home" /><span class="nav-label">Home</span></a>
                <a [routerLink]="['/', info.slug, 'courses']" routerLinkActive="active"><app-icon name="book" /><span class="nav-label">My courses</span></a>
                <a [routerLink]="['/', info.slug, 'tests']" routerLinkActive="active"><app-icon name="clipboard" /><span class="nav-label">Tests</span></a>
              }
              <span class="who">{{ member()!.first_name }}</span>
              <button class="icon-btn" type="button" title="Sign out" (click)="signOut()"><app-icon name="logout" /><span class="sr-only">Sign out</span></button>
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
  readonly logo = logoSrc;
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

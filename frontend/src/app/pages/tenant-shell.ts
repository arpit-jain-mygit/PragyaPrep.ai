import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { logoSrc } from '../core/format';
import { Avatar } from '../ui/avatar';
import { Welcome } from '../ui/welcome';
import { Icon } from '../ui/icon';
import { SupportBox } from '../ui/support-box';
import { NoticeService } from '../core/notice.service';
import { ProfileService } from '../core/profile.service';
import { SessionService } from '../core/session.service';
import { TenantService } from '../core/tenant.service';

/**
 * The frame around every page of an institute: its name and colour at the top, and links that suit
 * who is signed in. If the institute can't be loaded (unknown, switched off, or no connection), this explains why.
 */
@Component({
  selector: 'app-tenant-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Avatar, Icon, SupportBox, Welcome],
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
                <a [routerLink]="info.slug === 'free' ? ['/signup'] : ['/', info.slug, 'register']" routerLinkActive="active" data-tone="plus"><app-icon name="plus" /><span class="nav-label">Register</span></a>
              }
              <a [routerLink]="['/', info.slug, 'login']" routerLinkActive="active" data-tone="out"><app-icon name="logout" /><span class="nav-label">Log in</span></a>
            } @else {
              @if (isPlatformAdmin()) {
                <a routerLink="/platform-admin" routerLinkActive="active" data-tone="inst"><app-icon name="building" /><span class="nav-label">Institutes</span></a>
              } @else if (isAdmin()) {
                <a [routerLink]="['/', info.slug, 'admin', 'home']" routerLinkActive="active" data-tone="home"><app-icon name="home" /><span class="nav-label">Home</span></a>
                <a [routerLink]="['/', info.slug, 'admin', 'registrations']" routerLinkActive="active" data-tone="people"><app-icon name="users" /><span class="nav-label">Registrations</span></a>
                <a [routerLink]="['/', info.slug, 'admin', 'courses']" routerLinkActive="active" data-tone="learn"><app-icon name="book" /><span class="nav-label">Courses</span></a>
                <a [routerLink]="['/', info.slug, 'admin', 'batches']" routerLinkActive="active" data-tone="batch"><app-icon name="layers" /><span class="nav-label">Batches</span></a>
                <a [routerLink]="['/', info.slug, 'admin', 'questions']" routerLinkActive="active" data-tone="qbank"><app-icon name="help" /><span class="nav-label">Question bank</span></a>
                <a [routerLink]="['/', info.slug, 'admin', 'tests']" routerLinkActive="active" data-tone="tests"><app-icon name="clipboard" /><span class="nav-label">Tests</span></a>
                <a [routerLink]="['/', info.slug, 'admin', 'progress']" routerLinkActive="active" data-tone="prog"><app-icon name="chart" /><span class="nav-label">Progress</span></a>
                <a [routerLink]="['/', info.slug, 'admin', 'announcements']" routerLinkActive="active" data-tone="news"><app-icon name="mail" /><span class="nav-label">Announcements</span></a>
              } @else if (info.slug === 'free') {
                <a [routerLink]="['/', info.slug, 'home']" routerLinkActive="active" data-tone="home"><app-icon name="home" /><span class="nav-label">Home</span></a>
              } @else if (isParent()) {
                <a [routerLink]="['/', info.slug, 'parent']" routerLinkActive="active" data-tone="people"><app-icon name="users" /><span class="nav-label">My children</span></a>
              } @else {
                <a [routerLink]="['/', info.slug, 'home']" routerLinkActive="active" data-tone="home"><app-icon name="home" /><span class="nav-label">Home</span></a>
                <a [routerLink]="['/', info.slug, 'learning']" routerLinkActive="active" data-tone="learn"><app-icon name="book" /><span class="nav-label">My Learning</span></a>
                <a [routerLink]="['/', info.slug, 'notices']" routerLinkActive="active" class="notices-link" data-tone="news"><app-icon name="bell" /><span class="nav-label">Notices</span>@if (notices.unread() > 0) { <span class="badge" [class.alert]="notices.actionUnread() > 0" id="notice-badge" [attr.aria-label]="notices.unread() + ' unread'">{{ notices.unread() }}</span> }</a>
              }
              @if (member()!.role === 'student' || member()!.role === 'parent') {
                <a class="avatar-link" id="profile-link" [routerLink]="['/', info.slug, 'profile']" routerLinkActive="active" title="My profile" aria-label="My profile"><app-avatar [url]="profile.avatarUrl()" [first]="member()!.first_name" [last]="member()!.last_name" [email]="member()!.email" [size]="28" /></a>
              } @else if (isAdmin()) {
                <a class="avatar-link" id="institute-link" [routerLink]="['/', info.slug, 'admin', 'institute']" routerLinkActive="active" title="My institute" aria-label="My institute"><app-avatar [url]="profile.avatarUrl()" [first]="member()!.first_name" [last]="member()!.last_name" [email]="member()!.email" [size]="28" /></a>
              } @else {
                <app-avatar [url]="profile.avatarUrl()" [first]="member()!.first_name" [last]="member()!.last_name" [email]="member()!.email" [size]="28" />
              }
              @if (!isPlatformAdmin()) {
                <button class="icon-btn" type="button" id="support-open" title="Contact support" (click)="support.set(true)"><app-icon name="help" /><span class="sr-only">Contact support</span></button>
              }
              <button class="icon-btn" type="button" title="Sign out" (click)="signOut()"><app-icon name="logout" /><span class="sr-only">Sign out</span></button>
            }
          </nav>
        </div>
      </header>
      <main class="page">
        <router-outlet />
      </main>
      @if (support()) { <app-support-box (close)="support.set(false)" /> }
      @if (member(); as m) { @if (!isPlatformAdmin()) { <app-welcome [role]="m.role" [tenant]="info.slug" [email]="m.email" /> } }
      <p class="footer">Powered by PragyaPrep</p>
    }
  `,
})
export class TenantShell {
  readonly logo = logoSrc;
  readonly support = signal(false);
  readonly tenants = inject(TenantService);
  private readonly sessions = inject(SessionService);
  private readonly router = inject(Router);
  readonly notices = inject(NoticeService);
  readonly profile = inject(ProfileService);

  constructor() {
    // A signed-in student's unread count sits on the Notices link; everyone else has none.
    effect(() => {
      const role = this.member()?.role;
      if (role === 'student') void this.notices.refresh();
      else this.notices.clear();
      if (role === 'student' || role === 'parent' || role === 'tenant_admin') void this.profile.refresh();
      else this.profile.clear();
    });
  }

  readonly member = computed(() => this.sessions.member(this.tenants.slug()));
  readonly isAdmin = computed(() => this.member()?.role === 'tenant_admin');

  readonly isParent = computed(() => this.member()?.role === 'parent');
  readonly isPlatformAdmin = computed(() => this.member()?.role === 'platform_admin');

  /** Where the institute's name in the top bar leads. Each part of the address is its own item, so slashes aren't escaped. */
  readonly homeLink = computed(() => {
    const slug = this.tenants.slug() ?? '';
    if (this.isPlatformAdmin()) return ['/', 'platform-admin'];
    if (this.isAdmin()) return ['/', slug, 'admin', 'home'];
    if (this.isParent()) return ['/', slug, 'parent'];
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

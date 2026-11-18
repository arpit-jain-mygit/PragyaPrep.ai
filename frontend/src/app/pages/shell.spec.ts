import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { API, DEMO, all, clickButton, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { Landing } from './landing';
import { NotFound } from './not-found';
import { TenantShell } from './tenant-shell';

describe('Institute page frame', () => {
  it('shows the institute\'s name and the links for someone who is signed out', async () => {
    setupTestBed();
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    expect(text(fixture)).toContain('Demo Institute');
    const links = all(fixture, 'nav a').map((a) => a.textContent?.trim());
    expect(links).toEqual(['Register', 'Log in']);
    expect(text(fixture)).toContain('Powered by PragyaPrep');
  });

  it('shows the admin\'s links, their name, and a Sign out button', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    expect(all(fixture, 'nav a').map((a) => a.textContent?.trim())).toEqual(['Home', 'Registrations', 'Courses', 'Question bank', 'Tests', 'Progress', 'Announcements']);
    expect(text(fixture)).toContain('Asha');
    expect(() => clickButton(fixture, 'Sign out')).not.toThrow();
  });

  it('shows a parent only My children, with support, and sends the institute name there', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('parent'));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    expect(all(fixture, 'nav a').map((a) => a.textContent?.trim())).toEqual(['My children']);
    expect(all<HTMLAnchorElement>(fixture, 'nav a')[0].getAttribute('href')).toBe('/demo/parent');
    expect(all<HTMLAnchorElement>(fixture, 'a.brand-name')[0].getAttribute('href')).toBe('/demo/parent');
    expect(all(fixture, '#support-open').length).toBe(1);
  });

  it('gives admins and students a Contact support button that opens the form, but not the platform admin', async () => {
    for (const role of ['tenant_admin', 'student'] as const) {
      const env = setupTestBed();
      env.sessions.save(sessionFor(role));
      const fixture = TestBed.createComponent(TenantShell);
      await settle(fixture);
      expect(all(fixture, '#support-box').length).toBe(0);
      el(fixture, '#support-open').click();
      await settle(fixture);
      expect(all(fixture, '#support-box').length).toBe(1);
      el(fixture, 'button[title="Close"]').click();
      await settle(fixture);
      expect(all(fixture, '#support-box').length).toBe(0);
      TestBed.resetTestingModule();
    }
    const env = setupTestBed();
    env.sessions.save(sessionFor('platform_admin'));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    expect(all(fixture, '#support-open').length).toBe(0);
  });

  it.each([
    ['tenant_admin', '/demo/admin/home'],
    ['student', '/demo/home'],
  ] as const)('sends a %s to %s when they click the institute name', async (role, address) => {
    const env = setupTestBed();
    env.sessions.save(sessionFor(role));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    expect(all<HTMLAnchorElement>(fixture, 'a.brand-name')[0].getAttribute('href')).toBe(address);
  });

  it('sends someone who is signed out to the login page from the institute name', async () => {
    setupTestBed();
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    expect(all<HTMLAnchorElement>(fixture, 'a.brand-name')[0].getAttribute('href')).toBe('/demo/login');
  });

  it('shows a student Home, My Learning and Notices', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    env.http.expectOne(`${API}/api/my/notices`).flush({ unread: 0, action_unread: 0, notices: [] });
    await settle(fixture);
    expect(all(fixture, 'nav a').map((a) => a.textContent?.trim())).toEqual(['Home', 'My Learning', 'Notices']);
    expect(all(fixture, '#notice-badge').length).toBe(0);
  });

  it('shows the unread count on the Notices link, in red when something needs action', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    env.http.expectOne(`${API}/api/my/notices`).flush({ unread: 3, action_unread: 1, notices: [] });
    await settle(fixture);
    const badge = el(fixture, '#notice-badge');
    expect(badge.textContent!.trim()).toBe('3');
    expect(badge.className).toContain('alert');
    expect(badge.getAttribute('aria-label')).toBe('3 unread');
    expect(el<HTMLAnchorElement>(fixture, 'a.notices-link').getAttribute('href')).toBe('/demo/notices');
  });

  it('shows a plain badge for information only, and no badge or request for an admin', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    env.http.expectOne(`${API}/api/my/notices`).flush({ unread: 2, action_unread: 0, notices: [] });
    await settle(fixture);
    expect(el(fixture, '#notice-badge').className).not.toContain('alert');
  });

  it('does not ask an admin for notices', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    env.http.expectNone(`${API}/api/my/notices`);
    expect(all(fixture, '#notice-badge').length).toBe(0);
  });

  it('keeps the page working when the notice count cannot be loaded', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    env.http.expectOne(`${API}/api/my/notices`).flush({ detail: 'x' }, { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(all(fixture, 'nav a').length).toBe(3);
    expect(all(fixture, '#notice-badge').length).toBe(0);
  });

  it('shows a signed-in student\'s photo in the top bar, asking for their own link', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    env.http.expectOne(`${API}/api/my/notices`).flush({ unread: 0, action_unread: 0, notices: [] });
    env.http.expectOne(`${API}/api/auth/me`).flush({ ...sessionFor('student').member, avatar_url: 'https://files.example/asha.jpg' });
    await settle(fixture);
    expect(el(fixture, '.nav img.avatar').getAttribute('src')).toBe('https://files.example/asha.jpg');
  });

  it('shows initials in the top bar when there is no photo, and for an admin too', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    env.http.expectOne(`${API}/api/auth/me`).flush({ ...sessionFor('tenant_admin').member, avatar_url: '' });
    await settle(fixture);
    expect(all(fixture, '.nav img.avatar').length).toBe(0);
    expect(el(fixture, '.nav span.avatar').textContent!.trim().length).toBeGreaterThan(0);
  });

  it('keeps the initials when the photo link cannot be fetched', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    env.http.expectOne(`${API}/api/auth/me`).flush({ detail: 'x' }, { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(all(fixture, '.nav img.avatar').length).toBe(0);
    expect(all(fixture, '.nav span.avatar').length).toBe(1);
  });

  it('signs the person out and goes to the login page', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);

    clickButton(fixture, 'Sign out');
    await settle(fixture);

    expect(env.sessions.get('demo')).toBeNull();
    expect(env.navigate).toHaveBeenCalledWith(['/', 'demo', 'login']);
    expect(all(fixture, 'nav a').map((a) => a.textContent?.trim())).toEqual(['Register', 'Log in']);
  });

  it('says the institute was not found', async () => {
    const env = setupTestBed({ tenant: false });
    env.tenants.slug.set('nobody');
    env.tenants.error.set({ status: 404, detail: "We couldn't find that institute." });
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    expect(text(fixture)).toContain('Institute not found');
    expect(text(fixture)).toContain("We couldn't find that institute.");
    expect(all(fixture, 'nav').length).toBe(0);
  });

  it('says a switched-off institute is not available', async () => {
    const env = setupTestBed({ tenant: false });
    env.tenants.slug.set('closed');
    env.tenants.error.set({ status: 403, detail: "This institute isn't active right now. Please contact the institute." });
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    expect(text(fixture)).toContain("This page isn't available");
    expect(text(fixture)).toContain("This institute isn't active right now.");
  });

  it('shows a loading message while the institute loads', async () => {
    const env = setupTestBed({ tenant: false });
    env.tenants.loading.set(true);
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    expect(text(fixture)).toContain('Loading…');
  });
});

describe('Institute page frame: the platform', () => {
  function atPlatform() {
    const env = setupTestBed({ tenant: false });
    env.tenants.slug.set('platform');
    env.tenants.info.set({ slug: 'platform', name: 'PragyaPrep Platform', branding: { display_name: 'PragyaPrep Platform', primary_color: '#2563eb', logo_url: null } });
    return env;
  }

  it('shows the platform admin an Institutes link, and the institute name leads to their page', async () => {
    const env = atPlatform();
    env.sessions.save(sessionFor('platform_admin', 'platform'));
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    expect(all(fixture, 'nav a').map((a) => a.textContent?.trim())).toEqual(['Institutes']);
    expect(all<HTMLAnchorElement>(fixture, 'a.brand-name')[0].getAttribute('href')).toBe('/platform-admin');
    expect(() => clickButton(fixture, 'Sign out')).not.toThrow();
  });

  it('offers only Log in at the platform, because there is no registration there', async () => {
    atPlatform();
    const fixture = TestBed.createComponent(TenantShell);
    await settle(fixture);
    expect(all(fixture, 'nav a').map((a) => a.textContent?.trim())).toEqual(['Log in']);
  });
});

describe('Start page', () => {
  it('opens an institute by its short name', async () => {
    const env = setupTestBed({ tenant: false });
    const fixture = TestBed.createComponent(Landing);
    await settle(fixture);
    fixture.componentInstance.slug = '  AaptPrep ';
    fixture.componentInstance.open();
    expect(env.navigate).toHaveBeenCalledWith(['/', 'aaptprep']);
  });

  it('does nothing when nothing is typed', async () => {
    const env = setupTestBed({ tenant: false });
    const fixture = TestBed.createComponent(Landing);
    await settle(fixture);
    fixture.componentInstance.open();
    expect(env.navigate).not.toHaveBeenCalled();
  });

  it('suggests the demo institute in the local test version', async () => {
    setupTestBed({ tenant: false });
    const fixture = TestBed.createComponent(Landing);
    await settle(fixture);
    expect(text(fixture)).toContain('demo');
    expect(text(fixture)).toContain('local test version');
  });
});

describe('Page not found', () => {
  it('offers a way back to the login page', async () => {
    setupTestBed();
    vi.spyOn(TestBed.inject(Router), 'createUrlTree');
    const fixture = TestBed.createComponent(NotFound);
    await settle(fixture);
    expect(text(fixture)).toContain("We couldn't find that page");
    expect(all<HTMLAnchorElement>(fixture, 'a')[0].getAttribute('href')).toContain('/demo/login');
  });

  it('shows the institute\'s logo next to its name when it has one', async () => {
    const env = setupTestBed();
    env.tenants.info.set({ ...DEMO, branding: { ...DEMO.branding, logo_url: '/api/logo/demo?v=ab12' } });
    const fixture = TestBed.createComponent(TenantShell);
    fixture.detectChanges();
    await settle(fixture);
    const image = el<HTMLImageElement>(fixture, '.topbar img.logo');
    expect(image.getAttribute('src')).toBe(`${API}/api/logo/demo?v=ab12`);
    expect(image.getAttribute('alt')).toBe(''); // the name beside it says who this is
    expect(text(fixture)).toContain('Demo Institute');
  });

  it('shows just the name when there is no logo', async () => {
    setupTestBed();
    const fixture = TestBed.createComponent(TenantShell);
    fixture.detectChanges();
    await settle(fixture);
    expect(all(fixture, '.topbar img').length).toBe(0);
  });
});

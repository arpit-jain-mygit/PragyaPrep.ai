import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TenantService } from '../core/tenant.service';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { AdminFeaturesPage } from './admin-features';

const ROWS = [
  { key: 'coursework', group: 'Learning', default_label: 'Coursework', built: true, enabled: true, label: 'Coursework', position: 0 },
  { key: 'notices', group: 'Learning', default_label: 'Notices', built: true, enabled: true, label: 'Notices', position: 1 },
  { key: 'mocks', group: 'Practice', default_label: 'Mocks', built: false, enabled: false, label: 'Mocks', position: 2 },
];

async function open(rows = ROWS) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminFeaturesPage);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/features`).flush({ features: rows });
  await settle(fixture);
  return { ...env, fixture };
}

describe('Features and labels', () => {
  it('lists every screen grouped by area, marking the ones not built yet as coming later', async () => {
    const { fixture } = await open();
    expect(all(fixture, '[data-group]').map((node) => node.getAttribute('data-group'))).toEqual(['Learning', 'Practice']);
    const planned = el(fixture, '[data-key="mocks"]');
    expect(planned.textContent).toContain('Coming later');
    expect(planned.querySelector('input[type="checkbox"]')!.hasAttribute('disabled')).toBe(true);
    expect(el(fixture, '[data-key="coursework"] input[type="checkbox"]').hasAttribute('disabled')).toBe(false);
  });

  it('switches a built screen off and renames it, then saves exactly those settings in order', async () => {
    const { fixture, http } = await open();
    const notices = el<HTMLInputElement>(fixture, '[data-key="notices"] input[type="checkbox"]');
    notices.checked = false;
    notices.dispatchEvent(new Event('change'));
    const name = el<HTMLInputElement>(fixture, '[data-key="coursework"] input[type="text"]');
    name.value = 'Lessons';
    name.dispatchEvent(new Event('input'));
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#save-features').click();
    const request = http.expectOne(`${API}/api/admin/features`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual([
      { key: 'coursework', enabled: true, label: 'Lessons' },
      { key: 'notices', enabled: false, label: 'Notices' },
      { key: 'mocks', enabled: false, label: 'Mocks' },
    ]);
  });

  it('moves a screen up the list and saves the new order', async () => {
    const { fixture, http } = await open();
    const up = el<HTMLButtonElement>(fixture, '[data-key="notices"] button[aria-label="Move up"]');
    up.click();
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#save-features').click();
    const body = http.expectOne(`${API}/api/admin/features`).request.body as { key: string }[];
    expect(body.map((row) => row.key)).toEqual(['notices', 'coursework', 'mocks']);
  });

  it('shows a refused save as a plain message and changes nothing', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '#save-features').click();
    http.expectOne(`${API}/api/admin/features`).flush({ detail: 'A label must be 1 to 40 characters.' }, { status: 422, statusText: 'Unprocessable' });
    await settle(fixture);
    expect(el(fixture, '#save-error').textContent).toContain('A label must be 1 to 40 characters.');
    expect(all(fixture, '#saved').length).toBe(0);
  });

  it('refreshes the institute details after a save, so the student menu follows at once', async () => {
    const { fixture, http } = await open();
    const tenants = TestBed.inject(TenantService);
    el<HTMLButtonElement>(fixture, '#save-features').click();
    http.expectOne(`${API}/api/admin/features`).flush({ features: ROWS });
    await settle(fixture);
    http.expectOne(`${API}/api/tenant`).flush({
      slug: 'demo', name: 'Demo', branding: { display_name: 'Demo', primary_color: '#2563eb', logo_url: null },
      features: [{ key: 'notices', group: 'Learning', label: 'Notices', enabled: false }],
    });
    await settle(fixture);
    expect(tenants.isOn('notices')).toBe(false);
    expect(all(fixture, '#saved').length).toBe(1);
  });
});

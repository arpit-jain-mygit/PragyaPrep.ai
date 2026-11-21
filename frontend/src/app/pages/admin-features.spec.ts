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

const ICON_COLOUR = {
  colour: '#4f46e5',
  options: [
    { hex: '#4f46e5', name: 'Indigo' },
    { hex: '#0891b2', name: 'Cyan' },
    { hex: '#dc2626', name: 'Red' },
  ],
};

async function open(rows = ROWS) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminFeaturesPage);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/features`).flush({ features: rows, oranges_target: 10 });
  await settle(fixture);
  env.http.expectOne(`${API}/api/admin/features/headings`).flush({ headings: { Learn: 'book-open', Tools: 'wrench' } });
  await settle(fixture);
  env.http.expectOne(`${API}/api/admin/features/icon-colour`).flush(ICON_COLOUR);
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

  it('lets the admin name a planned screen now, though it still can\'t be switched on', async () => {
    const { fixture, http } = await open();
    const name = el<HTMLInputElement>(fixture, '[data-key="mocks"] input[type="text"]');
    expect(name.hasAttribute('disabled')).toBe(false);
    name.value = 'Full mocks';
    name.dispatchEvent(new Event('input'));
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#save-features').click();
    const body = http.expectOne(`${API}/api/admin/features`).request.body as { key: string; enabled: boolean; label: string; icon: string }[];
    expect(body.find((row) => row.key === 'mocks')).toEqual({ key: 'mocks', enabled: false, label: 'Full mocks', icon: 'list' });
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
      { key: 'coursework', enabled: true, label: 'Lessons', icon: 'list' },
      { key: 'notices', enabled: false, label: 'Notices', icon: 'list' },
      { key: 'mocks', enabled: false, label: 'Mocks', icon: 'list' },
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

  it('saves the daily target for oranges on its own', async () => {
    const { fixture, http } = await open();
    const input = el<HTMLInputElement>(fixture, '#target-input');
    expect(input.value).toBe('10');
    input.value = '25';
    input.dispatchEvent(new Event('input'));
    el<HTMLButtonElement>(fixture, '#save-target').click();
    const request = http.expectOne(`${API}/api/admin/oranges-target`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ target: 25 });
    request.flush({ target: 25 });
    await settle(fixture);
    expect(all(fixture, '#target-saved').length).toBe(1);
  });

  it('shows a refused target as a plain message', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '#save-target').click();
    http.expectOne(`${API}/api/admin/oranges-target`).flush({ detail: 'The daily target must be from 1 to 100.' }, { status: 422, statusText: 'Unprocessable' });
    await settle(fixture);
    expect(el(fixture, '#target-error').textContent).toContain('from 1 to 100');
  });

  it('lists the menu headings with their icons, and saves a changed icon on its own', async () => {
    const { fixture, http } = await open();
    expect(el(fixture, '[data-heading="Learn"]').textContent).toContain('Learn');
    const select = el<HTMLSelectElement>(fixture, '[data-heading="Learn"] select');
    expect(select.value).toBe('book-open');
    select.value = 'target';
    select.dispatchEvent(new Event('change'));
    el<HTMLButtonElement>(fixture, '#save-headings').click();
    const request = http.expectOne(`${API}/api/admin/features/headings`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ Learn: 'target', Tools: 'wrench' });
    request.flush({ headings: { Learn: 'target', Tools: 'wrench' } });
    await settle(fixture);
    expect(el(fixture, '#headings-saved').textContent).toContain('Saved.');
  });
});

describe('Menu icon colour', () => {
  it('shows the colours with the first one recommended, and marks the saved one', async () => {
    const { fixture } = await open();
    const swatches = all(fixture, '.swatch');
    expect(swatches.length).toBe(3);
    expect(el(fixture, '[data-colour="#4f46e5"]').textContent).toContain('Recommended');
    expect(el(fixture, '[data-colour="#4f46e5"]').getAttribute('aria-checked')).toBe('true');
    expect(el(fixture, '[data-colour="#dc2626"]').textContent).not.toContain('Recommended');
  });

  it('previews the picked colour and saves it on its own', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '[data-colour="#dc2626"]').click();
    await settle(fixture);
    expect(el(fixture, '[data-colour="#dc2626"]').getAttribute('aria-checked')).toBe('true');
    el<HTMLButtonElement>(fixture, '#save-colour').click();
    const request = http.expectOne(`${API}/api/admin/features/icon-colour`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ colour: '#dc2626' });
    request.flush({ ...ICON_COLOUR, colour: '#dc2626' });
    await settle(fixture);
    expect(el(fixture, '#colour-saved').textContent).toContain('Saved.');
  });

  it('explains a refused colour', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '#save-colour').click();
    http.expectOne(`${API}/api/admin/features/icon-colour`).flush({ detail: 'Choose a colour from the list.' }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(el(fixture, '#colour-error').textContent).toContain('Choose a colour from the list.');
  });
});

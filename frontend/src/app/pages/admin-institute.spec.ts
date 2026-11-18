import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TenantService } from '../core/tenant.service';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminInstitutePage } from './admin-institute';

const EMPTY = { description: '', city: '', contact_email: '', contact_phone: '', website: '', exam_categories: [] };
const PAGE = {
  slug: 'demo', name: 'Demo Institute', primary_color: '#2563eb', logo_url: null, plan: 'paid', profile: EMPTY,
  admin: { email: 'admin@demo.example', first_name: 'Ritu', last_name: 'Rao', mobile: '', avatar_url: '' },
};

async function open(page: object = PAGE) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminInstitutePage);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/institute`).flush(page);
  await settle(fixture);
  return { ...env, fixture };
}

describe('My institute', () => {
  it('shows the institute, says its details are public, and shows the login email as fixed text', async () => {
    const { fixture } = await open();
    expect(el<HTMLInputElement>(fixture, '#name').value).toBe('Demo Institute');
    expect(el(fixture, '#public-note').textContent).toContain('shown to your students and to visitors');
    expect(el(fixture, '#login-email').textContent).toContain('admin@demo.example');
    expect(all(fixture, 'input[name="email"]').length).toBe(0);
  });

  it('saves everything in one go, turning the exams text into a list, and updates the top bar look', async () => {
    const { fixture, http } = await open();
    const tenants = TestBed.inject(TenantService);
    tenants.update({ slug: 'demo', name: 'Demo Institute', branding: { display_name: 'Demo Institute', primary_color: '#2563eb', logo_url: null } });
    type(fixture, '#name', 'Demo Classes');
    type(fixture, '#city', 'Noida');
    type(fixture, '#categories', 'CLAT, CUET ,');
    type(fixture, '#contactPhone', '9876543210');
    type(fixture, '#firstName', 'Ritu');
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#save').click();
    const request = http.expectOne(`${API}/api/admin/institute`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toMatchObject({ name: 'Demo Classes', city: 'Noida', exam_categories: ['CLAT', 'CUET'], contact_phone: '9876543210', admin_first_name: 'Ritu' });
    expect('admin_email' in request.request.body).toBe(false);
    request.flush({ ...PAGE, name: 'Demo Classes', primary_color: '#16a34a', profile: { ...EMPTY, city: 'Noida', exam_categories: ['CLAT', 'CUET'] } });
    await settle(fixture);
    expect(all(fixture, '#saved').length).toBe(1);
    expect(tenants.info()!.branding.display_name).toBe('Demo Classes');
    expect(tenants.info()!.profile!.city).toBe('Noida');
  });

  it('shows the server problem and no "Saved"', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '#save').click();
    http.expectOne(`${API}/api/admin/institute`).flush({ detail: 'Enter a website address like https://example.com.' }, { status: 422, statusText: 'Unprocessable' });
    await settle(fixture);
    expect(el(fixture, '#save-error').textContent).toContain('website address');
    expect(all(fixture, '#saved').length).toBe(0);
  });

  it('offers to remove a logo that exists and not otherwise', async () => {
    const without = await open();
    expect(all(without.fixture, '#logo-remove').length).toBe(0);
    expect(text(without.fixture)).toContain('Add logo');
  });

  it('removes the logo and refreshes the page', async () => {
    const { fixture, http } = await open({ ...PAGE, logo_url: '/api/logo/demo?v=1' });
    el<HTMLButtonElement>(fixture, '#logo-remove').click();
    http.expectOne(`${API}/api/admin/institute/logo/remove`).flush({ ...PAGE, logo_url: null });
    await settle(fixture);
    expect(all(fixture, '#logo-remove').length).toBe(0);
  });
});

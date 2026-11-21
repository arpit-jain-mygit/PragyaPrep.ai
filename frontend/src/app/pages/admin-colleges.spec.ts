import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { AdminCollegesPage } from './admin-colleges';

async function open(rows: object[] = []) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminCollegesPage);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/colleges`).flush(rows);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Colleges and cutoffs (admin)', () => {
  it('adds a college with a rule and shows it in the list', async () => {
    const { fixture, http } = await open();
    const name = el<HTMLInputElement>(fixture, '#college-name');
    name.value = 'IIM Indore';
    name.dispatchEvent(new Event('input'));
    const value = el<HTMLInputElement>(fixture, '#rule-value');
    value.value = '2007-08-01';
    value.dispatchEvent(new Event('input'));
    el<HTMLButtonElement>(fixture, '#add-rule').click();
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#add-college').click();
    const request = http.expectOne(`${API}/api/admin/colleges`);
    expect(request.request.body).toEqual({ name: 'IIM Indore', rules: [{ type: 'dob_on_or_after', value: '2007-08-01' }] });
    request.flush({ id: 'c1', name: 'IIM Indore', rules: [], created_at: '', updated_at: '', added_at: 1 });
    await settle(fixture);
    expect(el(fixture, '[data-college="c1"]').textContent).toContain('IIM Indore');
  });

  it('shows a refused college as a plain message', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '#add-college').click();
    http.expectOne(`${API}/api/admin/colleges`).flush({ detail: 'Type the college name.' }, { status: 422, statusText: 'Unprocessable' });
    await settle(fixture);
    expect(el(fixture, '#colleges-error').textContent).toContain('Type the college name.');
  });

  it('opens a college and shows its cutoff rows', async () => {
    const { fixture, http } = await open([{ id: 'c1', name: 'IIM Indore', rules: [], created_at: '', updated_at: '', added_at: 1 }]);
    el<HTMLButtonElement>(fixture, '[data-college="c1"] button').click();
    http.expectOne(`${API}/api/admin/colleges/c1/cutoffs`).flush({
      college: { id: 'c1', name: 'IIM Indore' }, years: [2026], year: 2026,
      rows: [{ id: 'CUT#2026#General#SA', year: 2026, category: 'General', section: 'SA', cutoff: 28, seats: null, applicants: null, qualified: null }],
    });
    await settle(fixture);
    expect(all(fixture, '[data-row]').length).toBe(1);
  });

  it('removes a college from the list', async () => {
    const { fixture, http } = await open([{ id: 'c1', name: 'IIM Indore', rules: [], created_at: '', updated_at: '', added_at: 1 }]);
    el<HTMLButtonElement>(fixture, '[aria-label="Remove IIM Indore"]').click();
    http.expectOne(`${API}/api/admin/colleges/c1`).flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    expect(all(fixture, '[data-college="c1"]').length).toBe(0);
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { DashboardProgress } from './dashboard-progress';

const TODAY = { oranges: { collected_today: 4, collected_total: 31, target: 10, days_strong: 2 } };

async function open(on = true) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  if (!on) env.tenants.info.set({ ...env.tenants.info()!, features: [{ key: 'dashboard_points', group: 'Dashboard', label: 'Oranges', enabled: false }] } as never);
  const fixture = TestBed.createComponent(DashboardProgress);
  fixture.detectChanges();
  if (on) env.http.expectOne(`${API}/api/my/oranges`).flush(TODAY);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Today\'s progress card', () => {
  it('shows today\'s oranges against the target, with the bar and the streak', async () => {
    const { fixture } = await open();
    expect(el(fixture, '[data-collected]').textContent).toContain('4');
    expect(el(fixture, '[data-target]').textContent).toContain('10');
    expect(el(fixture, '[data-bar]').style.width).toBe('40%');
    expect(el(fixture, '[data-streak]').textContent).toContain('2 days strong in a row');
  });

  it('caps the bar at full when the target is passed', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(DashboardProgress);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/oranges`).flush({ oranges: { collected_today: 25, collected_total: 25, target: 10, days_strong: 1 } });
    await settle(fixture);
    expect(el(fixture, '[data-bar]').style.width).toBe('100%');
  });

  it('shows nothing when the institute has oranges switched off, and does not ask for them', async () => {
    const { fixture, http } = await open(false);
    expect(all(fixture, '#todays-progress').length).toBe(0);
    http.expectNone(`${API}/api/my/oranges`);
  });
});

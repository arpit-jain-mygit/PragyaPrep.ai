import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { AdminReleasesPage } from './admin-releases';

const PASSAGES = [
  { id: 'p1', title: 'Trade routes', text: 'Text one.', questions: 0 },
  { id: 'p2', title: 'Coastal map', text: 'Text two.', questions: 0 },
];

function list(kind: string, mode: 'self' | 'queue', items: unknown[] = []) {
  return { kind, schedule: { mode, start: null }, items };
}

async function open(daily = list('daily_rc', 'self'), weekly = list('weekly_dilr', 'queue')) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminReleasesPage);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/passages`).flush(PASSAGES);
  env.http.expectOne(`${API}/api/admin/releases/daily_rc`).flush(daily);
  env.http.expectOne(`${API}/api/admin/releases/weekly_dilr`).flush(weekly);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Daily RC and Weekly DILR admin page', () => {
  it('shows each kind with its own add form for the way it is set up', async () => {
    const { fixture } = await open();
    expect(all(fixture, '[data-kind]').map((node) => node.getAttribute('data-kind'))).toEqual(['daily_rc', 'weekly_dilr']);
    expect(el(fixture, '[data-pick-one="daily_rc"]')).toBeTruthy();
    expect(all(fixture, '[data-pick]').length).toBe(2);
  });

  it('adds one passage on a chosen date in self mode', async () => {
    const { fixture, http } = await open();
    const pick = el<HTMLSelectElement>(fixture, '[data-pick-one="daily_rc"]');
    pick.value = 'p1';
    pick.dispatchEvent(new Event('change'));
    const day = el<HTMLInputElement>(fixture, '[data-date="daily_rc"]');
    day.value = '2026-12-01';
    day.dispatchEvent(new Event('input'));
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '[data-add-one="daily_rc"]').click();
    const request = http.expectOne(`${API}/api/admin/releases`);
    expect(request.request.body).toEqual({ kind: 'daily_rc', passage_ids: ['p1'], date: '2026-12-01' });
    request.flush([]);
    await settle(fixture);
    http.expectOne(`${API}/api/admin/releases/daily_rc`).flush(list('daily_rc', 'self', [{ id: 'r1', kind: 'daily_rc', passage_id: 'p1', title: 'Trade routes', date: '2026-12-01' }]));
    await settle(fixture);
    expect(el(fixture, '[data-list="daily_rc"]').textContent).toContain('Trade routes');
  });

  it('queues many passages in bulk, in the order they were ticked', async () => {
    const { fixture, http } = await open();
    const boxes = all<HTMLInputElement>(fixture, '[data-pick="weekly_dilr"]');
    boxes[1].click();
    boxes[0].click();
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '[data-add-queue="weekly_dilr"]').click();
    const request = http.expectOne(`${API}/api/admin/releases`);
    expect(request.request.body).toEqual({ kind: 'weekly_dilr', passage_ids: ['p2', 'p1'] });
    request.flush([]);
    await settle(fixture);
    http.expectOne(`${API}/api/admin/releases/weekly_dilr`).flush(list('weekly_dilr', 'queue'));
    await settle(fixture);
  });

  it('saves how the kind is added', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '[data-save-schedule="weekly_dilr"]').click();
    const request = http.expectOne(`${API}/api/admin/releases/weekly_dilr/schedule`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ mode: 'queue', start: null });
    request.flush({ mode: 'queue', start: null });
    await settle(fixture);
    expect(all(fixture, '[data-saved="weekly_dilr"]').length).toBe(1);
  });

  it('removes a release after the admin confirms', async () => {
    const { fixture, http } = await open(list('daily_rc', 'self', [{ id: 'r9', kind: 'daily_rc', passage_id: 'p1', title: 'Trade routes', date: '2026-12-02' }]));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    el<HTMLButtonElement>(fixture, '[data-release-id="r9"] button').click();
    http.expectOne(`${API}/api/admin/releases/r9`).flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/releases/daily_rc`).flush(list('daily_rc', 'self'));
    await settle(fixture);
    expect(all(fixture, '[data-release-id]').length).toBe(0);
  });
});

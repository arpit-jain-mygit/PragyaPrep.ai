import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { TodaysPassages } from './todays-passages';

const TODAY = {
  daily_rc: { id: 'p1', title: 'Trade routes', text: 'Line one.\nLine two.', date: '2026-11-21' },
  weekly_dilr: { id: 'p2', title: 'Seating plan', text: 'Set text.', date: '2026-11-16' },
};

async function open(answer: Record<string, unknown> = TODAY, on = true) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  if (!on) env.tenants.info.set({ ...env.tenants.info()!, features: [{ key: 'daily_rc', group: 'Practice', label: 'Daily RC', enabled: false }, { key: 'weekly_dilr', group: 'Practice', label: 'Weekly DILR', enabled: false }] } as never);
  const fixture = TestBed.createComponent(TodaysPassages);
  fixture.detectChanges();
  if (on) env.http.expectOne(`${API}/api/my/releases/today`).flush(answer);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Daily RC and Weekly DILR cards', () => {
  it('shows the title and date, and the passage text opens only when asked', async () => {
    const { fixture } = await open();
    expect(el(fixture, '#daily-rc-card [data-title]').textContent).toContain('Trade routes');
    expect(all(fixture, '[data-text-daily]').length).toBe(0);
    el<HTMLButtonElement>(fixture, '[data-toggle-daily]').click();
    await settle(fixture);
    expect(el(fixture, '[data-text-daily]').textContent).toContain('Line two.');
  });

  it('shows the weekly set too, and leaves out a card with nothing released', async () => {
    const { fixture } = await open({ daily_rc: null, weekly_dilr: TODAY.weekly_dilr });
    expect(all(fixture, '#daily-rc-card').length).toBe(0);
    expect(el(fixture, '#weekly-dilr-card [data-title]').textContent).toContain('Seating plan');
  });

  it('asks for nothing when both are switched off', async () => {
    const { fixture, http } = await open(TODAY, false);
    expect(all(fixture, '.passage-card').length).toBe(0);
    http.expectNone(`${API}/api/my/releases/today`);
  });
});

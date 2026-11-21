import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { YesterdayWinnersCard } from './yesterday-winners';

const WINNERS = {
  day: '2026-11-20',
  top: [
    { rank: 1, name: 'Bilal K.', oranges: 9, me: false },
    { rank: 2, name: 'Asha R.', oranges: 4, me: true },
  ],
  me_in_top: true,
};

async function open(winners: unknown, on = true) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  if (!on) env.tenants.info.set({ ...env.tenants.info()!, features: [{ key: 'yesterday_winners', group: 'Dashboard', label: "Yesterday's winners", enabled: false }] } as never);
  const fixture = TestBed.createComponent(YesterdayWinnersCard);
  fixture.detectChanges();
  if (on) env.http.expectOne(`${API}/api/my/yesterday-winners`).flush({ yesterday_winners: winners });
  await settle(fixture);
  return { ...env, fixture };
}

describe('Yesterday\'s winners card', () => {
  it('lists the top three in rank order and marks the student\'s own row', async () => {
    const { fixture } = await open(WINNERS);
    expect(all(fixture, '[data-rank]').map((row) => row.getAttribute('data-rank'))).toEqual(['1', '2']);
    expect(el(fixture, '.me').textContent).toContain('(you)');
    expect(all(fixture, '#not-in-winners').length).toBe(0);
  });

  it('invites a student who is not on the list to collect oranges', async () => {
    const { fixture } = await open({ ...WINNERS, me_in_top: false });
    expect(el(fixture, '#not-in-winners').textContent).toContain('Collect oranges today');
  });

  it('says so when nobody collected oranges yesterday', async () => {
    const { fixture } = await open({ day: '2026-11-20', top: [], me_in_top: false });
    expect(el(fixture, '#no-winners').textContent).toContain('Nobody collected oranges yesterday.');
  });

  it('shows nothing and does not ask when the institute has the card switched off', async () => {
    const { fixture, http } = await open(WINNERS, false);
    expect(all(fixture, '#yesterday-winners').length).toBe(0);
    http.expectNone(`${API}/api/my/yesterday-winners`);
  });
});

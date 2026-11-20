import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { LeaderboardCard } from './leaderboard';

const BOARD = {
  days: 7,
  top: [
    { rank: 1, name: 'Bilal C.', oranges: 9, me: false },
    { rank: 2, name: 'Asha V.', oranges: 4, me: true },
  ],
  me: { rank: 2, name: 'Asha V.', oranges: 4, me: true },
};

async function open(board: unknown, on = true) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  if (!on) env.tenants.info.set({ ...env.tenants.info()!, features: [{ key: 'leaderboard', group: 'Dashboard', label: 'Leaderboard', enabled: false }] } as never);
  const fixture = TestBed.createComponent(LeaderboardCard);
  fixture.detectChanges();
  if (on) env.http.expectOne(`${API}/api/my/leaderboard`).flush({ leaderboard: board });
  await settle(fixture);
  return { ...env, fixture };
}

describe('Leaderboard card', () => {
  it('lists the top students in rank order and marks the student\'s own row', async () => {
    const { fixture } = await open(BOARD);
    expect(all(fixture, '[data-rank]').map((row) => row.getAttribute('data-rank'))).toEqual(['1', '2']);
    expect(el(fixture, '.me').textContent).toContain('(you)');
    expect(all(fixture, '#my-rank').length).toBe(0);
  });

  it('says where the student stands when they are outside the top list', async () => {
    const { fixture } = await open({ days: 7, top: [{ rank: 1, name: 'Bilal C.', oranges: 9, me: false }], me: { rank: 12, name: 'Asha V.', oranges: 1, me: true } });
    expect(el(fixture, '#my-rank').textContent).toContain('You are 12th with 1 orange.');
  });

  it('says so when nobody has collected any oranges yet', async () => {
    const { fixture } = await open({ days: 7, top: [], me: null });
    expect(el(fixture, '#no-leaders').textContent).toContain('No oranges collected yet.');
  });

  it('shows nothing when the institute has the leaderboard switched off, and does not ask for it', async () => {
    const { fixture, http } = await open(BOARD, false);
    expect(all(fixture, '#leaderboard').length).toBe(0);
    http.expectNone(`${API}/api/my/leaderboard`);
  });
});

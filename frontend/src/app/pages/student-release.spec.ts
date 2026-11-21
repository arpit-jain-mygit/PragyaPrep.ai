import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, el, sessionFor, settle, setupTestBed } from '../testing';
import { StudentRelease } from './student-release';

describe('Daily RC and Weekly DILR page', () => {
  it('shows the passage for today and attempts it as a test', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentRelease);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/releases/today`).flush({
      daily_rc: { id: 'p1', title: 'Passage A', text: 'Read this.', date: '2026-11-20' },
      weekly_dilr: null,
    });
    await settle(fixture);
    env.http.expectOne(`${API}/api/my/releases/daily_rc/history`).flush({ releases: [] });
    await settle(fixture);
    expect(el(fixture, '#release-passage').textContent).toContain('Read this.');
    el<HTMLButtonElement>(fixture, '#release-attempt').click();
    env.http.expectOne(`${API}/api/my/releases/daily_rc/attempt`).flush({ id: 't9', title: 'Daily RC', question_count: 2 }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    expect(env.navigate).toHaveBeenCalledWith(['/', 'demo', 'tests', 't9']);
  });

  it('says so when nothing is set for today', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentRelease);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/releases/today`).flush({ daily_rc: null, weekly_dilr: null });
    await settle(fixture);
    env.http.expectOne(`${API}/api/my/releases/daily_rc/history`).flush({ releases: [] });
    await settle(fixture);
    expect(el(fixture, '#release-empty').textContent).toContain('Nothing is set for today yet.');
  });

  it('lists earlier passages, with a link to the review of any the student has attempted', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentRelease);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/releases/today`).flush({ daily_rc: null, weekly_dilr: null });
    await settle(fixture);
    env.http.expectOne(`${API}/api/my/releases/daily_rc/history`).flush({
      releases: [
        { id: 'r2', date: '2026-11-20', title: 'Passage B', current: true, attempted: true, practice_id: 't7' },
        { id: 'r1', date: '2026-11-19', title: 'Passage A', current: false, attempted: false, practice_id: null },
      ],
    });
    await settle(fixture);
    expect(el(fixture, '[data-release="r2"]').textContent).toContain('Passage B');
    expect(el(fixture, '[data-release="r2"] a').getAttribute('href')).toContain('/demo/tests/t7');
    expect(el(fixture, '[data-release="r1"]').textContent).toContain('Not attempted');
  });
});

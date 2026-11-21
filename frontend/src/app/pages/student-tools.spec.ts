import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { StudentCutoffs } from './student-cutoffs';
import { StudentEligibility } from './student-eligibility';

const COLLEGES = [
  { id: 'c1', name: 'IIM Indore', rules: [{ type: 'dob_on_or_after', value: '2007-08-01' }, { type: 'min_tenth_percent', value: 60 }] },
];

describe('Eligibility checker', () => {
  it('shows each college as pending until the details are typed, then checks them', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentEligibility);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/eligibility`).flush(COLLEGES);
    await settle(fixture);
    expect(el(fixture, '[data-college="c1"]').getAttribute('data-verdict')).toBe('pending');

    const dob = el<HTMLInputElement>(fixture, '#dob');
    dob.value = '2008-01-15';
    dob.dispatchEvent(new Event('input'));
    const tenth = el<HTMLInputElement>(fixture, '#tenth-percent');
    tenth.value = '72';
    tenth.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(el(fixture, '[data-college="c1"]').getAttribute('data-verdict')).toBe('eligible');
  });

  it('names the rule a student does not meet', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentEligibility);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/eligibility`).flush(COLLEGES);
    await settle(fixture);
    const tenth = el<HTMLInputElement>(fixture, '#tenth-percent');
    tenth.value = '40';
    tenth.dispatchEvent(new Event('input'));
    const dob = el<HTMLInputElement>(fixture, '#dob');
    dob.value = '2008-01-15';
    dob.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(el(fixture, '[data-college="c1"]').getAttribute('data-verdict')).toBe('not_eligible');
    expect(el(fixture, '[data-college="c1"]').textContent).toContain('10th: 60%+');
  });
});

describe('Cutoffs', () => {
  it('lists the cutoffs for the first college and the latest year', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentCutoffs);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/colleges`).flush([{ id: 'c1', name: 'IIM Indore', years: [2026] }]);
    await settle(fixture);
    env.http.expectOne((request) => request.url === `${API}/api/my/cutoffs`).flush({
      college: { id: 'c1', name: 'IIM Indore' }, years: [2026], year: 2026,
      rows: [
        { id: 'a', year: 2026, category: 'General', section: 'SA', cutoff: 28, seats: 53, applicants: 9000, qualified: 300 },
        { id: 'b', year: 2026, category: 'General', section: 'VA', cutoff: 111, seats: 53, applicants: 9000, qualified: 300 },
      ],
    });
    await settle(fixture);
    expect(all(fixture, '[data-category]').map((node) => node.getAttribute('data-category'))).toEqual(['General']);
    expect(el(fixture, '[data-category="General"]').textContent).toContain('28');
    expect(el(fixture, '[data-category="General"]').textContent).toContain('111');
  });

  it('says so when a college has no cutoffs yet', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentCutoffs);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/colleges`).flush([{ id: 'c1', name: 'IIM Indore', years: [] }]);
    await settle(fixture);
    env.http.expectOne((request) => request.url === `${API}/api/my/cutoffs`).flush({ college: { id: 'c1', name: 'IIM Indore' }, years: [], year: null, rows: [] });
    await settle(fixture);
    expect(el(fixture, '#cutoffs-empty').textContent).toContain('No cutoffs');
  });
});

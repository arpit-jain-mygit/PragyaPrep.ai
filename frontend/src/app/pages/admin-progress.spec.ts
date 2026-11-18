import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { timeAgo } from '../core/format';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminProgress } from './admin-progress';

const COURSES = [
  { id: 'c1', name: 'CAT', fee: 0, access: { type: 'unlimited' }, papers: [], active: true, created_at: '' },
  { id: 'c2', name: 'CLAT', fee: 0, access: { type: 'unlimited' }, papers: [], active: true, created_at: '' },
  { id: 'c3', name: 'Old', fee: 0, access: { type: 'unlimited' }, papers: [], active: false, created_at: '' },
];

function row(overrides: object = {}) {
  return {
    email: 'asha@example.com', name: 'Asha Rao', status: 'behind', cw_done: 3, cw_total: 10, cw_overdue: 2, tests_taken: 2, tests_available: 5,
    tests_overdue: 1, avg_percent: 61.5, overdue: 3, last_active: '2027-01-10T10:00:00+05:30', ...overrides,
  };
}

function progress(students: object[] = [row()], overrides: object = {}) {
  const count = (status: string) => students.filter((s) => (s as { status: string }).status === status).length;
  return {
    course: { id: 'c1', name: 'CAT' },
    summary: { students: students.length, behind: count('behind'), not_started: count('not_started'), on_track: count('on_track'), subtopics: 10, tests: 5, ...overrides },
    students,
  };
}

const PEOPLE = [
  row(),
  row({ email: 'ravi@example.com', name: 'Ravi Nair', status: 'not_started', cw_done: 0, cw_overdue: 0, tests_taken: 0, tests_overdue: 0, avg_percent: null, overdue: 0, last_active: null }),
  row({ email: 'meera@example.com', name: 'Meera Shah', status: 'on_track', cw_done: 10, cw_overdue: 0, tests_taken: 5, tests_overdue: 0, avg_percent: 88, overdue: 0, last_active: '2027-01-14T10:00:00+05:30' }),
];

async function open(data: object = progress(PEOPLE), courses: object[] = COURSES) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminProgress);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/courses`).flush(courses);
  await settle(fixture);
  if (courses.length) env.http.expectOne(`${API}/api/admin/progress/${(courses[0] as { id: string }).id}`).flush(data);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Admin progress page', () => {
  it('starts on the first open course and shows the counts', async () => {
    const { fixture } = await open();
    expect(Array.from(el<HTMLSelectElement>(fixture, '#course').options).map((o) => o.textContent!.trim())).toEqual(['CAT', 'CLAT']);
    expect(['#c-students', '#c-behind', '#c-notstarted', '#c-ontrack'].map((s) => el(fixture, s).textContent!.trim())).toEqual(['3', '1', '1', '1']);
  });

  it('lists each student with coursework, tests, last active and status, with a link to the student page', async () => {
    const { fixture } = await open();
    const asha = el(fixture, '[data-student="asha@example.com"]');
    const content = asha.textContent!.replace(/\s+/g, ' ');
    expect(content).toContain('Asha Rao');
    expect(content).toContain('3/10');
    expect(content).toContain('2 overdue');
    expect(content).toContain('2 of 5');
    expect(content).toContain('61.5%');
    expect(content).toContain('1 missed');
    expect(content).toContain('Behind');
    expect(asha.querySelector('a')!.getAttribute('href')).toBe('/demo/admin/progress/c1/asha@example.com');
    expect(el(fixture, '[data-student="ravi@example.com"]').textContent).toContain('never');
    expect(el(fixture, '[data-student="ravi@example.com"]').textContent).toContain('Not started');
    expect(el(fixture, '[data-student="meera@example.com"] .status.ok').textContent).toContain('On track');
  });

  it('searches by name or email and can show only those behind', async () => {
    const { fixture } = await open();
    type(fixture, '#search', 'meera');
    await settle(fixture);
    expect(all(fixture, '[data-student]').map((r) => r.getAttribute('data-student'))).toEqual(['meera@example.com']);
    expect(el(fixture, '#showing').textContent).toContain('Showing 1 of 3');
    type(fixture, '#search', '');
    el(fixture, '#behind-only').click();
    await settle(fixture);
    expect(all(fixture, '[data-student]').map((r) => r.getAttribute('data-student'))).toEqual(['asha@example.com']);
    type(fixture, '#search', 'zzz');
    await settle(fixture);
    expect(text(fixture)).toContain('No students match');
  });

  it('says so when the course has no students', async () => {
    const { fixture } = await open(progress([]));
    expect(text(fixture)).toContain('No students with access to this course');
  });

  it('loads another course when it is picked', async () => {
    const { fixture, http } = await open();
    type(fixture, '#course', 'c2');
    http.expectOne(`${API}/api/admin/progress/c2`).flush({ ...progress([row({ email: 'zed@example.com', name: 'Zed Khan' })]), course: { id: 'c2', name: 'CLAT' } });
    await settle(fixture);
    expect(all(fixture, '[data-student]').map((r) => r.getAttribute('data-student'))).toEqual(['zed@example.com']);
    expect(el(fixture, '[data-student] a').getAttribute('href')).toBe('/demo/admin/progress/c2/zed@example.com');
  });

  it('shows where students get stuck, loaded when the tab is opened, least finished first', async () => {
    const { fixture, http } = await open();
    expect(all(fixture, '#stuck').length).toBe(0);
    el(fixture, '#tab-stuck').click();
    http.expectOne(`${API}/api/admin/progress/c1/stuck`).flush({
      course: { id: 'c1', name: 'CAT' }, students: 40,
      subtopics: [
        { id: 'a', title: 'Examples', topic: 'Percentages', subject: 'Quantitative Ability', due: '2027-01-10', done: 7, students: 40, percent: 18 },
        { id: 'b', title: 'Concepts', topic: 'Percentages', subject: 'Quantitative Ability', due: null, done: 30, students: 40, percent: 75 },
      ],
    });
    await settle(fixture);
    expect(all(fixture, '[data-stuck]').map((r) => r.getAttribute('data-stuck'))).toEqual(['Examples', 'Concepts']);
    const first = el(fixture, '[data-stuck="Examples"]').textContent!.replace(/\s+/g, ' ');
    expect(first).toContain('Quantitative Ability › Percentages');
    expect(first).toContain('10 Jan 2027');
    expect(first).toContain('7 of 40');
    expect(el(fixture, '[data-stuck="Concepts"]').textContent).toContain('-');
    el(fixture, '#tab-students').click();
    await settle(fixture);
    expect(all(fixture, '#students').length).toBe(1);
    el(fixture, '#tab-stuck').click();
    await settle(fixture);
    http.expectNone(`${API}/api/admin/progress/c1/stuck`);
  });

  it('says so when there is no published coursework', async () => {
    const { fixture, http } = await open();
    el(fixture, '#tab-stuck').click();
    http.expectOne(`${API}/api/admin/progress/c1/stuck`).flush({ course: { id: 'c1', name: 'CAT' }, students: 0, subtopics: [] });
    await settle(fixture);
    expect(text(fixture)).toContain('No published coursework in this course yet');
  });

  it('downloads every student as a CSV, whatever the filters show', async () => {
    const { fixture } = await open();
    let content = '';
    const link = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValueOnce(link);
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      void (blob as Blob).text().then((t) => (content = t));
      return 'blob:x';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    type(fixture, '#search', 'meera');
    await settle(fixture);
    el(fixture, '#download-csv').click();
    await new Promise((r) => setTimeout(r, 20));
    expect(link.download).toBe('cat-progress.csv');
    const lines = content.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('Student,Email,Status,Coursework done,Coursework total,Coursework overdue,Tests taken,Tests available,Tests missed,Average %,Last active');
    expect(lines.length).toBe(4);
    expect(lines[1]).toContain('Asha Rao,asha@example.com,Behind,3,10,2,2,5,1,61.5');
    expect(lines[2]).toContain('Ravi Nair,ravi@example.com,Not started,0,10,0,0,5,0,,');
  });

  it('explains a failure and says so when there are no courses', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(AdminProgress);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/admin/courses`).flush([]);
    await settle(fixture);
    expect(text(fixture)).toContain('No courses yet');

    const failing = TestBed.createComponent(AdminProgress);
    failing.detectChanges();
    env.http.expectOne(`${API}/api/admin/courses`).flush(COURSES);
    await settle(failing);
    env.http.expectOne(`${API}/api/admin/progress/c1`).flush({ detail: "We couldn't find that course." }, { status: 404, statusText: 'x' });
    await settle(failing);
    expect(text(failing)).toContain("We couldn't find that course.");
  });
});

describe('Admin progress: reminders', () => {
  const RESULT = { reminded: 2, skipped: 1, not_behind: 0, emailed: 2, email_failed: 0 };

  it('shows how many are behind on the Remind button, and is off when nobody is', async () => {
    const { fixture } = await open();
    expect(el(fixture, '#remind').textContent!.trim()).toBe('Remind 1');
    expect((el(fixture, '#remind') as HTMLButtonElement).disabled).toBe(false);
  });

  it('turns Remind off when nobody is behind', async () => {
    const { fixture } = await open(progress([row({ status: 'on_track', overdue: 0 })]));
    expect(el(fixture, '#remind').textContent!.trim()).toBe('Remind 0');
    expect((el(fixture, '#remind') as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks first, saying who and in which course, then sends with the email tick and shows the result', async () => {
    const { fixture, http } = await open();
    expect(all(fixture, '#remind-panel').length).toBe(0);
    el(fixture, '#remind').click();
    await settle(fixture);
    expect(el(fixture, '#remind-panel').textContent).toContain('1 student behind in CAT');
    expect(el<HTMLInputElement>(fixture, '#remind-email').checked).toBe(true);
    el(fixture, '#remind-send').click();
    const request = http.expectOne(`${API}/api/admin/reminders`);
    expect(request.request.body).toEqual({ course_id: 'c1', emails: null, send_email: true });
    request.flush(RESULT);
    await settle(fixture);
    const note = el(fixture, '#remind-result').textContent!.replace(/\s+/g, ' ');
    expect(note).toContain('Reminded 2 students');
    expect(note).toContain('1 skipped, already reminded');
    expect(note).toContain('2 emailed');
    expect(all(fixture, '#remind-panel').length).toBe(0);
  });

  it('can send without the email', async () => {
    const { fixture, http } = await open();
    el(fixture, '#remind').click();
    await settle(fixture);
    el(fixture, '#remind-email').click();
    el(fixture, '#remind-send').click();
    const request = http.expectOne(`${API}/api/admin/reminders`);
    expect(request.request.body.send_email).toBe(false);
    request.flush({ ...RESULT, emailed: 0 });
    await settle(fixture);
    expect(el(fixture, '#remind-result').textContent).not.toContain('emailed');
  });

  it('cancels without sending', async () => {
    const { fixture, http } = await open();
    el(fixture, '#remind').click();
    await settle(fixture);
    all(fixture, '#remind-panel button').find((b) => b.textContent!.trim() === 'Cancel')!.click();
    await settle(fixture);
    expect(all(fixture, '#remind-panel').length).toBe(0);
    http.expectNone(`${API}/api/admin/reminders`);
  });

  it('shows why a reminder failed and keeps the panel open', async () => {
    const { fixture, http } = await open();
    el(fixture, '#remind').click();
    await settle(fixture);
    el(fixture, '#remind-send').click();
    http.expectOne(`${API}/api/admin/reminders`).flush({ detail: "We couldn't find that course." }, { status: 404, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain("We couldn't find that course.");
    expect(all(fixture, '#remind-panel').length).toBe(1);
  });

  it('forgets the last result when another course is picked', async () => {
    const { fixture, http } = await open();
    el(fixture, '#remind').click();
    await settle(fixture);
    el(fixture, '#remind-send').click();
    http.expectOne(`${API}/api/admin/reminders`).flush(RESULT);
    await settle(fixture);
    expect(all(fixture, '#remind-result').length).toBe(1);
    type(fixture, '#course', 'c2');
    http.expectOne(`${API}/api/admin/progress/c2`).flush({ ...progress([]), course: { id: 'c2', name: 'CLAT' } });
    await settle(fixture);
    expect(all(fixture, '#remind-result').length).toBe(0);
  });
});

describe('timeAgo', () => {
  const now = new Date('2027-01-15T12:00:00+05:30').getTime();
  it.each([
    [null, 'never'],
    ['2027-01-15T11:59:30+05:30', 'just now'],
    ['2027-01-15T11:30:00+05:30', '30 min ago'],
    ['2027-01-15T11:00:00+05:30', '1 hour ago'],
    ['2027-01-15T07:00:00+05:30', '5 hours ago'],
    ['2027-01-14T11:00:00+05:30', '1 day ago'],
    ['2027-01-06T12:00:00+05:30', '9 days ago'],
    ['garbage', 'garbage'],
  ])('writes %s as %s', (value, expected) => {
    expect(timeAgo(value as string | null, now)).toBe(expected);
  });
});

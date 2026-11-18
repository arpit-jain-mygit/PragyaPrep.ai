import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { StudentHome } from './student-home';

const base = {
  description: '', start_at: null, end_at: null, duration_minutes: 30, max_attempts: 2, pass_percentage: 40, marks_correct: '1', marks_incorrect: '0',
  show_answers: true, question_count: 5, total_marks: '5', attempts_used: 0, attempts_left: 2, in_progress: null, best: null, attempts: [],
};
const me = { email: 'asha@example.com', first_name: 'Asha', last_name: 'Rao', role: 'student', status: 'approved' };
const summary = { tests_taken: 4, attempts: 6, in_progress: 0, average: '62.5', best: '90', tests_passed: 3 };

const NO_WORK = { summary: { total: 0, done: 0, left: 0, overdue: 0, this_week: 0 }, courses: [] };

async function openHome(replies: { tests?: object[] | number; courses?: object[] | number; results?: object | number; coursework?: object | number } = {}) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(StudentHome);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/auth/me`).flush(me);
  await settle(fixture);
  const reply = (url: string, value: object | number | undefined, fallback: object) => {
    const request = env.http.expectOne(`${API}${url}`);
    if (typeof value === 'number') request.flush({ detail: 'x' }, { status: value, statusText: 'x' });
    else request.flush(value ?? fallback);
  };
  reply('/api/my/tests', replies.tests, []);
  reply('/api/my/courses', replies.courses, []);
  reply('/api/my/coursework', replies.coursework, NO_WORK);
  reply('/api/my/results', replies.results, { summary: { ...summary, attempts: 0, tests_taken: 0, tests_passed: 0, average: null, best: null }, trend: [], attempts: [], subjects: [] });
  await settle(fixture);
  return { ...env, fixture };
}

const num = (fixture: unknown, selector: string) => el(fixture as never, selector).textContent!.trim();

describe('Student home', () => {
  it('greets the student and shows tiles for tests, courses and results', async () => {
    const { fixture } = await openHome();
    expect(text(fixture)).toContain('Welcome, Asha');
    expect(text(fixture)).toContain('asha@example.com');
    expect(all(fixture, 'a.tile').map((a) => a.getAttribute('id'))).toEqual(['tile-tests', 'tile-courses', 'tile-results']);
    expect(all(fixture, 'a.tile').map((a) => a.getAttribute('href'))).toEqual(['/demo/tests', '/demo/courses', '/demo/results']);
  });

  it('counts tests to take: overdue, this week and later', async () => {
    const { fixture } = await openHome({
      tests: [
        { ...base, id: 'a', title: 'Slow', state: 'open', minutes_left: 20000 },
        { ...base, id: 'b', title: 'Urgent', state: 'open', minutes_left: 120 },
        { ...base, id: 'c', title: 'Missed', state: 'ended', overdue: true },
        { ...base, id: 'd', title: 'Opens soon', state: 'upcoming', opens_in_minutes: 4000 },
        { ...base, id: 'e', title: 'Opens late', state: 'upcoming', opens_in_minutes: 30000 },
        { ...base, id: 'f', title: 'Any time', state: 'open', minutes_left: null },
        { ...base, id: 'g', title: 'Already taken', state: 'open', minutes_left: 100, attempts_used: 1 },
        { ...base, id: 'h', title: 'Old', state: 'ended', attempts_used: 1 },
      ],
    });
    expect(num(fixture, '#tile-tests [data-total]')).toBe('6');
    expect(num(fixture, '#tile-tests [data-overdue]')).toBe('1 overdue');
    expect(num(fixture, '#tile-tests [data-week]')).toBe('2 this week');
    expect(num(fixture, '#tile-tests [data-later]')).toBe('3 later');
    expect(el(fixture, '#tile-tests').className).toContain('alert-tile');
  });

  it('shows zero counts and no overdue chip when there is nothing to take', async () => {
    const { fixture } = await openHome();
    expect(num(fixture, '#tile-tests [data-total]')).toBe('0');
    expect(num(fixture, '#tile-tests [data-week]')).toBe('0 this week');
    expect(all(fixture, '#tile-tests [data-overdue]').length).toBe(0);
    expect(el(fixture, '#tile-tests').className).not.toContain('alert-tile');
  });

  it('has a Continue tile only while a test is in progress', async () => {
    const { fixture } = await openHome({ tests: [{ ...base, id: 'p', title: 'Half done', state: 'open', in_progress: 1, attempts_used: 1, minutes_left: 500 }] });
    expect(num(fixture, '#tile-continue [data-running]')).toBe('1');
    expect(el(fixture, '#tile-continue').getAttribute('title')).toBe('Half done');
    expect(el(fixture, '#tile-continue').getAttribute('href')).toBe('/demo/tests/p');
    expect(num(fixture, '#tile-tests [data-total]')).toBe('0');
  });

  it('counts the courses', async () => {
    const { fixture } = await openHome({
      courses: [
        { id: '1', name: 'CAT', expires_at: null, files: [] },
        { id: '2', name: 'CLAT', expires_at: null, files: [] },
        { id: '3', name: 'IPMAT', expires_at: null, files: [] },
      ],
    });
    expect(num(fixture, '#tile-courses [data-courses]')).toBe('3');
    expect(el(fixture, '#tile-courses').textContent).toContain('Courses');
  });

  it('shows the number of attempts with the average and passes, and a weak subjects tile when a subject is below 50%', async () => {
    const { fixture } = await openHome({
      results: {
        summary, trend: [], attempts: [],
        subjects: [
          { id: 's1', name: 'Logical Reasoning', correct: 3, questions: 10, accuracy: '30.0', topics: [] },
          { id: 's2', name: 'Verbal', correct: 4, questions: 10, accuracy: '40.0', topics: [] },
          { id: 's3', name: 'Quant', correct: 9, questions: 10, accuracy: '90.0', topics: [] },
        ],
      },
    });
    expect(num(fixture, '#tile-results [data-attempts]')).toBe('6');
    expect(el(fixture, '#tile-results').textContent).toContain('62.5% avg');
    expect(el(fixture, '#tile-results').textContent).toContain('3 of 4 passed');
    expect(num(fixture, '#tile-weak [data-weak]')).toBe('2');
    expect(el(fixture, '#tile-weak').getAttribute('title')).toBe('Weakest: Logical Reasoning');
  });

  it('leaves out the weak subjects tile when nothing is weak', async () => {
    const { fixture } = await openHome({ results: { summary, trend: [], attempts: [], subjects: [{ id: 's', name: 'Quant', correct: 9, questions: 10, accuracy: '90.0', topics: [] }] } });
    expect(all(fixture, '#tile-weak').length).toBe(0);
  });

  it('has a coursework tile with the count left, overdue and due this week, only when there is coursework', async () => {
    const { fixture } = await openHome({ coursework: { summary: { total: 10, done: 4, left: 6, overdue: 2, this_week: 3 }, courses: [] } });
    expect(num(fixture, '#tile-coursework [data-left]')).toBe('6');
    expect(num(fixture, '#tile-coursework [data-cw-overdue]')).toBe('2 overdue');
    expect(num(fixture, '#tile-coursework [data-cw-week]')).toBe('3 this week');
    expect(el(fixture, '#tile-coursework').getAttribute('href')).toBe('/demo/coursework');
    expect(el(fixture, '#tile-coursework').className).toContain('alert-tile');
    expect(el(fixture, '#tile-coursework').textContent).toContain('Coursework');
  });

  it('shows all done, and no overdue chip, when everything is complete', async () => {
    const { fixture } = await openHome({ coursework: { summary: { total: 5, done: 5, left: 0, overdue: 0, this_week: 0 }, courses: [] } });
    expect(num(fixture, '#tile-coursework [data-left]')).toBe('0');
    expect(all(fixture, '#tile-coursework [data-alldone]').length).toBe(1);
    expect(all(fixture, '#tile-coursework [data-cw-overdue], #tile-coursework [data-cw-week]').length).toBe(0);
    expect(el(fixture, '#tile-coursework').className).not.toContain('alert-tile');
  });

  it('keeps the other tiles when one call fails', async () => {
    const { fixture } = await openHome({ tests: 500, coursework: 500, courses: [{ id: '1', name: 'CAT', expires_at: null, files: [] }] });
    expect(num(fixture, '#tile-courses [data-courses]')).toBe('1');
    expect(num(fixture, '#tile-tests [data-total]')).toBe('0');
    expect(text(fixture)).toContain('Welcome, Asha');
  });

  it('shows a message if the session cannot be checked', async () => {
    const env = setupTestBed();
    const fixture = TestBed.createComponent(StudentHome);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/auth/me`).flush({ detail: 'Sign in first.' }, { status: 401, statusText: 'Unauthorized' });
    await settle(fixture);
    expect(text(fixture)).toContain('Sign in first.');
    expect(all(fixture, 'a.tile').length).toBe(0);
  });
});

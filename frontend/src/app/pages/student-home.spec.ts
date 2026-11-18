import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { TenantService } from '../core/tenant.service';
import { StudentHome } from './student-home';

const base = {
  description: '', start_at: null, end_at: null, duration_minutes: 30, max_attempts: 2, pass_percentage: 40, marks_correct: '1', marks_incorrect: '0',
  show_answers: true, question_count: 5, total_marks: '5', attempts_used: 0, attempts_left: 2, in_progress: null, best: null, attempts: [],
};
const me = { email: 'asha@example.com', first_name: 'Asha', last_name: 'Rao', role: 'student', status: 'approved' };
const summary = { tests_taken: 4, attempts: 6, in_progress: 0, average: '62.5', best: '90', tests_passed: 3 };

const NO_WORK = { summary: { total: 0, done: 0, left: 0, overdue: 0, this_week: 0 }, courses: [] };

async function openHome(replies: { tests?: object[] | number; results?: object | number; coursework?: object | number; notices?: object | number } = {}) {
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
  reply('/api/my/coursework', replies.coursework, NO_WORK);
  reply('/api/my/notices', replies.notices, { unread: 0, action_unread: 0, notices: [] });
  reply('/api/my/results', replies.results, { summary: { ...summary, attempts: 0, tests_taken: 0, tests_passed: 0, average: null, best: null }, trend: [], attempts: [], subjects: [] });
  await settle(fixture);
  return { ...env, fixture };
}

const num = (fixture: unknown, selector: string) => el(fixture as never, selector).textContent!.trim();

describe('Student home', () => {
  it('shows the student\'s photo beside the greeting', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentHome);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/auth/me`).flush({ ...me, avatar_url: 'https://files.example/asha.jpg' });
    await settle(fixture);
    expect(el(fixture, '.greeting img.avatar').getAttribute('src')).toBe('https://files.example/asha.jpg');
  });

  it('shows initials beside the greeting when there is no photo', async () => {
    const { fixture } = await openHome();
    expect(all(fixture, '.greeting img').length).toBe(0);
    expect(el(fixture, '.greeting span.avatar').textContent!.trim()).toBe('AR');
  });

  it('greets the student and shows tiles for My Learning and results', async () => {
    const { fixture } = await openHome();
    expect(text(fixture)).toContain('Welcome, Asha');
    expect(text(fixture)).toContain('asha@example.com');
    expect(all(fixture, 'a.tile').map((a) => a.getAttribute('id'))).toEqual(['tile-learning', 'tile-results']);  // no Notices tile until there is a notice
    expect(all(fixture, 'a.tile').map((a) => a.getAttribute('href'))).toEqual(['/demo/learning/tests', '/demo/learning/results']);
    expect(el(fixture, '#tile-learning').textContent).toContain('My Learning');
  });

  it('adds up coursework left and tests to take, with the split and the overdue count', async () => {
    const { fixture } = await openHome({
      tests: [
        { ...base, id: 'a', title: 'Slow', state: 'open', minutes_left: 20000 },
        { ...base, id: 'b', title: 'Urgent', state: 'open', minutes_left: 120 },
        { ...base, id: 'c', title: 'Missed', state: 'ended', overdue: true },
        { ...base, id: 'd', title: 'Opens soon', state: 'upcoming', opens_in_minutes: 4000 },
        { ...base, id: 'g', title: 'Already taken', state: 'open', minutes_left: 100, attempts_used: 1 },
        { ...base, id: 'h', title: 'Old', state: 'ended', attempts_used: 1 },
      ],
      coursework: { summary: { total: 10, done: 4, left: 6, overdue: 2, this_week: 3 }, courses: [] },
    });
    expect(num(fixture, '#tile-learning [data-total]')).toBe('10');  // 4 tests + 6 coursework
    expect(num(fixture, '#tile-learning [data-tests]')).toBe('4 tests');
    expect(num(fixture, '#tile-learning [data-coursework]')).toBe('6 coursework');
    expect(num(fixture, '#tile-learning [data-overdue]')).toBe('3 overdue');  // 1 test + 2 coursework
    expect(el(fixture, '#tile-learning').className).toContain('alert-tile');
    expect(el(fixture, '#tile-learning').getAttribute('href')).toBe('/demo/learning');
  });

  it('opens the Tests tab when there is no coursework left', async () => {
    const { fixture } = await openHome({
      tests: [{ ...base, id: 'a', title: 'Slow', state: 'open', minutes_left: 20000 }],
      coursework: { summary: { total: 5, done: 5, left: 0, overdue: 0, this_week: 0 }, courses: [] },
    });
    expect(num(fixture, '#tile-learning [data-total]')).toBe('1');
    expect(el(fixture, '#tile-learning').getAttribute('href')).toBe('/demo/learning/tests');
  });

  it('shows zero counts and no overdue chip when there is nothing to do', async () => {
    const { fixture } = await openHome();
    expect(num(fixture, '#tile-learning [data-total]')).toBe('0');
    expect(num(fixture, '#tile-learning [data-tests]')).toBe('0 tests');
    expect(num(fixture, '#tile-learning [data-coursework]')).toBe('0 coursework');
    expect(all(fixture, '#tile-learning [data-overdue]').length).toBe(0);
    expect(el(fixture, '#tile-learning').className).not.toContain('alert-tile');
  });

  it('has a Continue tile only while a test is in progress', async () => {
    const { fixture } = await openHome({ tests: [{ ...base, id: 'p', title: 'Half done', state: 'open', in_progress: 1, attempts_used: 1, minutes_left: 500 }] });
    expect(num(fixture, '#tile-continue [data-running]')).toBe('1');
    expect(el(fixture, '#tile-continue').getAttribute('title')).toBe('Half done');
    expect(el(fixture, '#tile-continue').getAttribute('href')).toBe('/demo/tests/p');
    expect(num(fixture, '#tile-learning [data-total]')).toBe('0');
  });

  it('has a Notices tile with the unread count, red with an action chip when something needs doing', async () => {
    const note = { id: 'n', title: 'T', message: 'M', kind: 'action', link: null, source: 'manual', created_at: '2027-01-01T00:00:00+05:30', read_at: null };
    const { fixture } = await openHome({ notices: { unread: 3, action_unread: 2, notices: [note] } });
    expect(num(fixture, '#tile-notices [data-unread]')).toBe('3');
    expect(num(fixture, '#tile-notices [data-action]')).toBe('2 action needed');
    expect(el(fixture, '#tile-notices').className).toContain('alert-tile');
    expect(el(fixture, '#tile-notices').getAttribute('href')).toBe('/demo/notices');
    expect(all(fixture, 'a.tile').map((a) => a.getAttribute('id'))).toEqual(['tile-learning', 'tile-notices', 'tile-results']);
  });

  it('shows information notices without red, and says all read when none are unread', async () => {
    const note = { id: 'n', title: 'T', message: 'M', kind: 'info', link: null, source: 'manual', created_at: '2027-01-01T00:00:00+05:30', read_at: '2027-01-02T00:00:00+05:30' };
    const { fixture } = await openHome({ notices: { unread: 0, action_unread: 0, notices: [note] } });
    expect(num(fixture, '#tile-notices [data-unread]')).toBe('0');
    expect(all(fixture, '#tile-notices [data-allread]').length).toBe(1);
    expect(all(fixture, '#tile-notices [data-action]').length).toBe(0);
    expect(el(fixture, '#tile-notices').className).not.toContain('alert-tile');
  });

  it('has no separate Tests, Coursework or Courses tiles any more', async () => {
    const { fixture } = await openHome({ coursework: { summary: { total: 2, done: 0, left: 2, overdue: 0, this_week: 0 }, courses: [] } });
    expect(all(fixture, '#tile-tests, #tile-coursework, #tile-courses').length).toBe(0);
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
    expect(el(fixture, '#tile-results').getAttribute('href')).toBe('/demo/learning/results');
    expect(num(fixture, '#tile-weak [data-weak]')).toBe('2');
    expect(el(fixture, '#tile-weak').getAttribute('title')).toBe('Weakest: Logical Reasoning');
    expect(el(fixture, '#tile-weak').getAttribute('href')).toBe('/demo/learning/results');
  });

  it('leaves out the weak subjects tile when nothing is weak', async () => {
    const { fixture } = await openHome({ results: { summary, trend: [], attempts: [], subjects: [{ id: 's', name: 'Quant', correct: 9, questions: 10, accuracy: '90.0', topics: [] }] } });
    expect(all(fixture, '#tile-weak').length).toBe(0);
  });

  it('keeps the other tiles when one call fails', async () => {
    const { fixture } = await openHome({ tests: 500, coursework: 500, notices: 500 });
    expect(num(fixture, '#tile-learning [data-total]')).toBe('0');
    expect(num(fixture, '#tile-results [data-attempts]')).toBe('0');
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

  it('shows no contact card when the institute has filled in nothing', async () => {
    const { fixture } = await openHome();
    expect(fixture.nativeElement.querySelector('#contact-institute')).toBeNull();
  });

  it('shows how to contact the institute when it has filled in its details', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    TestBed.inject(TenantService).update({
      slug: 'demo', name: 'Demo', branding: { display_name: 'Demo', primary_color: '#2563eb', logo_url: null },
      profile: { description: 'Law coaching', city: 'Noida', contact_email: 'hi@demo.example', contact_phone: '9876543210', website: 'https://demo.example', exam_categories: ['CLAT'] },
    });
    const fixture = TestBed.createComponent(StudentHome);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/auth/me`).flush(me);
    await settle(fixture);
    for (const url of ['/api/my/tests', '/api/my/coursework', '/api/my/notices', '/api/my/results']) env.http.expectOne(`${API}${url}`).flush(url === '/api/my/coursework' ? NO_WORK : url === '/api/my/notices' ? { unread: 0, action_unread: 0, notices: [] } : url === '/api/my/results' ? { summary, trend: [], attempts: [], subjects: [] } : []);
    await settle(fixture);
    const card = el(fixture, '#contact-institute');
    expect(card.textContent).toContain('Law coaching');
    expect(card.textContent).toContain('CLAT');
    expect(el<HTMLAnchorElement>(fixture, '#contact-institute a[href^="mailto:"]').getAttribute('href')).toBe('mailto:hi@demo.example');
    expect(el<HTMLAnchorElement>(fixture, '#contact-institute a[href^="tel:"]').getAttribute('href')).toBe('tel:9876543210');
  });

  it('shows the student their own batches', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentHome);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/auth/me`).flush(me);
    await settle(fixture);
    env.http.expectOne(`${API}/api/my/batches`).flush([{ id: 'b1', name: 'Morning CAT', course_names: ['CAT'], start_date: '2027-02-01', end_date: '2027-06-30', faculty: 'Dr Rao', schedule: 'Mon to Fri, 7 to 9 am' }]);
    await settle(fixture);
    const card = el(fixture, '#my-batches').textContent!.replace(/\s+/g, ' ');
    expect(card).toContain('My batch');
    expect(card).toContain('Morning CAT');
    expect(card).toContain('Dr Rao');
  });

  it('works without batches when they cannot be loaded', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentHome);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/auth/me`).flush(me);
    await settle(fixture);
    env.http.expectOne(`${API}/api/my/batches`).flush({ detail: 'x' }, { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('#my-batches')).toBeNull();
    expect(text(fixture)).toContain('Welcome, Asha');
  });
});


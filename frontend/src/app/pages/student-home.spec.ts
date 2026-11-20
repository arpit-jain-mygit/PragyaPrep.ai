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

  it('says you are all caught up on the Today card when nothing is due', async () => {
    const { fixture } = await openHome();
    expect(el(fixture, '[data-today="clear"]').textContent).toContain('all caught up');
  });

  it('lists what needs doing today on the Today card', async () => {
    const coursework = { summary: { total: 10, done: 4, left: 6, overdue: 2, this_week: 3 }, courses: [] };
    const notices = { unread: 2, action_unread: 1, notices: [{ id: 'n1' }] };
    const { fixture } = await openHome({ coursework, notices });
    expect(all(fixture, '[data-today="clear"]').length).toBe(0);
    expect(el(fixture, '[data-today="overdue"]').textContent).toContain('2 overdue items');
    expect(el(fixture, '[data-today="week"]').textContent).toContain('3 coursework items due this week');
    expect(el(fixture, '[data-today="notices"]').textContent).toContain('1 notice needs your action');
    expect(el(fixture, '[data-today="week"] a').getAttribute('href')).toBe('/demo/learning?show=week');
    expect(el(fixture, '[data-today="overdue"] a').getAttribute('href')).toBe('/demo/learning?show=overdue');
  });
});

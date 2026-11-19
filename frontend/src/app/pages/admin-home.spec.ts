import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminHome } from './admin-home';

const COUNTS = { pending: 3, students: 40, courses: 4, tests_open: 55, questions: { published: 1500, draft: 12 } };

async function open(replies: { counts?: object | number; behind?: object | number } = {}) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminHome);
  fixture.detectChanges();
  const reply = (url: string, value: object | number | undefined, fallback: object) => {
    const request = env.http.expectOne(`${API}${url}`);
    if (typeof value === 'number') request.flush({ detail: 'x' }, { status: value, statusText: 'x' });
    else request.flush(value ?? fallback);
  };
  reply('/api/admin/home', replies.counts, COUNTS);
  reply('/api/admin/home/behind', replies.behind, { students: 0, courses: 0 });
  await settle(fixture);
  return { ...env, fixture };
}

const num = (fixture: Parameters<typeof el>[0], selector: string) => el(fixture, selector).textContent!.trim();

describe('Admin home', () => {
  it('greets the admin and shows a tile for each thing to look at', async () => {
    const { fixture } = await open();
    expect(text(fixture)).toContain('Welcome,');
    expect(all(fixture, 'a.tile').map((a) => a.getAttribute('id'))).toEqual(['tile-pending', 'tile-students', 'tile-behind', 'tile-tests', 'tile-questions', 'tile-courses']);
  });

  it('shows the counts', async () => {
    const { fixture } = await open();
    expect(['[data-pending]', '[data-students]', '[data-behind]', '[data-tests]', '[data-questions]', '[data-courses]'].map((s) => num(fixture, s))).toEqual(['3', '40', '0', '55', '1500', '4']);
    expect(num(fixture, '[data-drafts]')).toBe('12 drafts');
  });

  it('opens the right screen from each tile', async () => {
    const { fixture } = await open();
    const links = Object.fromEntries(all<HTMLAnchorElement>(fixture, 'a.tile').map((a) => [a.id, a.getAttribute('href')]));
    expect(links).toEqual({
      'tile-pending': '/demo/admin/registrations?status=pending',
      'tile-students': '/demo/admin/registrations?status=approved',
      'tile-behind': '/demo/admin/progress',
      'tile-tests': '/demo/admin/tests',
      'tile-questions': '/demo/admin/questions',
      'tile-courses': '/demo/admin/courses',
    });
  });

  it('turns the Pending and Behind tiles red when there is something to do', async () => {
    const { fixture } = await open({ behind: { students: 5, courses: 2 } });
    expect(el(fixture, '#tile-pending').className).toContain('alert-tile');
    expect(el(fixture, '#tile-behind').className).toContain('alert-tile');
    expect(num(fixture, '[data-behind]')).toBe('5');
    expect(num(fixture, '[data-behind-courses]')).toBe('in 2 courses');
  });

  it('leaves those tiles plain when nothing needs attention, and drops the drafts chip', async () => {
    const { fixture } = await open({ counts: { ...COUNTS, pending: 0, questions: { published: 10, draft: 0 } } });
    expect(el(fixture, '#tile-pending').className).not.toContain('alert-tile');
    expect(el(fixture, '#tile-behind').className).not.toContain('alert-tile');
    expect(all(fixture, '[data-drafts], [data-behind-courses]').length).toBe(0);
  });

  it('says "in 1 course" in the singular', async () => {
    const { fixture } = await open({ behind: { students: 1, courses: 1 } });
    expect(num(fixture, '[data-behind-courses]')).toBe('in 1 course');
  });

  it('shows … on a tile until its count arrives, and the simple counts do not wait for Behind', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(AdminHome);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/admin/home`).flush(COUNTS);
    await settle(fixture);
    expect(num(fixture, '[data-pending]')).toBe('3');
    expect(num(fixture, '[data-behind]')).toBe('…');
    env.http.expectOne(`${API}/api/admin/home/behind`).flush({ students: 2, courses: 1 });
    await settle(fixture);
    expect(num(fixture, '[data-behind]')).toBe('2');
  });

  it('keeps the other tiles when Behind fails, and shows a dash for it', async () => {
    const { fixture } = await open({ behind: 500 });
    expect(num(fixture, '[data-behind]')).toBe('-');
    expect(num(fixture, '[data-students]')).toBe('40');
  });

  it('keeps Behind when the simple counts fail', async () => {
    const { fixture } = await open({ counts: 500, behind: { students: 4, courses: 1 } });
    expect(num(fixture, '[data-pending]')).toBe('…');
    expect(num(fixture, '[data-behind]')).toBe('4');
  });
});

describe('Admin home: set-up checklist and find a student', () => {
  const EMPTY = { pending: 0, students: 0, courses: 0, tests_open: 0, questions: { published: 0, draft: 0 } };

  async function openHome(counts: object) {
    const env = setupTestBed();
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(AdminHome);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/admin/home`).flush(counts);
    env.http.expectOne(`${API}/api/admin/home/behind`).flush({ students: 0, courses: 0 });
    await settle(fixture);
    return { ...env, fixture };
  }

  it('shows the steps still to do, with what is done ticked', async () => {
    const { fixture } = await openHome({ ...EMPTY, courses: 1, students: 2 });
    expect(el(fixture, '#checklist').textContent).toContain('2 of 5 done');
    expect(el(fixture, '[data-step="course"]').className).toContain('done');
    expect(el(fixture, '[data-step="questions"]').className).not.toContain('done');
    expect(el<HTMLAnchorElement>(fixture, '[data-step="questions"] a').getAttribute('href')).toBe('/demo/admin/questions');
  });

  it('goes away once everything is set up, and can be hidden before that', async () => {
    const done = await openHome({ pending: 0, students: 3, courses: 2, tests_open: 1, questions: { published: 10, draft: 0 } });
    expect(all(done.fixture, '#checklist').length).toBe(1); // the institute details step is still open
    el<HTMLButtonElement>(done.fixture, '#checklist-hide').click();
    await settle(done.fixture);
    expect(all(done.fixture, '#checklist').length).toBe(0);
    expect(localStorage.getItem('pragyaprep.checklist.demo')).toBe('1');
  });

  it('finds a student by name and opens the quick look', async () => {
    const { fixture, http } = await openHome(EMPTY);
    type(fixture, '#find-input', 'ash');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/registrations?status=all`).flush([
      { email: 'asha@example.com', first_name: 'Asha', last_name: 'Rao', mobile: '9876543210', status: 'approved' },
      { email: 'ravi@example.com', first_name: 'Ravi', last_name: 'Kumar', mobile: '9811111111', status: 'approved' },
    ]);
    await settle(fixture);
    expect(all(fixture, '[data-found]').map((b) => b.getAttribute('data-found'))).toEqual(['asha@example.com']);
    el<HTMLButtonElement>(fixture, '[data-found="asha@example.com"]').click();
    await settle(fixture);
    http.expectOne(`${API}/api/admin/students/asha%40example.com/quick`);
  });
});

describe('Admin home: the Behind tile uses the saved answer', () => {
  const COUNTS_OK = { pending: 0, students: 3, courses: 2, tests_open: 1, questions: { published: 10, draft: 0 } };

  async function openBehind(saved: object | number) {
    const env = setupTestBed();
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(AdminHome);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/admin/home`).flush(COUNTS_OK);
    const request = env.http.expectOne(`${API}/api/admin/home/behind`);
    if (typeof saved === 'number') request.flush({ detail: 'x' }, { status: saved, statusText: 'x' });
    else request.flush(saved);
    await settle(fixture);
    return { ...env, fixture };
  }

  it('shows a fresh saved number and does not ask for a refresh', async () => {
    const { fixture, http } = await openBehind({ students: 4, courses: 2, as_of: '2027-01-15T08:00:00+00:00', fresh: true });
    expect(num(fixture, '[data-behind]')).toBe('4');
    http.expectNone(`${API}/api/admin/home/behind/refresh`);
    expect(all(fixture, '[data-behind-updating]').length).toBe(0);
  });

  it('shows an old saved number at once, then swaps in the new one', async () => {
    const { fixture, http } = await openBehind({ students: 4, courses: 2, as_of: '2027-01-15T08:00:00+00:00', fresh: false });
    expect(num(fixture, '[data-behind]')).toBe('4');
    expect(all(fixture, '[data-behind-updating]').length).toBe(1);
    http.expectOne(`${API}/api/admin/home/behind/refresh`).flush({ students: 6, courses: 3, as_of: '2027-01-15T09:00:00+00:00', fresh: true });
    await settle(fixture);
    expect(num(fixture, '[data-behind]')).toBe('6');
    expect(all(fixture, '[data-behind-updating]').length).toBe(0);
  });

  it('waits with a dots placeholder the very first time, then shows the worked-out number', async () => {
    const { fixture, http } = await openBehind({ students: null, courses: null, as_of: null, fresh: false });
    expect(num(fixture, '[data-behind]')).toBe('…');
    http.expectOne(`${API}/api/admin/home/behind/refresh`).flush({ students: 2, courses: 1, as_of: '2027-01-15T09:00:00+00:00', fresh: true });
    await settle(fixture);
    expect(num(fixture, '[data-behind]')).toBe('2');
  });

  it('keeps the old number when the refresh fails, and shows a dash only when there is none', async () => {
    const { fixture, http } = await openBehind({ students: 4, courses: 2, as_of: '2027-01-15T08:00:00+00:00', fresh: false });
    http.expectOne(`${API}/api/admin/home/behind/refresh`).flush({ detail: 'x' }, { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(num(fixture, '[data-behind]')).toBe('4');
  });

  it('shows a dash when there is no saved number and the refresh fails', async () => {
    const { fixture, http } = await openBehind({ students: null, courses: null, as_of: null, fresh: false });
    http.expectOne(`${API}/api/admin/home/behind/refresh`).flush({ detail: 'x' }, { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(num(fixture, '[data-behind]')).toBe('-');
  });
});

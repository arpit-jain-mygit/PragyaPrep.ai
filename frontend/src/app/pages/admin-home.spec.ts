import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text } from '../testing';
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

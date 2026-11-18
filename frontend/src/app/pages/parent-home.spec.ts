import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { ParentHome } from './parent-home';

const ROW = { email: 'asha@example.com', name: 'Asha Rao', status: 'behind', cw_done: 3, cw_total: 10, cw_overdue: 2, tests_taken: 1, tests_available: 4, tests_overdue: 0, avg_percent: 62, overdue: 2, last_active: null };
const KIDS = [
  { email: 'asha@example.com', name: 'Asha Rao', avatar_url: '', status: 'approved', courses: [{ id: 'c1', name: 'CAT', row: ROW }, { id: 'c2', name: 'CLAT', row: { ...ROW, status: 'on_track', overdue: 0, avg_percent: null } }] },
  { email: 'ravi@example.com', name: 'Ravi K', avatar_url: '', status: 'approved', courses: [] },
];

async function open(reply: object = KIDS) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('parent'));
  const fixture = TestBed.createComponent(ParentHome);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/parent/children`).flush(reply);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Parent home', () => {
  it('shows each child with every course, its status and the numbers', async () => {
    const { fixture } = await open();
    expect(all(fixture, '[data-child]').map((c) => c.getAttribute('data-child'))).toEqual(['asha@example.com', 'ravi@example.com']);
    const cat = el(fixture, '[data-course="CAT"]').textContent!.replace(/\s+/g, ' ');
    expect(cat).toContain('Behind');
    expect(cat).toContain('2 overdue');
    expect(cat).toContain('Coursework 3 of 10');
    expect(cat).toContain('tests 1 of 4');
    expect(cat).toContain('average 62%');
    expect(el(fixture, '[data-course="CLAT"]').textContent).toContain('On track');
    expect(el(fixture, '[data-course="CLAT"]').textContent).not.toContain('average');
    expect(el(fixture, '[data-child="ravi@example.com"]').textContent).toContain('Not enrolled in a course yet');
  });

  it('links each child to their details', async () => {
    const { fixture } = await open();
    expect(el<HTMLAnchorElement>(fixture, '[data-child="asha@example.com"] a.btn').getAttribute('href')).toBe('/demo/parent/asha@example.com');
  });

  it('says so when no child is linked', async () => {
    const { fixture } = await open([]);
    expect(text(fixture)).toContain('No child is linked');
  });

  it('explains a failure to load', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('parent'));
    const fixture = TestBed.createComponent(ParentHome);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/parent/children`).flush({ detail: 'Something went wrong.' }, { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('Something went wrong.');
  });
});

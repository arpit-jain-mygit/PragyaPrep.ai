import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { routes } from '../app.routes';
import { all, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { StudentLearning } from './student-learning';

describe('My Learning', () => {
  it('has the title and three tabs: Coursework, Tests and Results', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentLearning);
    await settle(fixture);
    expect(text(fixture)).toContain('My Learning');
    const tabs = all<HTMLAnchorElement>(fixture, 'nav.tabs a');
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Coursework', 'Tests', 'Results']);
    expect(tabs.map((t) => t.getAttribute('href'))).toEqual(['/demo/learning', '/demo/learning/tests', '/demo/learning/results']);
    expect(el(fixture, 'router-outlet')).not.toBeNull();
  });
});

describe('Student routes', () => {
  const tenantRoutes = routes.find((r) => r.path === ':tenant')!.children!;
  const named = (path: string) => tenantRoutes.filter((r) => r.path === path);

  it('puts coursework, tests and results under My Learning, coursework first', () => {
    const learning = named('learning')[0];
    expect(learning.children!.map((c) => c.path)).toEqual(['', 'tests', 'results']);
    expect(learning.canActivate?.length).toBe(1);
  });

  it.each([
    ['tests', 'learning/tests'],
    ['results', 'learning/results'],
    ['coursework', 'learning'],
    ['courses', 'learning'],
  ])('sends the earlier address /%s to %s', (from, to) => {
    const route = named(from)[0];
    expect(route.redirectTo).toBe(to);
    expect(route.pathMatch).toBe('full');
  });

  it('keeps the address of a single test and its attempt', () => {
    expect(named('tests/:id').length).toBe(1);
    expect(named('tests/:id/attempts/:number').length).toBe(1);
  });

  it('no longer has a My courses page for students', () => {
    expect(tenantRoutes.some((r) => r.loadComponent && String(r.loadComponent).includes('my-courses'))).toBe(false);
  });
});

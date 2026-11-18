import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { AdminProgressStudent } from './admin-progress-student';

function sub(overrides: object = {}) {
  return { id: 's1', title: 'Concepts', note: '', due: '2027-01-20', due_from: 'subtopic', days_left: 5, overdue: false, done: true, done_at: '2027-01-14T10:00:00+05:30', materials: [], ...overrides };
}

function detail(overrides: object = {}) {
  const subs = [sub(), sub({ id: 's2', title: 'Examples', due: '2027-01-10', days_left: -5, overdue: true, done: false, done_at: null })];
  return {
    course: { id: 'c1', name: 'CAT' },
    student: { email: 'asha@example.com', name: 'Asha Rao' },
    row: {
      email: 'asha@example.com', name: 'Asha Rao', status: 'behind', cw_done: 1, cw_total: 2, cw_overdue: 1, tests_taken: 1, tests_available: 2, tests_overdue: 1,
      avg_percent: 72, overdue: 2, last_active: '2027-01-14T10:00:00+05:30',
    },
    coursework: {
      id: 'c1', name: 'CAT', progress: { total: 2, done: 1 }, overdue: 1,
      subjects: [{ paper_id: 'quantitative-ability', name: 'Quantitative Ability', due: null, progress: { total: 2, done: 1 },
        topics: [{ id: 't1', title: 'Percentages', due: null, progress: { total: 2, done: 1 }, subtopics: subs }] }],
    },
    overdue_items: [{ title: 'Examples', topic: 'Percentages', subject: 'Quantitative Ability', due: '2027-01-10', days_late: 5 }],
    tests: [
      { id: 't1', title: 'Closed one', state: 'ended', overdue: true, attempts_used: 0, max_attempts: 2, best: null },
      { id: 't2', title: 'Open one', state: 'open', overdue: false, attempts_used: 1, max_attempts: 2, best: { marks: '6', percentage: '72', passed: true } },
    ],
    ...overrides,
  };
}

async function open(reply: object | number = detail()) {
  const env = setupTestBed({ params: { course: 'c1', email: 'asha@example.com' } });
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminProgressStudent);
  fixture.detectChanges();
  const request = env.http.expectOne(`${API}/api/admin/progress/c1/students/asha%40example.com`);
  if (typeof reply === 'number') request.flush({ detail: "We couldn't find that student in this course." }, { status: reply, statusText: 'x' });
  else request.flush(reply);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Admin progress: one student', () => {
  it('shows the name, course, email, last active and status', async () => {
    const { fixture } = await open();
    expect(text(fixture)).toContain('Asha Rao');
    expect(text(fixture)).toContain('CAT');
    expect(el(fixture, '#who').textContent).toContain('asha@example.com');
    expect(el(fixture, '#who').textContent).toContain('last active');
    expect(el(fixture, '#status').textContent).toContain('Behind');
    expect(el(fixture, '#status').className).toContain('bad');
  });

  it('shows the counts', async () => {
    const { fixture } = await open();
    const nums = ['#s-cw', '#s-tests', '#s-avg', '#s-overdue'].map((s) => el(fixture, s).textContent!.replace(/\s+/g, ' ').trim());
    expect(nums).toEqual(['1 / 2', '1 / 2', '72%', '2']);
  });

  it('lists the overdue coursework with how late it is', async () => {
    const { fixture } = await open();
    const item = el(fixture, '[data-overdue="Examples"]').textContent!.replace(/\s+/g, ' ');
    expect(item).toContain('Quantitative Ability › Percentages');
    expect(item).toContain('was due 10 Jan 2027 (5 days ago)');
  });

  it('shows coursework by subject and topic, with done, overdue and waiting sub-topics told apart', async () => {
    const { fixture } = await open();
    expect(el(fixture, '[data-subject="Quantitative Ability"]').textContent).toContain('1/2');
    expect(el(fixture, '[data-topic="Percentages"]').textContent).toContain('1/2');
    expect(el(fixture, '[data-sub="Concepts"]').textContent).toContain('done');
    expect(el(fixture, '[data-sub="Examples"]').textContent).toContain('due 10 Jan 2027');
    expect(el(fixture, '[data-sub="Concepts"] app-icon').className).toContain('ok-icon');
    expect(el(fixture, '[data-sub="Examples"] app-icon').className).toContain('bad-icon');
  });

  it('shows each test with attempts, best score and its state', async () => {
    const { fixture } = await open();
    const closed = el(fixture, '[data-test="Closed one"]').textContent!.replace(/\s+/g, ' ');
    expect(closed).toContain('0 of 2');
    expect(closed).toContain('Missed');
    const open_ = el(fixture, '[data-test="Open one"]').textContent!.replace(/\s+/g, ' ');
    expect(open_).toContain('1 of 2');
    expect(open_).toContain('72%');
    expect(open_).toContain('passed');
    expect(open_).toContain('Open');
  });

  it('leaves out the overdue list when nothing is overdue, and says so when there is no coursework or tests', async () => {
    const { fixture } = await open(detail({ overdue_items: [], coursework: null, tests: [] }));
    expect(all(fixture, '#overdue-items').length).toBe(0);
    expect(text(fixture)).toContain('No published coursework in this course');
    expect(text(fixture)).toContain('No tests for this course');
  });

  it('links back to the progress page', async () => {
    const { fixture } = await open();
    expect(el(fixture, '.page-head a').getAttribute('href')).toBe('/demo/admin/progress');
  });

  it('explains a student who is not in the course', async () => {
    const { fixture } = await open(404);
    expect(text(fixture)).toContain("We couldn't find that student in this course.");
  });
});

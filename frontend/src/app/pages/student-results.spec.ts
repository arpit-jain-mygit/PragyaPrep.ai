import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { StudentResults } from './student-results';

function row(testId: string, title: string, number: number, extra: object = {}) {
  return {
    test_id: testId, title, number, started_at: '2027-01-15T08:00:00+00:00', submitted_at: '2027-01-15T08:20:00+00:00', marks: '9', total_marks: '12', percentage: '75',
    passed: true, auto_submitted: false, show_answers: true, ...extra,
  };
}
const DATA = {
  summary: { tests_taken: 2, attempts: 3, in_progress: 0, average: '58.33', best: '100', tests_passed: 1 },
  trend: [
    { title: 'Optics test', number: 1, percentage: '25', passed: false, started_at: '2027-01-10T08:00:00+00:00' },
    { title: 'Optics test', number: 2, percentage: '100', passed: true, started_at: '2027-01-12T08:00:00+00:00' },
    { title: 'Reading test', number: 1, percentage: '50', passed: false, started_at: '2027-01-14T08:00:00+00:00' },
  ],
  attempts: [
    row('t2', 'Reading test', 1, { percentage: '50', marks: '3', total_marks: '6', passed: false, auto_submitted: true }),
    row('t1', 'Optics test', 2, { percentage: '100', marks: '12', total_marks: '12' }),
    row('t1', 'Optics test', 1, { percentage: '25', marks: '3', total_marks: '12', passed: false }),
  ],
  subjects: [
    { id: 'physics', name: 'Physics', correct: 5, questions: 12, accuracy: '41.7', topics: [
      { topic: 'Magnetism', correct: 0, wrong: 3, unanswered: 1, questions: 4, accuracy: '0' },
      { topic: 'Optics', correct: 5, wrong: 2, unanswered: 1, questions: 8, accuracy: '62.5' },
    ] },
    { id: 'english', name: 'English', correct: 5, questions: 6, accuracy: '83.3', topics: [{ topic: 'Reading comprehension', correct: 5, wrong: 1, unanswered: 0, questions: 6, accuracy: '83.3' }] },
  ],
};

async function open(data: object = DATA) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(StudentResults);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/my/results`).flush(data);
  await settle(fixture);
  return { ...env, fixture };
}

const rows = (fixture: Awaited<ReturnType<typeof open>>['fixture']) => all(fixture, '[data-result]').map((r) => r.getAttribute('data-result'));

describe('Student results across tests', () => {
  it('has a switch between the tests and the results, with the results marked', async () => {
    const { fixture } = await open();
    const tabs = all<HTMLAnchorElement>(fixture, 'app-student-tabs a');
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Tests', 'My results']);
    expect(tabs.map((t) => t.getAttribute('href'))).toEqual(['/demo/tests', '/demo/results']);
  });

  it('shows the totals', async () => {
    const { fixture } = await open();
    expect(el(fixture, '#s-tests').textContent).toBe('2');
    expect(el(fixture, '#s-attempts').textContent).toBe('3');
    expect(el(fixture, '#s-average').textContent).toBe('58.33%');
    expect(el(fixture, '#s-best').textContent).toBe('100%');
    expect(el(fixture, '#s-passed').textContent?.replace(/\s+/g, ' ').trim()).toBe('1 of 2');
  });

  it('draws one bar per recent attempt, green for passed and red for not passed', async () => {
    const { fixture } = await open();
    expect(all(fixture, '#trend .bar-col').length).toBe(3);
    expect(el(fixture, '[data-point="1"] .bar').className).toContain('pass');
    expect(el(fixture, '[data-point="0"] .bar').className).toContain('fail');
    expect(el(fixture, '[data-point="1"]').getAttribute('title')).toBe('Optics test, attempt 2: 100%');
    expect(el(fixture, '[data-point="1"] .bar').getAttribute('style')).toContain('90');
  });

  it('leaves out the trend until there are two attempts to compare', async () => {
    const { fixture } = await open({ ...DATA, trend: [DATA.trend[0]] });
    expect(all(fixture, '#trend').length).toBe(0);
  });

  it('shows each subject and its topics, weakest first, and says to practise the weak ones', async () => {
    const { fixture } = await open();
    expect(all(fixture, '[data-subject]').map((s) => s.getAttribute('data-subject'))).toEqual(['physics', 'english']);
    const physics = el(fixture, '[data-subject="physics"]');
    expect(physics.textContent).toContain('5 of 12 · 41.7%');
    expect(Array.from(physics.querySelectorAll('[data-topic]')).map((t) => t.getAttribute('data-topic'))).toEqual(['Magnetism', 'Optics']);
    expect(physics.querySelector('[data-topic="Magnetism"]')!.textContent).toContain('0 of 4 · 0%');
    expect(all(fixture, '[data-weak]').map((c) => c.getAttribute('data-weak'))).toEqual(['Magnetism']); // 62.5% and 83.3% are not weak
    expect(el(fixture, '[data-topic="Magnetism"] .meter').className).toContain('hard');
    expect(el(fixture, '[data-topic="Optics"] .meter').className).toContain('mid');
    expect(el(fixture, '[data-topic="Reading comprehension"] .meter').className).not.toContain('hard');
    expect(el(fixture, '[data-topic="Reading comprehension"] .meter').className).not.toContain('mid');
  });

  it('lists every finished attempt with its marks and result, and links to it', async () => {
    const { fixture } = await open();
    expect(rows(fixture)).toEqual(['t2#1', 't1#2', 't1#1']);
    const first = el(fixture, '[data-result="t2#1"]').textContent!.replace(/\s+/g, ' ');
    expect(first).toContain('Reading test');
    expect(first).toContain('Attempt 1');
    expect(first).toContain('3 / 6');
    expect(first).toContain('50%');
    expect(first).toContain('Not passed');
    expect(first).toContain('⏱');
    expect(el(fixture, '[data-result="t1#2"]').textContent).toContain('Passed');
    expect(el<HTMLAnchorElement>(fixture, '[data-result="t1#2"] a').getAttribute('href')).toBe('/demo/tests/t1/attempts/2');
  });

  it('searches by test name and filters by passed or not passed', async () => {
    const { fixture } = await open();
    type(fixture, '#mr-search', 'optics');
    await settle(fixture);
    expect(rows(fixture)).toEqual(['t1#2', 't1#1']);
    type(fixture, '#mr-result', 'passed');
    await settle(fixture);
    expect(rows(fixture)).toEqual(['t1#2']);
    type(fixture, '#mr-result', 'failed');
    type(fixture, '#mr-search', 'reading');
    await settle(fixture);
    expect(rows(fixture)).toEqual(['t2#1']);
    type(fixture, '#mr-search', 'zzz');
    await settle(fixture);
    expect(text(fixture)).toContain('No results match');
  });

  it('invites a student who has finished nothing to take a test', async () => {
    const { fixture } = await open({ summary: { tests_taken: 0, attempts: 0, in_progress: 0, average: null, best: null, tests_passed: 0 }, trend: [], attempts: [], subjects: [] });
    expect(el(fixture, '#no-results').textContent).toContain('Take a test to see your results here');
    expect(all(fixture, '#summary').length).toBe(0);
  });

  it('says to finish the test in progress when that is all there is', async () => {
    const { fixture } = await open({ summary: { tests_taken: 0, attempts: 0, in_progress: 1, average: null, best: null, tests_passed: 0 }, trend: [], attempts: [], subjects: [] });
    expect(el(fixture, '#no-results').textContent).toContain('Finish your test to see your results here');
  });

  it('says so when there is no topic breakdown yet', async () => {
    const { fixture } = await open({ ...DATA, subjects: [] });
    expect(text(fixture)).toContain('Your topic results will show here after your next test.');
  });

  it('explains a failure to load', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentResults);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/results`).flush({ detail: "You don't have access to this." }, { status: 403, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain("You don't have access to this.");
  });
});

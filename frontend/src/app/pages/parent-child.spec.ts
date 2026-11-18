import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { ParentChild } from './parent-child';

const ROW = { email: 'asha@example.com', name: 'Asha Rao', status: 'behind', cw_done: 3, cw_total: 10, cw_overdue: 1, tests_taken: 1, tests_available: 2, tests_overdue: 0, avg_percent: 62, overdue: 1, last_active: null };
const course = (id: string, name: string) => ({
  course: { id, name }, student: { email: 'asha@example.com', name: 'Asha Rao' }, row: ROW, coursework: null,
  overdue_items: [{ title: 'Ratios', topic: 'Percentages', subject: 'Quant', due: '2027-01-10', days_late: 5 }],
  tests: [{ id: 't1', title: 'Mock 1', state: 'open', overdue: false, attempts_used: 1, max_attempts: 2, best: { marks: '5', percentage: '62', passed: true } }],
});
const DATA = {
  student: { email: 'asha@example.com', name: 'Asha Rao', avatar_url: '' },
  courses: [course('c1', 'CAT'), course('c2', 'CLAT')],
  practice: [
    { id: 'p1', title: 'Practice: Optics', question_count: 10, attempts_used: 2, best: { marks: '8', percentage: '80', passed: true }, set_by_parent: false, created_at: '' },
    { id: 'p2', title: 'Practice: Magnetism', question_count: 10, attempts_used: 0, best: null, set_by_parent: true, created_at: '' },
  ],
  results: {
    summary: { tests_taken: 1, attempts: 1, in_progress: 0, average: '62', best: '62', tests_passed: 1 }, trend: [],
    subjects: [{ id: 'physics', name: 'Physics', correct: 9, questions: 20, accuracy: '45', topics: [
      { topic: 'Magnetism', correct: 1, wrong: 3, unanswered: 0, questions: 4, accuracy: '25' }, { topic: 'Optics', correct: 6, wrong: 2, unanswered: 0, questions: 8, accuracy: '75' },
      { topic: 'Waves', correct: 5, wrong: 3, unanswered: 0, questions: 8, accuracy: '62.5' }] }],
  },
};
const URL = `${API}/api/parent/children/asha%40example.com`;

async function open(reply: object = DATA) {
  const env = setupTestBed({ params: { email: 'asha@example.com' } });
  env.sessions.save(sessionFor('parent'));
  const fixture = TestBed.createComponent(ParentChild);
  fixture.detectChanges();
  env.http.expectOne(URL).flush(reply);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Parent: one child', () => {
  it('shows the child\'s batches with faculty and timetable, and nothing when there are none', async () => {
    const { fixture } = await open({ ...DATA, batches: [{ id: 'b1', name: 'Morning CAT', course_names: ['CAT'], start_date: '2027-02-01', end_date: '', faculty: 'Dr Rao', schedule: 'Mon to Fri, 7 to 9 am' }] });
    const card = el(fixture, '#child-batches').textContent!.replace(/\s+/g, ' ');
    expect(card).toContain('Morning CAT');
    expect(card).toContain('Dr Rao');
    expect(card).toContain('Mon to Fri, 7 to 9 am');
  });

  it('shows no batch card when the child is in no batch', async () => {
    const { fixture } = await open({ ...DATA, batches: [] });
    expect(fixture.nativeElement.querySelector('#child-batches')).toBeNull();
  });

  it('lists course tests and practice tests with their type, and the practice ones set by the parent', async () => {
    const { fixture } = await open();
    const rows = all(fixture, '#tests tbody tr').map((r) => r.getAttribute('data-test'));
    expect(rows).toEqual(['Mock 1', 'Practice: Optics', 'Practice: Magnetism']);
    expect(el(fixture, '[data-test="Mock 1"]').textContent).toContain('Course');
    expect(el(fixture, '[data-test="Practice: Optics"]').textContent).toContain('Practice');
    expect(el(fixture, '[data-test="Practice: Magnetism"]').textContent).toContain('Set by you');
    expect(el(fixture, '[data-test="Practice: Optics"]').textContent).toContain('80%');
  });

  it('searches the tests by name and filters them by type', async () => {
    const { fixture } = await open();
    const names = () => all(fixture, '#tests tbody tr[data-test]').map((r) => r.getAttribute('data-test'));
    type(fixture, '#pt-search', 'magnet');
    await settle(fixture);
    expect(names()).toEqual(['Practice: Magnetism']);
    type(fixture, '#pt-search', '');
    type(fixture, '#pt-type', 'parent');
    await settle(fixture);
    expect(names()).toEqual(['Practice: Magnetism']);
    type(fixture, '#pt-type', 'practice');
    await settle(fixture);
    expect(names()).toEqual(['Practice: Optics']);
    type(fixture, '#pt-type', 'course');
    await settle(fixture);
    expect(names()).toEqual(['Mock 1']);
    type(fixture, '#pt-search', 'zzz');
    await settle(fixture);
    expect(el(fixture, '#no-tests').textContent).toContain('No tests match');
  });

  it('shows the first course with status, numbers, overdue items and tests', async () => {
    const { fixture } = await open();
    expect(el(fixture, '#status-line').textContent).toContain('Behind');
    expect(el(fixture, '#status-line').textContent).toContain('CAT');
    expect(el(fixture, '#s-cw').textContent!.replace(/\s+/g, ' ')).toContain('3 / 10');
    expect(el(fixture, '#s-avg').textContent).toContain('62%');
    expect(el(fixture, '[data-overdue="Ratios"]').textContent).toContain('Percentages');
    expect(el(fixture, '[data-test="Mock 1"]').textContent).toContain('passed');
  });

  it('switches between the child\'s courses', async () => {
    const { fixture } = await open();
    expect(all(fixture, '[data-tab]').map((t) => t.getAttribute('data-tab'))).toEqual(['CAT', 'CLAT']);
    el(fixture, '[data-tab="CLAT"]').click();
    await settle(fixture);
    expect(el(fixture, '#status-line').textContent).toContain('CLAT');
  });

  it('lists the topics under 75% and offers a practice test for each', async () => {
    const { fixture } = await open();
    expect(all(fixture, '[data-practise]').map((b) => b.getAttribute('data-practise'))).toEqual(['Magnetism', 'Waves']);
    expect(el(fixture, '[data-weak="Physics: Magnetism"] .meter').className).toContain('hard');
    expect(el(fixture, '[data-weak="Physics: Waves"] .meter').className).toContain('mid');
  });

  it('sets a practice test and says where the child will find it', async () => {
    const { fixture, http } = await open();
    el(fixture, '[data-practise="Magnetism"]').click();
    const request = http.expectOne(`${API}/api/parent/children/asha%40example.com/practice`);
    expect(request.request.body).toEqual({ paper: 'physics', topic: 'Magnetism' });
    request.flush({ id: 'p1', title: 'Practice: Magnetism', question_count: 10 }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    expect(el(fixture, '#notice').textContent).toContain('Practice: Magnetism');
    expect(el(fixture, '#notice').textContent).toContain('Asha will find it under Tests');
  });

  it('explains a refusal, such as a child who is not enrolled', async () => {
    const { fixture, http } = await open();
    el(fixture, '[data-practise="Waves"]').click();
    http.expectOne(`${API}/api/parent/children/asha%40example.com/practice`).flush({ detail: 'Practice tests open once the student is enrolled in a course.' }, { status: 403, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('Practice tests open once the student is enrolled');
  });

  it('says so when the child has no course or no weak topics yet', async () => {
    const { fixture } = await open({ ...DATA, courses: [], practice: [], results: { ...DATA.results, subjects: [] } });
    expect(text(fixture)).toContain('not enrolled in a course yet');
    expect(el(fixture, '#no-weak').textContent).toContain('after Asha finishes a test');
  });

  it('explains when the child cannot be found', async () => {
    const env = setupTestBed({ params: { email: 'asha@example.com' } });
    env.sessions.save(sessionFor('parent'));
    const fixture = TestBed.createComponent(ParentChild);
    fixture.detectChanges();
    env.http.expectOne(URL).flush({ detail: "We couldn't find that student." }, { status: 404, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain("couldn't find that student");
  });
});

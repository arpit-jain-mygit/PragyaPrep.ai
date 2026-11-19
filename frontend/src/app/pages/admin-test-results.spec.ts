import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { API, all, clickButton, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminTestResults } from './admin-test-results';

function row(name: string, email: string, number: number, extra: object = {}) {
  return {
    email, name, number, status: 'submitted', started_at: `2027-01-1${number}T08:00:00+00:00`, submitted_at: `2027-01-1${number}T08:20:00+00:00`, auto_submitted: false,
    marks: '9', total_marks: '12', percentage: '75', passed: true, correct: 3, wrong: 1, unanswered: 0, seconds: 1200, ...extra,
  };
}
const ASHA1 = row('Asha Rao', 'asha@example.com', 1, { marks: '3', percentage: '25', passed: false, correct: 1, wrong: 0, unanswered: 3, seconds: 125 });
const ASHA2 = row('Asha Rao', 'asha@example.com', 2, { marks: '12', percentage: '100', correct: 4, wrong: 0, unanswered: 0, auto_submitted: true });
const RAVI = row('Ravi Kumar', 'ravi@example.com', 1, { marks: '9', percentage: '75' });
const MEERA = { email: 'meera@example.com', name: 'Meera Kapoor', number: 1, status: 'in_progress', started_at: '2027-01-12T08:00:00+00:00', submitted_at: null, auto_submitted: false };

const DATA = {
  test: { id: 't1', title: 'CAT Mock 1', question_count: 4, pass_percentage: 50, marks_correct: '3', marks_incorrect: '-1' },
  summary: { students: 3, attempts: 4, submitted: 3, in_progress: 1, average: '66.67', highest: '100', lowest: '25', passed: 2, pass_rate: '66.7', distribution: [0, 0, 1, 0, 0, 0, 0, 1, 0, 1] },
  attempts: [ASHA1, ASHA2, RAVI, MEERA],
  questions: [
    { id: 'q1', text: 'Easy one?', kind: 'mcq', topic: 'Optics', difficulty: 'easy', faced: 3, answered: 3, correct: 3, percent_correct: '100', most_chosen_wrong: null },
    { id: 'q2', text: 'Hard one?', kind: 'mcq', topic: 'Optics', difficulty: 'hard', faced: 3, answered: 3, correct: 1, percent_correct: '33.3', most_chosen_wrong: { option: 2, count: 2, text: 'Gamma' } },
    { id: 'q3', text: 'Middle one?', kind: 'mcq', topic: 'Magnetism', difficulty: 'medium', faced: 2, answered: 2, correct: 1, percent_correct: '50', most_chosen_wrong: { option: 0, count: 1, text: 'Alpha' } },
    { id: 'q4', text: 'Never faced?', kind: 'fill_in', topic: 'Optics', difficulty: 'easy', faced: 0, answered: 0, correct: 0, percent_correct: null, most_chosen_wrong: null },
  ],
};

async function open(data: object = DATA) {
  const env = setupTestBed({ params: { id: 't1' } });
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminTestResults);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/tests/t1/results?limit=25`).flush(data);
  await settle(fixture);
  return { ...env, fixture };
}

const keys = (fixture: Awaited<ReturnType<typeof open>>['fixture']) => all(fixture, '[data-attempt]').map((r) => r.getAttribute('data-attempt'));

describe('Admin test results', () => {
  it('shows the summary numbers and the score spread', async () => {
    const { fixture } = await open();
    expect(el(fixture, '#s-students').textContent).toBe('3');
    expect(el(fixture, '#s-attempts').textContent).toBe('4');
    expect(el(fixture, '#summary').textContent).toContain('1 in progress');
    expect(el(fixture, '#s-average').textContent).toBe('66.67%');
    expect(el(fixture, '#s-highest').textContent).toBe('100%');
    expect(el(fixture, '#s-lowest').textContent).toBe('25%');
    expect(el(fixture, '#s-pass').textContent).toBe('66.7%');
    expect(el(fixture, '#summary').textContent).toContain('2 of 3');
    expect(all(fixture, '.bar-col').length).toBe(10);
    expect(el(fixture, '[data-band="9"] .bar').getAttribute('style')).toContain('90');
    expect(el(fixture, '[data-band="0"]').textContent?.trim()).toBe('');
  });

  it('lists every attempt with the student, marks, percentage, result and time', async () => {
    const { fixture } = await open();
    expect(keys(fixture).length).toBe(4);
    const asha1 = el(fixture, '[data-attempt="asha@example.com#1"]').textContent!.replace(/\s+/g, ' ');
    expect(asha1).toContain('Asha Rao');
    expect(asha1).toContain('asha@example.com');
    expect(asha1).toContain('3 / 12');
    expect(asha1).toContain('25%');
    expect(asha1).toContain('Not passed');
    expect(asha1).toContain('2 min 5 s');
    expect(el(fixture, '[data-attempt="asha@example.com#2"]').textContent).toContain('⏱');
    expect(el(fixture, '[data-attempt="meera@example.com#1"]').textContent).toContain('In progress');
    expect(el(fixture, '#result-count').textContent).toContain('4 attempts');
  });

  it('searches by student name or email', async () => {
    const { fixture } = await open();
    type(fixture, '#rf-search', 'kapoor meera');
    await settle(fixture);
    expect(keys(fixture)).toEqual(['meera@example.com#1']);
    expect(el(fixture, '#result-count').textContent).toContain('1 of 4');
    type(fixture, '#rf-search', 'RAVI@');
    await settle(fixture);
    expect(keys(fixture)).toEqual(['ravi@example.com#1']);
    type(fixture, '#rf-search', 'nobody');
    await settle(fixture);
    expect(text(fixture)).toContain('No attempts match');
  });

  it('filters by passed, not passed and in progress', async () => {
    const { fixture } = await open();
    type(fixture, '#rf-result', 'passed');
    await settle(fixture);
    expect(keys(fixture).sort()).toEqual(['asha@example.com#2', 'ravi@example.com#1']);
    type(fixture, '#rf-result', 'failed');
    await settle(fixture);
    expect(keys(fixture)).toEqual(['asha@example.com#1']);
    type(fixture, '#rf-result', 'progress');
    await settle(fixture);
    expect(keys(fixture)).toEqual(['meera@example.com#1']);
  });

  it('shows only each student\'s best attempt when asked', async () => {
    const { fixture } = await open();
    el<HTMLInputElement>(fixture, '#rf-best').click();
    await settle(fixture);
    expect(keys(fixture).sort()).toEqual(['asha@example.com#2', 'meera@example.com#1', 'ravi@example.com#1']);
  });

  it('sorts by newest, highest score, lowest score and name', async () => {
    const { fixture } = await open();
    expect(keys(fixture)).toEqual(['asha@example.com#2', 'meera@example.com#1', 'asha@example.com#1', 'ravi@example.com#1']); // newest first
    type(fixture, '#rf-sort', 'high');
    await settle(fixture);
    expect(keys(fixture).slice(0, 3)).toEqual(['asha@example.com#2', 'ravi@example.com#1', 'asha@example.com#1']);
    expect(keys(fixture)[3]).toBe('meera@example.com#1'); // unfinished attempts have no score, so they come last
    type(fixture, '#rf-sort', 'low');
    await settle(fixture);
    expect(keys(fixture).slice(0, 3)).toEqual(['asha@example.com#1', 'ravi@example.com#1', 'asha@example.com#2']);
    type(fixture, '#rf-sort', 'name');
    await settle(fixture);
    expect(keys(fixture)).toEqual(['asha@example.com#1', 'asha@example.com#2', 'meera@example.com#1', 'ravi@example.com#1']);
  });

  it('opens an attempt under its row with the review, and closes it again', async () => {
    const { fixture, http } = await open();
    el<HTMLElement>(fixture, '[data-attempt="ravi@example.com#1"]').click();
    await settle(fixture);
    expect(text(fixture)).toContain('Loading…');
    const request = http.expectOne(`${API}/api/admin/tests/t1/results/ravi%40example.com/1`);
    expect(request.request.method).toBe('GET');
    request.flush({
      status: 'submitted', test_id: 't1', number: 1, title: 'CAT Mock 1', started_at: '', submitted_at: '', auto_submitted: false, correct: 3, wrong: 1, unanswered: 0,
      marks: '9', total_marks: '12', percentage: '75', passed: true, pass_percentage: 50, marks_correct: '3', marks_incorrect: '-1', show_answers: false,
      student: { email: 'ravi@example.com', name: 'Ravi Kumar' },
      review: [{ id: 'q1', kind: 'mcq', text: 'Easy one?', options: [{ text: 'Alpha' }, { text: 'Beta' }], images: {}, passage: null, passage_text: null, result: 'w', given: 0, correct: 1, reasons: ['No.', 'Yes.'], answer: null, explanation: null }],
    });
    await settle(fixture);
    const detail = el(fixture, '[data-detail="ravi@example.com#1"]');
    expect(detail.textContent).toContain('Easy one?');
    expect(detail.textContent).toContain('Yes.');
    expect(detail.querySelector('.page-head')).toBeNull(); // shown inside the page, without its own heading
    expect(detail.textContent).not.toContain('not shown'); // the admin sees the review even if students don't
    el<HTMLElement>(fixture, '[data-attempt="ravi@example.com#1"]').click();
    await settle(fixture);
    expect(all(fixture, '[data-detail]').length).toBe(0);
  });

  it('says how far an unfinished attempt has got', async () => {
    const { fixture, http } = await open();
    el<HTMLElement>(fixture, '[data-attempt="meera@example.com#1"]').click();
    http.expectOne(`${API}/api/admin/tests/t1/results/meera%40example.com/1`).flush({
      status: 'in_progress', test_id: 't1', number: 1, title: 'CAT Mock 1', started_at: '', student: { email: 'meera@example.com', name: 'Meera Kapoor' }, answered: 2, questions: 4,
    });
    await settle(fixture);
    expect(el(fixture, '#detail-progress').textContent).toContain('2 of 4 questions');
  });

  it('shows the server\'s message when an attempt cannot be opened', async () => {
    const { fixture, http } = await open();
    el<HTMLElement>(fixture, '[data-attempt="ravi@example.com#1"]').click();
    http.expectOne(`${API}/api/admin/tests/t1/results/ravi%40example.com/1`).flush({ detail: "We couldn't find that attempt." }, { status: 404, statusText: 'x' });
    await settle(fixture);
    expect(el(fixture, '[data-detail]').textContent).toContain("We couldn't find that attempt.");
  });

  it('shows how each question went, with the wrong option chosen most', async () => {
    const { fixture } = await open();
    const hard = el(fixture, '[data-question="q2"]').textContent!.replace(/\s+/g, ' ');
    expect(hard).toContain('Hard one?');
    expect(hard).toContain('33.3%');
    expect(hard).toContain('3 of 3');
    expect(hard).toContain('C: Gamma (2)');
    expect(el(fixture, '[data-question="q2"] .meter').className).toContain('hard');
    expect(el(fixture, '[data-question="q3"] .meter').className).toContain('mid');
    expect(el(fixture, '[data-question="q1"] .meter').className).not.toContain('hard');
    expect(el(fixture, '[data-question="q4"]').textContent).toContain('–');
  });

  it('can put the hardest questions first', async () => {
    const { fixture } = await open();
    const order = () => all(fixture, '[data-question]').map((r) => r.getAttribute('data-question'));
    expect(order()).toEqual(['q1', 'q2', 'q3', 'q4']);
    clickButton(fixture, 'Hardest first');
    await settle(fixture);
    expect(order()).toEqual(['q2', 'q3', 'q1', 'q4']);
    clickButton(fixture, 'Test order');
    await settle(fixture);
    expect(order()).toEqual(['q1', 'q2', 'q3', 'q4']);
  });

  it('downloads the attempts as a CSV file with a header and safe cells', async () => {
    const tricky = { ...DATA, attempts: [row('=Evil, "Name"', 'e@example.com', 1), MEERA] };
    const { fixture } = await open(tricky);
    let blob: Blob | undefined;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = (b: Blob) => { blob = b; return 'blob:x'; };
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    const link = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe('cat-mock-1-results.csv'); });
    clickButton(fixture, 'Download CSV');
    await settle(fixture); // the download waits for any remaining pages first
    expect(link).toHaveBeenCalled();
    const content = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob as Blob);
    });
    const lines = content.replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('Student,Email,Attempt,Status,Started,Submitted,Minutes,Marks,Total marks,Percentage,Result,Correct,Wrong,Not answered,Time ran out');
    expect(lines[1]).toContain(`"'=Evil, ""Name"""`);
    expect(lines[1]).toContain('Submitted');
    expect(lines[1]).toContain(',20,9,12,75,Passed,3,1,0,');
    expect(lines[2]).toContain('In progress');
    link.mockRestore();
  });

  it('says when no one has started the test, and has no download', async () => {
    const { fixture } = await open({ ...DATA, summary: { ...DATA.summary, students: 0, attempts: 0, submitted: 0, in_progress: 0, average: null, highest: null, lowest: null, passed: 0, pass_rate: null, distribution: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, attempts: [] });
    expect(text(fixture)).toContain('No one has started this test yet');
    expect(all(fixture, '#attempt-table').length).toBe(0);
  });

  it('explains a test that cannot be loaded', async () => {
    const env = setupTestBed({ params: { id: 'nope' } });
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(AdminTestResults);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/admin/tests/nope/results?limit=25`).flush({ detail: "We couldn't find that test." }, { status: 404, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain("We couldn't find that test.");
  });
});

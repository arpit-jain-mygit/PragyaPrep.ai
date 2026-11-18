import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { all, clickButton, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { TestResult } from './test-result';

const OPTS = [{ text: 'Alpha' }, { text: 'Beta' }, { text: 'Gamma' }, { text: 'Delta' }];
const REASONS = ['Because alpha.', 'Because beta.', 'Because gamma.', 'Because delta.'];
function item(id: string, result: 'c' | 'w' | 'u', extra: object = {}) {
  return { id, kind: 'mcq', text: `Question ${id}`, options: OPTS, images: {}, passage: null, passage_text: null, result, given: result === 'u' ? null : result === 'c' ? 1 : 0, correct: 1, reasons: REASONS, answer: null, explanation: null, ...extra };
}
const BASE = {
  status: 'submitted', test_id: 't1', number: 2, title: 'CAT Mock 1', started_at: '', submitted_at: '', auto_submitted: false, correct: 1, wrong: 1, unanswered: 1,
  marks: '2', total_marks: '9', percentage: '22.22', passed: false, pass_percentage: 40, marks_correct: '3', marks_incorrect: '-1', show_answers: true,
};

function open(overrides: object) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(TestResult);
  fixture.componentRef.setInput('result', { ...BASE, review: null, ...overrides });
  fixture.detectChanges();
  return { ...env, fixture };
}

describe('Test result', () => {
  it('shows the score, the verdict, the percentage and the counts', async () => {
    const { fixture } = open({});
    await settle(fixture);
    expect(el(fixture, '#score').textContent).toContain('2');
    expect(el(fixture, '#score').textContent).toContain('/ 9');
    expect(el(fixture, '#verdict').textContent).toContain('Not passed');
    expect(el(fixture, '#verdict').className).toContain('bad');
    expect(el(fixture, '#percentage').textContent).toContain('22.22% (pass mark 40%)');
    expect(el(fixture, '#counts').textContent).toContain('1 correct');
    expect(el(fixture, '#counts').textContent).toContain('1 wrong');
    expect(el(fixture, '#counts').textContent).toContain('1 not answered');
  });

  it('shows a pass in green', async () => {
    const { fixture } = open({ passed: true, marks: '9', percentage: '100' });
    await settle(fixture);
    expect(el(fixture, '#verdict').textContent).toContain('Passed');
    expect(el(fixture, '#verdict').className).toContain('ok');
  });

  it('says so when the time ran out, and when answers are not shown', async () => {
    const { fixture } = open({ auto_submitted: true, show_answers: false });
    await settle(fixture);
    expect(el(fixture, '#auto-note').textContent).toContain('Time ran out');
    expect(el(fixture, '#no-review').textContent).toContain('not shown');
    expect(all(fixture, '.review').length).toBe(0);
  });

  it('reviews every question with the right answer, the student\'s answer and the reasons', async () => {
    const { fixture } = open({ review: [item('1', 'c'), item('2', 'w'), item('3', 'u')] });
    await settle(fixture);
    expect(all(fixture, '.review').length).toBe(3);
    const wrong = el(fixture, '[data-review="2"]');
    expect(wrong.getAttribute('data-result')).toBe('w');
    expect(wrong.textContent).toContain('Wrong');
    expect(wrong.querySelector('[data-opt="1"]')!.className).toContain('is-correct');
    expect(wrong.querySelector('[data-opt="1"]')!.textContent).toContain('correct answer');
    expect(wrong.querySelector('[data-opt="0"]')!.className).toContain('is-wrong');
    expect(wrong.querySelector('[data-opt="0"]')!.textContent).toContain('your answer');
    expect(wrong.textContent).toContain('Because gamma.');
    expect(el(fixture, '[data-review="3"]').textContent).toContain('Not answered');
    expect(el(fixture, '[data-review="1"]').textContent).toContain('Correct');
  });

  it('filters the review to wrong or unanswered questions', async () => {
    const { fixture } = open({ review: [item('1', 'c'), item('2', 'w'), item('3', 'u')] });
    await settle(fixture);
    clickButton(fixture, 'Wrong 1');
    await settle(fixture);
    expect(all(fixture, '.review').map((r) => r.getAttribute('data-review'))).toEqual(['2']);
    clickButton(fixture, 'Not answered 1');
    await settle(fixture);
    expect(all(fixture, '.review').map((r) => r.getAttribute('data-review'))).toEqual(['3']);
    clickButton(fixture, 'All 3');
    await settle(fixture);
    expect(all(fixture, '.review').length).toBe(3);
  });

  it('shows a fill-in question with the typed answer, the right answer and the explanation', async () => {
    const { fixture } = open({ review: [{ ...item('9', 'w'), kind: 'fill_in', options: [], given: 'Rome', correct: null, reasons: [], answer: 'Paris', explanation: 'Paris is the capital.' }] });
    await settle(fixture);
    const card = el(fixture, '[data-review="9"]').textContent!;
    expect(card).toContain('Your answer: Rome');
    expect(card).toContain('Correct answer: Paris');
    expect(card).toContain('Paris is the capital.');
  });

  it('shows a passage once above the questions that share it', async () => {
    const shared = { passage: 'p1', passage_text: 'The monsoon arrives in June.' };
    const { fixture } = open({ review: [item('1', 'c', shared), item('2', 'w', shared), item('3', 'u')] });
    await settle(fixture);
    expect(all(fixture, '.passage-head').length).toBe(1);
    expect(text(fixture)).toContain('The monsoon arrives in June.');
  });

  it('links back to the test and the list of tests', async () => {
    const { fixture } = open({});
    await settle(fixture);
    const links = all<HTMLAnchorElement>(fixture, '.page-head a').map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/demo/tests/t1', '/demo/learning/tests']);
  });

  it('can be shown inside another page without its own heading and links', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(TestResult);
    fixture.componentRef.setInput('result', { ...BASE, review: [item('1', 'c')] });
    fixture.componentRef.setInput('embedded', true);
    fixture.detectChanges();
    await settle(fixture);
    expect(all(fixture, '.page-head').length).toBe(0);
    expect(all(fixture, '#result-card').length).toBe(1);
    expect(all(fixture, '.review').length).toBe(1);
  });

  it('shows a review that is there even if the test hides answers from students (the admin\'s view)', async () => {
    const { fixture } = open({ show_answers: false, review: [item('1', 'w')] });
    await settle(fixture);
    expect(all(fixture, '.review').length).toBe(1);
    expect(all(fixture, '#no-review').length).toBe(0);
  });
});

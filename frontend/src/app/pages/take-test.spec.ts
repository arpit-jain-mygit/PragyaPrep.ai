import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API, all, clickButton, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { TakeTest } from './take-test';

const OPTIONS = [{ text: 'Alpha' }, { text: 'Beta' }, { text: 'Gamma' }, { text: 'Delta' }];
function mcq(id: string, textValue: string, extra: object = {}) {
  return { id, kind: 'mcq', text: textValue, options: OPTIONS, images: {}, passage: null, passage_text: null, ...extra };
}
const QUESTIONS = [
  mcq('q1', 'First question?', { passage: 'p1', passage_text: 'The monsoon arrives in June.' }),
  mcq('q2', 'Second question?', { images: { question: 'https://img/q2.png', B: 'https://img/b.png' } }),
  { id: 'q3', kind: 'fill_in', text: 'Capital of France?', options: [], images: {}, passage: null, passage_text: null },
];
function attemptOf(overrides: object = {}) {
  return { status: 'in_progress', test_id: 't1', number: 1, title: 'CAT Mock 1', started_at: '2027-01-15T08:00:00+00:00', duration_minutes: 30, remaining_seconds: 1800, questions: QUESTIONS, answers: {}, ...overrides };
}
const RESULT = {
  status: 'submitted', test_id: 't1', number: 1, title: 'CAT Mock 1', started_at: '', submitted_at: '', auto_submitted: false, correct: 1, wrong: 1, unanswered: 1,
  marks: '2', total_marks: '9', percentage: '22.22', passed: false, pass_percentage: 40, marks_correct: '3', marks_incorrect: '-1', show_answers: true, review: [],
};
const SAVE = `${API}/api/my/tests/t1/attempts/1/answers`;

function open(attempt = attemptOf()) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(TakeTest);
  fixture.componentRef.setInput('attempt', attempt);
  const finished: object[] = [];
  fixture.componentInstance.finished.subscribe((r) => finished.push(r));
  fixture.detectChanges();
  return { ...env, fixture, finished };
}

async function tickSeconds(fixture: ReturnType<typeof open>['fixture'], seconds: number) {
  for (let i = 0; i < seconds; i++) vi.advanceTimersByTime(1000);
  await settle(fixture);
}

describe('Taking a test', () => {
  // Only the one-second countdown is faked. The page's own scheduling needs real timers to redraw.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    TakeTest.timing = { typingPause: 20, retry: 40 };
  });
  afterEach(() => {
    vi.useRealTimers();
    TakeTest.timing = { typingPause: 500, retry: 5000 };
  });

  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('shows the first question, the numbered palette and the time left', async () => {
    const { fixture } = open();
    await settle(fixture);
    expect(text(fixture)).toContain('Question 1 of 3');
    expect(text(fixture)).toContain('First question?');
    expect(el(fixture, '#take-passage').textContent).toContain('The monsoon arrives in June.');
    expect(all(fixture, '.pal').length).toBe(3);
    expect(el(fixture, '.pal.current').textContent).toContain('1');
    expect(el(fixture, '#timer').textContent).toContain('30:00');
    expect(all(fixture, '.choice').map((c) => c.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['A Alpha', 'B Beta', 'C Gamma', 'D Delta']);
  });

  it('counts down every second, and turns red in the last five minutes', async () => {
    const { fixture } = open(attemptOf({ remaining_seconds: 302 }));
    await settle(fixture);
    expect(el(fixture, '#timer').className).not.toContain('low');
    await tickSeconds(fixture, 2);
    expect(el(fixture, '#timer').textContent).toContain('05:00');
    expect(el(fixture, '#timer').className).toContain('low');
    fixture.destroy();
  });

  it('shows hours when the test is long', async () => {
    const { fixture } = open(attemptOf({ remaining_seconds: 5400 }));
    await settle(fixture);
    expect(el(fixture, '#timer').textContent).toContain('1:30:00');
  });

  it('moves between questions with Next, Previous and the palette, and shows pictures', async () => {
    const { fixture } = open();
    await settle(fixture);
    expect(el<HTMLButtonElement>(fixture, '#prev').disabled).toBe(true);
    clickButton(fixture, 'Next');
    await settle(fixture);
    expect(text(fixture)).toContain('Second question?');
    expect(el<HTMLImageElement>(fixture, '.take-question img[alt="Picture for the question"]').src).toContain('q2.png');
    expect(el<HTMLImageElement>(fixture, '.take-question img[alt="Picture for option B"]').src).toContain('b.png');
    el<HTMLButtonElement>(fixture, '[data-q="3"]').click();
    await settle(fixture);
    expect(text(fixture)).toContain('Capital of France?');
    expect(el<HTMLButtonElement>(fixture, '#next').disabled).toBe(true);
    clickButton(fixture, 'Previous');
    await settle(fixture);
    expect(text(fixture)).toContain('Second question?');
  });

  it('saves a chosen option at once and marks the question answered', async () => {
    const { fixture, http } = open();
    await settle(fixture);
    el<HTMLInputElement>(fixture, '[data-option="1"] input').click();
    await settle(fixture);
    const request = http.expectOne(SAVE);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ answers: { q1: 1 } });
    request.flush({ saved: 1, remaining_seconds: 1795 });
    await settle(fixture);
    expect(el(fixture, '.pal[data-q="1"]').className).toContain('answered');
    expect(el(fixture, '[data-option="1"]').className).toContain('chosen');
    expect(el(fixture, '#timer').textContent).toContain('29:55'); // the clock follows the server's seconds
  });

  it('waits for a pause in typing before saving a typed answer, and clears an answer with null', async () => {
    const { fixture, http } = open();
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '[data-q="3"]').click();
    await settle(fixture);
    type(fixture, '#typed-answer', 'Par');
    type(fixture, '#typed-answer', 'Paris');
    http.expectNone(SAVE);
    await pause(80);
    await settle(fixture);
    const request = http.expectOne(SAVE);
    expect(request.request.body).toEqual({ answers: { q3: 'Paris' } });
    request.flush({ saved: 1, remaining_seconds: 1700 });
    await settle(fixture);
    expect(el(fixture, '.pal[data-q="3"]').className).toContain('answered');
    clickButton(fixture, 'Clear answer');
    await settle(fixture);
    const clear = http.expectOne(SAVE);
    expect(clear.request.body).toEqual({ answers: { q3: null } });
    clear.flush({ saved: 1, remaining_seconds: 1699 });
    await settle(fixture);
    expect(el(fixture, '.pal[data-q="3"]').className).not.toContain('answered');
  });

  it('starts with the answers already saved, so a refreshed page carries on', async () => {
    const { fixture } = open(attemptOf({ answers: { q1: 2, q3: 'Rome' } }));
    await settle(fixture);
    expect(el<HTMLInputElement>(fixture, '[data-option="2"] input').checked).toBe(true);
    expect(el(fixture, '.pal[data-q="1"]').className).toContain('answered');
    expect(el(fixture, '.pal[data-q="3"]').className).toContain('answered');
    expect(el(fixture, '.pal[data-q="2"]').className).not.toContain('answered');
    el<HTMLButtonElement>(fixture, '[data-q="3"]').click();
    await settle(fixture);
    expect(el<HTMLInputElement>(fixture, '#typed-answer').value).toBe('Rome');
  });

  it('marks a question for review and shows it on the palette', async () => {
    const { fixture } = open();
    await settle(fixture);
    clickButton(fixture, 'Mark for review');
    await settle(fixture);
    expect(el(fixture, '.pal[data-q="1"]').className).toContain('flag');
    expect(text(fixture)).toContain('Unmark');
    clickButton(fixture, 'Unmark');
    await settle(fixture);
    expect(el(fixture, '.pal[data-q="1"]').className).not.toContain('flag');
  });

  it('keeps a failed save and tries again, saying so', async () => {
    const { fixture, http } = open();
    await settle(fixture);
    el<HTMLInputElement>(fixture, '[data-option="0"] input').click();
    await settle(fixture);
    http.expectOne(SAVE).flush({ detail: 'x' }, { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(el(fixture, '#save-state').textContent).toContain('Not saved yet');
    expect(el(fixture, '.pal[data-q="1"]').className).toContain('answered'); // still shown as answered on screen
    await pause(120);
    await settle(fixture);
    const again = http.expectOne(SAVE);
    expect(again.request.body).toEqual({ answers: { q1: 0 } });
    again.flush({ saved: 1, remaining_seconds: 1700 });
    await settle(fixture);
    expect(el(fixture, '#save-state').textContent?.trim()).toBe('');
  });

  it('asks before submitting, counts what was answered, and goes back if the student keeps going', async () => {
    const { fixture, http } = open(attemptOf({ answers: { q1: 1 } }));
    await settle(fixture);
    clickButton(fixture, 'Mark for review');
    clickButton(fixture, 'Submit');
    await settle(fixture);
    expect(el(fixture, '#submit-box').textContent).toContain('You answered 1 of 3');
    expect(el(fixture, '#submit-box').textContent).toContain('1 marked for review');
    clickButton(fixture, 'Keep going');
    await settle(fixture);
    expect(all(fixture, '#submit-box').length).toBe(0);
    http.expectNone(`${API}/api/my/tests/t1/attempts/1/submit`);
  });

  it('submits after saving what is waiting, then hands over the result', async () => {
    const { fixture, http, finished } = open();
    await settle(fixture);
    el<HTMLInputElement>(fixture, '[data-option="1"] input').click();
    await settle(fixture);
    http.expectOne(SAVE).flush({ saved: 1, remaining_seconds: 1700 });
    await settle(fixture);
    type(fixture, '#take-question input[type=radio]', 'x');
    clickButton(fixture, 'Submit');
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#confirm-submit').click();
    await settle(fixture);
    const request = http.expectOne(`${API}/api/my/tests/t1/attempts/1/submit`);
    expect(request.request.method).toBe('POST');
    request.flush(RESULT);
    await settle(fixture);
    expect(finished).toEqual([RESULT]);
  });

  it('does not submit when the last answers could not be saved, and says why', async () => {
    const { fixture, http, finished } = open();
    await settle(fixture);
    el<HTMLInputElement>(fixture, '[data-option="1"] input').click();
    await settle(fixture);
    http.expectOne(SAVE).flush({ detail: 'x' }, { status: 500, statusText: 'x' });
    await settle(fixture);
    clickButton(fixture, 'Submit');
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#confirm-submit').click();
    await settle(fixture);
    http.expectOne(SAVE).flush({ detail: 'x' }, { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain("We couldn't save your last answers.");
    http.expectNone(`${API}/api/my/tests/t1/attempts/1/submit`);
    expect(finished).toEqual([]);
    fixture.destroy();
  });

  it('hands in by itself when the clock reaches zero', async () => {
    const { fixture, http, finished } = open(attemptOf({ remaining_seconds: 2 }));
    await settle(fixture);
    await tickSeconds(fixture, 2);
    const request = http.expectOne(`${API}/api/my/tests/t1/attempts/1/submit`);
    request.flush({ ...RESULT, auto_submitted: true });
    await settle(fixture);
    expect(finished.length).toBe(1);
    expect((finished[0] as { auto_submitted: boolean }).auto_submitted).toBe(true);
  });

  it('shows the result at once when the server says time is up while saving', async () => {
    const { fixture, http, finished } = open();
    await settle(fixture);
    el<HTMLInputElement>(fixture, '[data-option="1"] input').click();
    await settle(fixture);
    http.expectOne(SAVE).flush({ detail: 'Time is up. Your test was submitted.', finished: true, result: { ...RESULT, auto_submitted: true } }, { status: 409, statusText: 'x' });
    await settle(fixture);
    expect(finished.length).toBe(1);
    expect((finished[0] as { auto_submitted: boolean }).auto_submitted).toBe(true);
    http.expectNone(`${API}/api/my/tests/t1/attempts/1/submit`);
  });

  it('shows the server\'s message if handing in fails and lets the student try again', async () => {
    const { fixture, http, finished } = open();
    await settle(fixture);
    clickButton(fixture, 'Submit');
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#confirm-submit').click();
    await settle(fixture);
    http.expectOne(`${API}/api/my/tests/t1/attempts/1/submit`).flush({ detail: 'Server trouble.' }, { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('Server trouble.');
    expect(finished).toEqual([]);
    expect(el<HTMLButtonElement>(fixture, '#confirm-submit').disabled).toBe(false);
  });
});

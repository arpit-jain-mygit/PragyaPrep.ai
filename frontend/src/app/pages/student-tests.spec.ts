import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { StudentAttempt } from './student-attempt';
import { StudentTest } from './student-test';
import { StudentTests } from './student-tests';

function card(overrides: object = {}) {
  return {
    id: 't1', title: 'CAT Mock 1', description: 'Read the questions carefully.\nGood luck.', start_at: '2027-01-10T09:00', end_at: '2027-01-31T23:59',
    duration_minutes: 60, max_attempts: 3, pass_percentage: 40, marks_correct: '3', marks_incorrect: '-1', show_answers: true,
    question_count: 20, total_marks: '60', state: 'open', attempts_used: 0, attempts_left: 3, in_progress: null, best: null, attempts: [], ...overrides,
  };
}

async function openList(list: object[]) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(StudentTests);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/my/tests`).flush(list);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Student tests list', () => {
  it('searches by name and filters by type: course, my practice, set by your parent', async () => {
    const { fixture } = await openList([
      card({ id: 'a', title: 'CAT Mock 1' }),
      card({ id: 'b', title: 'Practice: Optics', practice: true, set_by: null }),
      card({ id: 'c', title: 'Practice: Magnetism', practice: true, set_by: 'meena@example.com' }),
    ]);
    const names = () => all(fixture, 'article[data-test]').map((a) => a.getAttribute('data-test'));
    expect(names().sort()).toEqual(['CAT Mock 1', 'Practice: Magnetism', 'Practice: Optics']);
    type(fixture, '#t-type', 'parent');
    await settle(fixture);
    expect(names()).toEqual(['Practice: Magnetism']);
    type(fixture, '#t-type', 'practice');
    await settle(fixture);
    expect(names()).toEqual(['Practice: Optics']);
    type(fixture, '#t-type', 'course');
    await settle(fixture);
    expect(names()).toEqual(['CAT Mock 1']);
    type(fixture, '#t-type', '');
    type(fixture, '#t-search', 'magnet');
    await settle(fixture);
    expect(names()).toEqual(['Practice: Magnetism']);
    type(fixture, '#t-search', 'zzz');
    await settle(fixture);
    expect(el(fixture, '#no-match').textContent).toContain('No tests match');
  });

  it('has no search box when there are no tests at all', async () => {
    const { fixture } = await openList([]);
    expect(all(fixture, '#test-filters').length).toBe(0);
    expect(text(fixture)).toContain('No tests for your courses yet');
  });

  it('marks a practice test the student made as Practice, and one a parent set as Set by your parent', async () => {
    const { fixture } = await openList([
      card({ id: 'p1', title: 'Practice: Optics', practice: true, set_by: null }),
      card({ id: 'p2', title: 'Practice: Magnetism', practice: true, set_by: 'meena@example.com' }),
      card({ id: 't9', title: 'Plain test' }),
    ]);
    const own = el(fixture, '[data-test="Practice: Optics"]');
    expect(own.textContent).toContain('Practice');
    expect(own.querySelector('#set-by-parent')).toBeNull();
    const set = el(fixture, '[data-test="Practice: Magnetism"]');
    expect(set.querySelector('#set-by-parent')!.textContent).toContain('Set by your parent');
    expect(el(fixture, '[data-test="Plain test"]').textContent).not.toContain('Practice');
    expect(el(fixture, '[data-test="Plain test"]').querySelector('#set-by-parent')).toBeNull();
  });

  it('lists each test with its size, marking window, attempts and best score', async () => {
    const { fixture } = await openList([card({ minutes_left: 3000, attempts_used: 1, attempts_left: 2, best: { marks: '33', percentage: '55', passed: true } })]);
    const row = el(fixture, '[data-test="CAT Mock 1"]').textContent!.replace(/\s+/g, ' ');
    expect(row).toContain('20 questions · 60 marks · 60 min · pass 40%');
    expect(row).toContain('Closes in 2 days');
    expect(row).toContain('until');
    expect(row).toContain('Attempts 1 of 3');
    expect(row).toContain('best 55%');
    expect(row).toContain('passed');
    expect(row).toContain('Start');
    expect(row).toContain('Open');
  });

  it('shows Resume for a test in progress, and puts it first, then open, upcoming and finished', async () => {
    const { fixture } = await openList([
      card({ id: 'e', title: 'Ended one', state: 'ended' }),
      card({ id: 'u', title: 'Upcoming one', state: 'upcoming', start_at: '2027-03-01T09:00' }),
      card({ id: 'o', title: 'Open one' }),
      card({ id: 'p', title: 'Running one', in_progress: 1, attempts_used: 1 }),
    ]);
    expect(all(fixture, '[data-test]').map((r) => r.getAttribute('data-test'))).toEqual(['Running one', 'Open one', 'Upcoming one', 'Ended one']);
    expect(el(fixture, '[data-test="Running one"]').textContent).toContain('Resume');
    expect(el(fixture, '[data-test="Running one"]').textContent).toContain('In progress');
    expect(el(fixture, '[data-test="Upcoming one"]').textContent).toContain('Opens');
    expect(el(fixture, '[data-test="Upcoming one"]').textContent).not.toContain('Start');
    expect(el(fixture, '[data-test="Ended one"]').textContent).toContain('Ended');
  });

  it('groups tests as Overdue, Open now, Coming up and Finished, soonest first', async () => {
    const { fixture } = await openList([
      card({ id: 'f', title: 'Finished one', state: 'ended', attempts_used: 1, end_at: '2027-01-05T18:00' }),
      card({ id: 'u2', title: 'Later one', state: 'upcoming', opens_in_minutes: 9000, start_at: '2027-02-01T09:00' }),
      card({ id: 'u1', title: 'Next one', state: 'upcoming', opens_in_minutes: 300, start_at: '2027-01-16T09:00' }),
      card({ id: 'o2', title: 'Slow one', minutes_left: 5000 }),
      card({ id: 'o1', title: 'Urgent one', minutes_left: 90 }),
      card({ id: 'x', title: 'Missed one', state: 'ended', overdue: true, end_at: '2027-01-14T18:00' }),
    ]);
    expect(all(fixture, '[data-group]').map((h) => h.getAttribute('data-group'))).toEqual(['overdue', 'open', 'upcoming', 'finished']);
    expect(all(fixture, '[data-group]').map((h) => h.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Overdue 1', 'Open now 2', 'Coming up 2', 'Finished 1']);
    expect(all(fixture, '[data-test]').map((r) => r.getAttribute('data-test'))).toEqual(['Missed one', 'Urgent one', 'Slow one', 'Next one', 'Later one', 'Finished one']);
  });

  it('says how long is left, and shows an overdue test in red without a Start button', async () => {
    const { fixture } = await openList([
      card({ id: 'o1', title: 'Urgent one', minutes_left: 90 }),
      card({ id: 'u1', title: 'Next one', state: 'upcoming', opens_in_minutes: 300, start_at: '2027-01-16T09:00' }),
      card({ id: 'x', title: 'Missed one', state: 'ended', overdue: true, end_at: '2027-01-14T18:00' }),
    ]);
    const urgent = el(fixture, '[data-test="Urgent one"]');
    expect(urgent.textContent).toContain('Closes in 1 h 30 min');
    expect(urgent.querySelector('.due.urgent')).not.toBeNull();
    expect(el(fixture, '[data-test="Next one"]').textContent).toContain('Opens in 5 h');
    const missed = el(fixture, '[data-test="Missed one"]');
    expect(missed.textContent).toContain('Overdue');
    expect(missed.textContent).toContain('closed');
    expect(missed.querySelector('.status.bad')).not.toBeNull();
    expect(missed.textContent).not.toContain('Start');
  });

  it('shows Done and no Start when all attempts are used', async () => {
    const { fixture } = await openList([card({ attempts_used: 3, attempts_left: 0 })]);
    expect(el(fixture, '[data-test]').textContent).toContain('Done');
    expect(el(fixture, '[data-test]').textContent).not.toContain('Start');
  });

  it('invites the student to wait when there are no tests', async () => {
    const { fixture } = await openList([]);
    expect(text(fixture)).toContain('No tests for your courses yet');
  });

  it('explains a failure to load', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const failing = TestBed.createComponent(StudentTests);
    failing.detectChanges();
    env.http.expectOne(`${API}/api/my/tests`).flush({ detail: 'Nope.' }, { status: 403, statusText: 'x' });
    await settle(failing);
    expect(text(failing)).toContain('Nope.');
  });
});

async function openIntro(data: object) {
  const env = setupTestBed({ params: { id: 't1' } });
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(StudentTest);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/my/tests/t1`).flush(data);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Student test intro', () => {
  it('shows what is in the test, how it is marked and the instructions', async () => {
    const { fixture } = await openIntro(card());
    const page = text(fixture);
    expect(page).toContain('CAT Mock 1');
    expect(page).toContain('20');
    expect(page).toContain('+3 for a correct answer, -1 for a wrong one, nothing if left blank');
    expect(page).toContain('60 minutes');
    expect(page).toContain('40%');
    expect(page).toContain('0 used, 3 left');
    expect(page).toContain('You can see the correct answers after you submit.');
    expect(el(fixture, '#test-description').textContent).toContain('Good luck.');
    expect(text(fixture)).toContain('The clock starts when you click.');
  });

  it('says plainly when the test is not open yet', async () => {
    expect(text((await openIntro(card({ state: 'upcoming' }))).fixture)).toContain("This test isn't open yet.");
  });

  it('says plainly when the test has ended', async () => {
    const { fixture } = await openIntro(card({ state: 'ended' }));
    expect(text(fixture)).toContain('This test has ended.');
    expect(all(fixture, '#start-test').length).toBe(0);
  });

  it('says when all attempts are used, and when answers are not shown', async () => {
    const { fixture } = await openIntro(card({ attempts_left: 0, attempts_used: 3, show_answers: false }));
    expect(text(fixture)).toContain('You have used all your attempts.');
    expect(text(fixture)).toContain('Correct answers are not shown after you submit.');
  });

  it('starts an attempt and goes to it', async () => {
    const { fixture, http, navigate } = await openIntro(card());
    el<HTMLButtonElement>(fixture, '#start-test').click();
    const request = http.expectOne(`${API}/api/my/tests/t1/start`);
    expect(request.request.method).toBe('POST');
    request.flush({ status: 'in_progress', test_id: 't1', number: 2 });
    await settle(fixture);
    expect(navigate).toHaveBeenCalledWith(['/', 'demo', 'tests', 't1', 'attempts', 2]);
  });

  it('offers to resume an attempt in progress', async () => {
    const { fixture } = await openIntro(card({ in_progress: 1, attempts_used: 1, attempts: [{ number: 1, status: 'in_progress', started_at: '2027-01-15T08:00:00+00:00' }] }));
    expect(el(fixture, '#start-test').textContent).toContain('Resume attempt 1');
    expect(el(fixture, '[data-attempt="1"]').textContent).toContain('In progress');
  });

  it('lists the earlier attempts with their scores and a link to each result', async () => {
    const { fixture } = await openIntro(card({
      attempts_used: 2, attempts_left: 1,
      attempts: [
        { number: 1, status: 'submitted', started_at: '2027-01-15T08:00:00+00:00', marks: '33', total_marks: '60', percentage: '55', passed: true, auto_submitted: false },
        { number: 2, status: 'submitted', started_at: '2027-01-16T08:00:00+00:00', marks: '6', total_marks: '60', percentage: '10', passed: false, auto_submitted: true },
      ],
    }));
    expect(el(fixture, '[data-attempt="1"]').textContent).toContain('33 / 60 (55%)');
    expect(el(fixture, '[data-attempt="1"]').textContent).toContain('passed');
    expect(el(fixture, '[data-attempt="2"]').textContent).toContain('not passed');
    expect(el(fixture, '[data-attempt="2"]').textContent).toContain('time ran out');
    expect(el(fixture, '[data-attempt="1"] a').getAttribute('href')).toContain('/tests/t1/attempts/1');
  });

  it('shows the server\'s reason when starting is refused and stays on the page', async () => {
    const { fixture, http, navigate } = await openIntro(card());
    el<HTMLButtonElement>(fixture, '#start-test').click();
    http.expectOne(`${API}/api/my/tests/t1/start`).flush({ detail: 'You have used all your attempts for this test.' }, { status: 409, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('You have used all your attempts for this test.');
    expect(navigate).not.toHaveBeenCalled();
    expect(el<HTMLButtonElement>(fixture, '#start-test').disabled).toBe(false);
  });

  it('shows the Set by your parent tag on the test page too', async () => {
    const { fixture } = await openIntro(card({ practice: true, set_by: 'meena@example.com' }));
    expect(el(fixture, '#set-by-parent').textContent).toContain('Set by your parent');
  });

  it('has no parent tag on the test page for an ordinary test', async () => {
    const { fixture } = await openIntro(card());
    expect(all(fixture, '#set-by-parent').length).toBe(0);
  });

  it('explains a test that cannot be found', async () => {
    const env = setupTestBed({ params: { id: 'nope' } });
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentTest);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/tests/nope`).flush({ detail: "We couldn't find that test." }, { status: 404, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain("We couldn't find that test.");
  });
});

describe('Student attempt page', () => {
  const attempt = {
    status: 'in_progress', test_id: 't1', number: 1, title: 'CAT Mock 1', started_at: '2027-01-15T08:00:00+00:00', duration_minutes: 60, remaining_seconds: 3600,
    questions: [{ id: 'q1', kind: 'mcq', text: 'First?', options: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }], images: {}, passage: null, passage_text: null }], answers: {},
  };
  const result = {
    status: 'submitted', test_id: 't1', number: 1, title: 'CAT Mock 1', started_at: '', submitted_at: '', auto_submitted: false, correct: 1, wrong: 0, unanswered: 0,
    marks: '3', total_marks: '3', percentage: '100', passed: true, pass_percentage: 40, marks_correct: '3', marks_incorrect: '-1', show_answers: false, review: null,
  };

  async function openAttempt(data: object) {
    const env = setupTestBed({ params: { id: 't1', number: '1' } });
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentAttempt);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/tests/t1/attempts/1`).flush(data);
    await settle(fixture);
    return { ...env, fixture };
  }

  it('shows the test to take while the attempt is in progress', async () => {
    const { fixture } = await openAttempt(attempt);
    expect(all(fixture, 'app-take-test').length).toBe(1);
    expect(all(fixture, 'app-test-result').length).toBe(0);
    expect(text(fixture)).toContain('First?');
  });

  it('shows the result when the attempt is already finished', async () => {
    const { fixture } = await openAttempt(result);
    expect(all(fixture, 'app-test-result').length).toBe(1);
    expect(all(fixture, 'app-take-test').length).toBe(0);
    expect(el(fixture, '#verdict').textContent).toContain('Passed');
  });

  it('explains an attempt that cannot be found', async () => {
    const env = setupTestBed({ params: { id: 't1', number: '9' } });
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentAttempt);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/tests/t1/attempts/9`).flush({ detail: "We couldn't find that attempt." }, { status: 404, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain("We couldn't find that attempt.");
  });
});


describe('Schedule helpers', () => {
  it('writes a countdown in days, hours or minutes', async () => {
    const { countdown } = await import('../core/schedule');
    expect([countdown(1), countdown(45), countdown(60), countdown(320), countdown(1440), countdown(3000), countdown(10080)]).toEqual(
      ['1 min', '45 min', '1 h', '5 h 20 min', '1 day', '2 days', '7 days'],
    );
  });
});

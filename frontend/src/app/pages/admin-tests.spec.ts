import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, clickButton, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminTests } from './admin-tests';

const PAPERS = [
  { id: 'physics', name: 'Physics', section: 'II: Domain', stream: 'Science', topics: ['Optics', 'Magnetism'] },
  { id: 'english', name: 'English', section: 'I: Language', stream: 'All', topics: ['Reading comprehension'] },
];
const COURSES = [
  { id: 'c1', name: 'CAT', fee: 0, access: { type: 'unlimited' }, active: true, created_at: '', papers: [] },
  { id: 'c2', name: 'CLAT', fee: 0, access: { type: 'unlimited' }, active: true, created_at: '', papers: [] },
];
const BASE_Q = { images: {}, options: [], correct: 1, kind: 'mcq', status: 'published', created_at: '2027-01-01T00:00:00+00:00' };
const Q1 = { ...BASE_Q, id: 'q1', paper: 'physics', topic: 'Optics', difficulty: 'easy', text: 'Which colour bends the most?' };
const Q2 = { ...BASE_Q, id: 'q2', paper: 'physics', topic: 'Magnetism', difficulty: 'hard', text: 'What is the SI unit of magnetic field?' };
const Q3 = { ...BASE_Q, id: 'q3', paper: 'english', topic: 'Reading comprehension', difficulty: 'medium', text: 'When does the monsoon arrive?', passage: 'p1', created_at: '2027-01-02T00:00:00+00:00' };
const Q4 = { ...BASE_Q, id: 'q4', paper: 'english', topic: 'Reading comprehension', difficulty: 'medium', text: 'What do farmers sow?', passage: 'p1', created_at: '2027-01-03T00:00:00+00:00' };
const BANK = [Q1, Q2, Q3, Q4];

const T1 = {
  id: 't1', title: 'Mock 1', description: '', start_at: '2027-01-10T09:00', end_at: '2027-01-31T23:59', duration_minutes: 60,
  max_attempts: 2, pass_percentage: 40, marks_correct: '3', marks_incorrect: '-1', show_answers: true, courses: ['c1'],
  mode: 'manual', rules: [], question_ids: ['q1', 'q2'], status: 'published', question_count: 2, total_marks: '6',
};

async function open(tests: object[] = [T1]) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminTests);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/papers`).flush(PAPERS);
  await settle(fixture);
  env.http.expectOne(`${API}/api/admin/courses`).flush(COURSES);
  await settle(fixture);
  env.http.expectOne(`${API}/api/admin/tests`).flush(tests);
  await settle(fixture);
  return { ...env, fixture };
}

async function openForm(env: Awaited<ReturnType<typeof open>>, bank: object[] = BANK) {
  clickButton(env.fixture, 'New test');
  await settle(env.fixture);
  env.http.expectOne(`${API}/api/admin/questions?status=published`).flush(bank);
  await settle(env.fixture);
}

function fill(env: Awaited<ReturnType<typeof open>>) {
  type(env.fixture, '#t-title', 'Mock 2');
  type(env.fixture, '#t-start', '2027-02-01T09:00');
  type(env.fixture, '#t-end', '2027-02-28T23:59');
  type(env.fixture, '#t-duration', '45');
  type(env.fixture, '#t-attempts', '3');
  type(env.fixture, '#t-pass', '35');
  type(env.fixture, '#t-correct', '3');
  type(env.fixture, '#t-incorrect', '-1');
}

describe('Admin tests page', () => {
  it('lists each test with its courses, window, questions, time and status', async () => {
    const { fixture } = await open();
    const row = el(fixture, '[data-test="Mock 1"]').textContent!.replace(/\s+/g, ' ');
    expect(row).toContain('Mock 1');
    expect(row).toContain('6 marks · pass 40% · 2 attempts');
    expect(row).toContain('CAT');
    expect(row).toContain('Jan 2027');
    expect(row).toContain('60 min');
    expect(row).toContain('published');
    expect(el(fixture, '[data-test="Mock 1"] .status').className).toContain('ok');
  });

  it('shows an open window as any time', async () => {
    const { fixture } = await open([{ ...T1, start_at: null, end_at: null }]);
    expect(text(fixture)).toContain('Any time');
  });

  it('invites the admin to add the first test when there are none', async () => {
    const { fixture } = await open([]);
    expect(text(fixture)).toContain('No tests yet');
  });

  it('opens a form with date and time pickers, the courses to assign to, and the questions loaded', async () => {
    const env = await open();
    await openForm(env);
    expect(el<HTMLInputElement>(env.fixture, '#t-start').type).toBe('datetime-local');
    expect(el<HTMLInputElement>(env.fixture, '#t-end').type).toBe('datetime-local');
    expect(all(env.fixture, '#t-courses input[type=checkbox]').length).toBe(2);
    expect(text(env.fixture)).toContain('CAT');
    expect(text(env.fixture)).toContain('CLAT');
    expect(all(env.fixture, '[data-pick]').length).toBe(4);
    expect(el<HTMLInputElement>(env.fixture, '#t-mode-manual').checked).toBe(true);
  });

  it('adds questions by hand from the bank, with filters, and totals the marks', async () => {
    const env = await open([]);
    await openForm(env);
    type(env.fixture, '#t-correct', '3');
    type(env.fixture, '#p-paper', 'physics');
    await settle(env.fixture);
    expect(all(env.fixture, '[data-pick]').map((r) => r.getAttribute('data-pick'))).toEqual(['q1', 'q2']);
    type(env.fixture, '#p-level', 'hard');
    await settle(env.fixture);
    expect(all(env.fixture, '[data-pick]').map((r) => r.getAttribute('data-pick'))).toEqual(['q2']);
    type(env.fixture, '#p-level', '');
    type(env.fixture, '#p-search', 'colour');
    await settle(env.fixture);
    expect(all(env.fixture, '[data-pick]').map((r) => r.getAttribute('data-pick'))).toEqual(['q1']);

    el<HTMLInputElement>(env.fixture, '[data-pick="q1"] input').click();
    await settle(env.fixture);
    clickButton(env.fixture, 'Add 1');
    await settle(env.fixture);
    expect(all(env.fixture, '[data-selected]').map((r) => r.getAttribute('data-selected'))).toEqual(['q1']);
    expect(all(env.fixture, '[data-pick]').length).toBe(0); // already chosen, so no longer offered
    expect(text(env.fixture)).toContain('1 question');
    expect(el(env.fixture, '#total-marks').textContent).toContain('3 marks');
    expect(text(env.fixture)).toContain('Physics 1');
  });

  it('brings the rest of a passage along and says so', async () => {
    const env = await open([]);
    await openForm(env);
    el<HTMLInputElement>(env.fixture, '[data-pick="q3"] input').click();
    await settle(env.fixture);
    clickButton(env.fixture, 'Add 1');
    await settle(env.fixture);
    expect(all(env.fixture, '[data-selected]').map((r) => r.getAttribute('data-selected'))).toEqual(['q3', 'q4']);
    expect(el(env.fixture, '#pick-message').textContent).toContain('1 more from the same passage');
  });

  it('selects everything shown and removes a chosen question', async () => {
    const env = await open([]);
    await openForm(env);
    el<HTMLInputElement>(env.fixture, '#p-all').click();
    await settle(env.fixture);
    clickButton(env.fixture, 'Add 4');
    await settle(env.fixture);
    expect(all(env.fixture, '[data-selected]').length).toBe(4);
    const row = el(env.fixture, '[data-selected="q2"]');
    Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Remove question')!.click();
    await settle(env.fixture);
    expect(all(env.fixture, '[data-selected]').map((r) => r.getAttribute('data-selected'))).toEqual(['q1', 'q3', 'q4']);
  });

  it('saves a new test with every field and reloads the list', async () => {
    const env = await open([]);
    await openForm(env);
    fill(env);
    el<HTMLInputElement>(env.fixture, '#t-course-c1').click();
    el<HTMLInputElement>(env.fixture, '#t-course-c2').click();
    el<HTMLInputElement>(env.fixture, '#t-show').click();
    el<HTMLInputElement>(env.fixture, '[data-pick="q1"] input').click();
    await settle(env.fixture);
    clickButton(env.fixture, 'Add 1');
    type(env.fixture, '#t-status', 'published');
    await settle(env.fixture);
    el<HTMLButtonElement>(env.fixture, '#save-test').click();
    const request = env.http.expectOne(`${API}/api/admin/tests`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      title: 'Mock 2', description: '', start_at: '2027-02-01T09:00', end_at: '2027-02-28T23:59', duration_minutes: 45,
      max_attempts: 3, pass_percentage: 35, marks_correct: '3', marks_incorrect: '-1', show_answers: true,
      courses: ['c1', 'c2'], mode: 'manual', rules: [], question_ids: ['q1'], status: 'published',
    });
    request.flush({ ...T1, id: 't2', title: 'Mock 2', questions: [] });
    await settle(env.fixture);
    env.http.expectOne(`${API}/api/admin/tests`).flush([T1]);
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('Created the test.');
    expect(all(env.fixture, '#test-form').length).toBe(0);
  });

  it('shows every mistake next to its field and keeps the form open', async () => {
    const env = await open([]);
    await openForm(env);
    el<HTMLButtonElement>(env.fixture, '#save-test').click();
    env.http.expectOne(`${API}/api/admin/tests`).flush(
      {
        detail: 'Please correct the marked fields.',
        errors: {
          title: 'The title is required.', duration_minutes: 'Enter the duration in minutes, from 1 to 600.',
          marks_incorrect: 'Enter 0 or a negative number for a wrong answer, for example -1.', courses: 'Choose at least one course before publishing.',
          question_ids: 'Add at least one question before publishing.', end_at: 'The end must be after the start.',
        },
      },
      { status: 422, statusText: 'x' },
    );
    await settle(env.fixture);
    const page = text(env.fixture);
    for (const message of ['The title is required.', 'Enter the duration in minutes', 'Enter 0 or a negative number', 'Choose at least one course', 'Add at least one question', 'The end must be after the start.']) {
      expect(page).toContain(message);
    }
    expect(all(env.fixture, '#test-form').length).toBe(1);
    type(env.fixture, '#t-title', 'x');
    await settle(env.fixture);
    expect(text(env.fixture)).not.toContain('The title is required.');
  });

  it('picks questions automatically from rules and says what it found', async () => {
    const env = await open([]);
    await openForm(env);
    el<HTMLInputElement>(env.fixture, '#t-mode-auto').click();
    await settle(env.fixture);
    expect(all(env.fixture, '#manual-picker').length).toBe(0);
    type(env.fixture, '#r-paper-0', 'physics');
    await settle(env.fixture);
    expect(all(env.fixture, '#r-topic-0 option').map((o) => o.textContent?.trim())).toEqual(['Any topic', 'Optics', 'Magnetism']);
    type(env.fixture, '#r-topic-0', 'Optics');
    type(env.fixture, '#r-level-0', 'easy');
    type(env.fixture, '#r-count-0', '5');
    clickButton(env.fixture, 'Add rule');
    await settle(env.fixture);
    type(env.fixture, '#r-paper-1', 'english');
    type(env.fixture, '#r-count-1', '1');
    await settle(env.fixture);
    clickButton(env.fixture, 'Pick questions');
    const request = env.http.expectOne(`${API}/api/admin/tests/auto-pick`);
    expect(request.request.body).toEqual({
      rules: [{ paper: 'physics', topic: 'Optics', difficulty: 'easy', count: 5 }, { paper: 'english', topic: '', difficulty: '', count: 1 }],
      exclude: [],
    });
    request.flush({ question_ids: ['q1', 'q3', 'q4'], picked: 2, added_for_passages: 1, short: [{ rule: 1, wanted: 5, found: 1 }] });
    await settle(env.fixture);
    expect(all(env.fixture, '[data-selected]').map((r) => r.getAttribute('data-selected'))).toEqual(['q1', 'q3', 'q4']);
    const message = el(env.fixture, '#pick-message').textContent!;
    expect(message).toContain('Picked 3 questions.');
    expect(message).toContain('1 came with their passage.');
    expect(message).toContain('Rule 1: wanted 5, found 1.');
    expect(text(env.fixture)).toContain('Pick again');
  });

  it('shows the server\'s message when the rules are not usable, and sends the rules with the test', async () => {
    const env = await open([]);
    await openForm(env);
    el<HTMLInputElement>(env.fixture, '#t-mode-auto').click();
    await settle(env.fixture);
    clickButton(env.fixture, 'Pick questions');
    env.http.expectOne(`${API}/api/admin/tests/auto-pick`).flush({ detail: 'Rule 1: choose a subject.' }, { status: 422, statusText: 'x' });
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('Rule 1: choose a subject.');

    type(env.fixture, '#r-paper-0', 'physics');
    type(env.fixture, '#r-count-0', '2');
    await settle(env.fixture);
    fill(env);
    el<HTMLButtonElement>(env.fixture, '#save-test').click();
    const body = env.http.expectOne(`${API}/api/admin/tests`).request.body;
    expect(body.mode).toBe('auto');
    expect(body.rules).toEqual([{ paper: 'physics', topic: '', difficulty: '', count: 2 }]);
  });

  it('keeps at least one rule and lets rules be removed', async () => {
    const env = await open([]);
    await openForm(env);
    el<HTMLInputElement>(env.fixture, '#t-mode-auto').click();
    await settle(env.fixture);
    expect(el<HTMLButtonElement>(env.fixture, '[data-rule="0"] button').disabled).toBe(true);
    clickButton(env.fixture, 'Add rule');
    await settle(env.fixture);
    expect(all(env.fixture, '[data-rule]').length).toBe(2);
    el<HTMLButtonElement>(env.fixture, '[data-rule="1"] button').click();
    await settle(env.fixture);
    expect(all(env.fixture, '[data-rule]').length).toBe(1);
  });

  it('opens an existing test filled in, and sends the whole form back on save', async () => {
    const env = await open();
    clickButton(env.fixture, 'Edit');
    env.http.expectOne(`${API}/api/admin/tests/t1`).flush({ ...T1, questions: [Q1, Q2] });
    await settle(env.fixture);
    env.http.expectOne(`${API}/api/admin/questions?status=published`).flush(BANK);
    await settle(env.fixture);
    expect(el<HTMLInputElement>(env.fixture, '#t-title').value).toBe('Mock 1');
    expect(el<HTMLInputElement>(env.fixture, '#t-start').value).toBe('2027-01-10T09:00');
    expect(el<HTMLInputElement>(env.fixture, '#t-duration').value).toBe('60');
    expect(el<HTMLInputElement>(env.fixture, '#t-show').checked).toBe(true);
    expect(el<HTMLInputElement>(env.fixture, '#t-course-c1').checked).toBe(true);
    expect(el<HTMLInputElement>(env.fixture, '#t-course-c2').checked).toBe(false);
    expect(all(env.fixture, '[data-selected]').map((r) => r.getAttribute('data-selected'))).toEqual(['q1', 'q2']);
    expect(text(env.fixture)).toContain('Which colour bends the most?');
    type(env.fixture, '#t-title', 'Mock 1 (final)');
    await settle(env.fixture);
    el<HTMLButtonElement>(env.fixture, '#save-test').click();
    const request = env.http.expectOne(`${API}/api/admin/tests/t1`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body.title).toBe('Mock 1 (final)');
    expect(request.request.body.question_ids).toEqual(['q1', 'q2']);
    expect(request.request.body.marks_incorrect).toBe('-1');
    request.flush({ ...T1, questions: [] });
    await settle(env.fixture);
    env.http.expectOne(`${API}/api/admin/tests`).flush([T1]);
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('Saved the test.');
  });

  it('publishes a draft and moves a published test back to draft, with the server\'s reason when it cannot', async () => {
    const draft = { ...T1, id: 't2', title: 'Draft one', status: 'draft', question_ids: [], question_count: 0, total_marks: '0' };
    const env = await open([T1, draft]);
    Array.from(el(env.fixture, '[data-test="Draft one"]').querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Publish')!.click();
    const publish = env.http.expectOne(`${API}/api/admin/tests/t2`);
    expect(publish.request.body).toEqual({ status: 'published' });
    publish.flush({ detail: 'Please correct the marked fields.', errors: { question_ids: 'Add at least one question before publishing.' } }, { status: 422, statusText: 'x' });
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('Add at least one question before publishing.');

    Array.from(el(env.fixture, '[data-test="Mock 1"]').querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Move to draft')!.click();
    const back = env.http.expectOne(`${API}/api/admin/tests/t1`);
    expect(back.request.body).toEqual({ status: 'draft' });
    back.flush({ ...T1, status: 'draft', questions: [] });
    await settle(env.fixture);
    env.http.expectOne(`${API}/api/admin/tests`).flush([{ ...T1, status: 'draft' }, draft]);
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('Mock 1 is back to draft.');
  });

  it('asks before deleting a test', async () => {
    const env = await open();
    clickButton(env.fixture, 'Delete');
    await settle(env.fixture);
    env.http.expectNone(`${API}/api/admin/tests/t1`);
    clickButton(env.fixture, 'Yes, delete');
    const request = env.http.expectOne(`${API}/api/admin/tests/t1`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    await settle(env.fixture);
    env.http.expectOne(`${API}/api/admin/tests`).flush([]);
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('Deleted Mock 1.');
    expect(text(env.fixture)).toContain('No tests yet');
  });

  it('Keep and Cancel close things without a request', async () => {
    const env = await open();
    clickButton(env.fixture, 'Delete');
    await settle(env.fixture);
    clickButton(env.fixture, 'Keep');
    await settle(env.fixture);
    expect(text(env.fixture)).not.toContain('Yes, delete');
    await openForm(env);
    clickButton(env.fixture, 'Cancel');
    await settle(env.fixture);
    expect(all(env.fixture, '#test-form').length).toBe(0);
    env.http.expectNone(`${API}/api/admin/tests`);
  });

  it('explains it when the page cannot be loaded', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(AdminTests);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/admin/papers`).flush({ detail: "You don't have access to this." }, { status: 403, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain("You don't have access to this.");
  });
});

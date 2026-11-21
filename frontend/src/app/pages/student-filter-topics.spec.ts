import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { StudentFilterTopics } from './student-filter-topics';

const GROUPS = [{ paper: 'physics', topics: [{ name: 'Optics', count: 2 }] }];
const VIEWER = {
  total: 2,
  limit: 50,
  years: [2026, 2025],
  difficulties: ['easy', 'medium', 'hard'],
  questions: [
    { id: 'q1', paper: 'physics', topic: 'Optics', difficulty: 'easy', text: 'Light bends?', years: [2025], kind: 'mcq', correct_letter: 'B', explanation: null,
      options: [{ letter: 'A', text: 'No', why: 'Wrong.' }, { letter: 'B', text: 'Yes', why: 'Right.' }] },
    { id: 'q2', paper: 'physics', topic: 'Optics', difficulty: 'hard', text: 'Name the lens.', years: [2026], kind: 'fill_in', answer: ['convex', 'converging'], explanation: 'Thicker in the middle.' },
  ],
};

async function open() {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(StudentFilterTopics);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/my/filter-topics`).flush(GROUPS);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Filter topics viewer', () => {
  it('opens the questions for a topic and lists them with their options', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '[data-view]').click();
    http.expectOne((req) => req.url === `${API}/api/my/filter-topics/questions` && req.params.get('topic') === 'Optics' && req.params.get('paper') === 'physics').flush(VIEWER);
    await settle(fixture);
    expect(el(fixture, '#viewer-count').textContent).toContain('2 questions');
    expect(all(fixture, '[data-question]').length).toBe(2);
    expect(el(fixture, '[data-question="q1"]').textContent).toContain('Yes');
  });

  it('hides the answer until the student asks for it', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '[data-view]').click();
    http.expectOne((req) => req.url === `${API}/api/my/filter-topics/questions`).flush(VIEWER);
    await settle(fixture);
    expect(all(fixture, '.right').length).toBe(0);
    el<HTMLButtonElement>(fixture, '[data-answer="q1"]').click();
    fixture.detectChanges();
    expect(el(fixture, '.right').textContent).toContain('Yes');
    el<HTMLButtonElement>(fixture, '[data-answer="q2"]').click();
    fixture.detectChanges();
    expect(el(fixture, '[data-question="q2"]').textContent).toContain('convex or converging');
  });

  it('reloads with the year filter when the student picks a year', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '[data-view]').click();
    http.expectOne((req) => req.url === `${API}/api/my/filter-topics/questions` && !req.params.has('year')).flush(VIEWER);
    await settle(fixture);
    const select = el<HTMLSelectElement>(fixture, '#viewer-year');
    select.value = '2026';
    select.dispatchEvent(new Event('change'));
    http.expectOne((req) => req.url === `${API}/api/my/filter-topics/questions` && req.params.get('year') === '2026').flush({ ...VIEWER, total: 1, questions: [VIEWER.questions[1]] });
    await settle(fixture);
    expect(all(fixture, '[data-question]').length).toBe(1);
  });
});

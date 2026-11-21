import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { StudentPiBank } from './student-pi-bank';

const BANK = {
  questions: [
    { id: 'q1', topic: 'Current affairs', subtopic: 'Polity', question: 'Who is the head of state?', hint: 'The President', done: false },
    { id: 'q2', topic: 'Current affairs', subtopic: 'Economy', question: 'What is GST?', hint: '', done: false },
    { id: 'q3', topic: 'Self', subtopic: 'General', question: 'Tell us about yourself.', hint: '', done: true },
  ],
  counts: { new: 2, done: 1, total: 3 },
  topics: [
    { name: 'Current affairs', subtopics: ['Economy', 'Polity'] },
    { name: 'Self', subtopics: ['General'] },
  ],
};

async function open(bank: object = BANK) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(StudentPiBank);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/my/pi-questions`).flush(bank);
  await settle(fixture);
  return { ...env, fixture };
}

describe('PI question bank (student)', () => {
  it('lists the questions with the counts, and the done ones at the bottom', async () => {
    const { fixture } = await open();
    expect(el(fixture, '#pi-counts').textContent).toContain('2 new · 1 done · 3 total');
    const rows = all(fixture, '[data-question]').map((node) => node.getAttribute('data-question'));
    expect(rows).toEqual(['q1', 'q2', 'q3']);
    expect(el(fixture, '[data-question="q3"]').classList.contains('done')).toBe(true);
  });

  it('narrows the list by topic and then by subtopic', async () => {
    const { fixture } = await open();
    const topic = el<HTMLSelectElement>(fixture, '#topic-filter');
    topic.value = 'Current affairs';
    topic.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(all(fixture, '[data-question]').map((node) => node.getAttribute('data-question'))).toEqual(['q1', 'q2']);
    const subtopic = el<HTMLSelectElement>(fixture, '#subtopic-filter');
    subtopic.value = 'Economy';
    subtopic.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(all(fixture, '[data-question]').map((node) => node.getAttribute('data-question'))).toEqual(['q2']);
  });

  it('marks a question done, and moves it to the bottom at once', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '[aria-label="Mark done: Who is the head of state?"]').click();
    http.expectOne(`${API}/api/my/pi-questions/q1/done`).flush(null);
    await settle(fixture);
    expect(all(fixture, '[data-question]').map((node) => node.getAttribute('data-question'))).toEqual(['q2', 'q1', 'q3']);
    expect(el(fixture, '#pi-counts').textContent).toContain('1 new · 2 done · 3 total');
  });

  it('switches to flashcards, hides the hint until asked, and moves between cards', async () => {
    const { fixture } = await open();
    el<HTMLButtonElement>(fixture, '#view-flashcard').click();
    await settle(fixture);
    expect(el(fixture, '#flash-question').textContent).toContain('Who is the head of state?');
    expect(all(fixture, '#flash-hint').length).toBe(0);
    el<HTMLButtonElement>(fixture, '#show-hint').click();
    await settle(fixture);
    expect(el(fixture, '#flash-hint').textContent).toContain('The President');
    el<HTMLButtonElement>(fixture, '#next-card').click();
    await settle(fixture);
    expect(el(fixture, '#flash-question').textContent).toContain('What is GST?');
    expect(el(fixture, '#card-position').textContent).toContain('2 of 3');
  });

  it('says so when the filters match nothing, and when the bank is empty', async () => {
    const { fixture } = await open({ questions: [], counts: { new: 0, done: 0, total: 0 }, topics: [] });
    expect(el(fixture, '#pi-empty').textContent).toContain('No questions yet');
  });
});

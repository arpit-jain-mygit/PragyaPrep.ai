import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { StudentVocab } from './student-vocab';

const PACK = {
  packs: 2,
  today: { pack: 1, items: [{ word: 'lucid', meaning: 'clear', example: '' }, { word: 'candid', meaning: 'truthful', example: '' }] },
  days: [-3, -2, -1, 0, 1, 2, 3].map((offset) => ({ date: `2026-11-${20 + offset}`, pack: offset === 0 ? 1 : 2, count: 2 })),
};

async function open() {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(StudentVocab);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/my/vocab/vocabulary`).flush(PACK);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Vocabulary and Idioms page', () => {
  it('shows the day\'s pack and the calendar around it, marking today', async () => {
    const { fixture } = await open();
    expect(all(fixture, '.day-tile').length).toBe(7);
    expect(el(fixture, '.day-tile.today').getAttribute('data-date')).toBe('2026-11-20');
    expect(all(fixture, '[data-word]').map((node) => node.getAttribute('data-word'))).toEqual(['lucid', 'candid']);
  });

  it('runs the test, submits the choices and shows the score', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '#vocab-start').click();
    http.expectOne(`${API}/api/my/vocab/vocabulary/test`).flush({
      questions: [{ word: 'lucid', options: ['clear', 'loud'] }, { word: 'candid', options: ['truthful', 'hidden'] }],
    });
    await settle(fixture);
    all<HTMLInputElement>(fixture, 'input[type="radio"]')[0].click();
    all<HTMLInputElement>(fixture, 'input[type="radio"]')[2].click();
    el<HTMLButtonElement>(fixture, '#vocab-submit').click();
    const request = http.expectOne(`${API}/api/my/vocab/vocabulary/test/answers`);
    expect(request.request.body).toEqual({ answers: [0, 0] });
    request.flush({ score: 2, total: 2, results: [
      { word: 'lucid', given: 0, answer: 0, right: true, meaning: 'clear' },
      { word: 'candid', given: 0, answer: 0, right: true, meaning: 'truthful' },
    ] });
    await settle(fixture);
    expect(el(fixture, '#vocab-score').textContent).toContain('You got 2 of 2 right.');
  });
});

import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { WordOfDay } from './word-of-day';
import { TestBed } from '@angular/core/testing';

const TODAY = { word: { word: 'bashful', meaning: 'shy in front of people', example: 'He was bashful at the party.' } };

async function open(on = true) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  if (!on) env.tenants.info.set({ ...env.tenants.info()!, features: [{ key: 'word_of_day', group: 'Dashboard', label: 'Word of the day', enabled: false }] } as never);
  const fixture = TestBed.createComponent(WordOfDay);
  fixture.detectChanges();
  if (on) env.http.expectOne(`${API}/api/my/word-of-day`).flush(TODAY);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Word of the day card', () => {
  it('shows the word, its meaning and its example', async () => {
    const { fixture } = await open();
    expect(el(fixture, '[data-word]').textContent).toContain('bashful');
    expect(el(fixture, '[data-meaning]').textContent).toContain('shy in front of people');
    expect(el(fixture, '[data-example]').textContent).toContain('He was bashful at the party.');
  });

  it('shows nothing when the institute has switched it off, and does not ask for a word', async () => {
    const { fixture, http } = await open(false);
    expect(all(fixture, '#word-of-day').length).toBe(0);
    http.expectNone(`${API}/api/my/word-of-day`);
  });

  it('shows nothing when there is no word yet', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(WordOfDay);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/word-of-day`).flush({ word: null });
    await settle(fixture);
    expect(all(fixture, '#word-of-day').length).toBe(0);
  });
});

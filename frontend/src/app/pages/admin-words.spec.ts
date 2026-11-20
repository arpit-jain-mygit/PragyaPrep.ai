import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { AdminWordsPage } from './admin-words';

const LIST = [
  { id: 'w1', word: 'bashful', meaning: 'shy', example: 'He was bashful.' },
  { id: 'w2', word: 'candid', meaning: 'honest', example: '' },
];

async function open(list = LIST) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminWordsPage);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/words?kind=word`).flush(list);
  await settle(fixture);
  return { ...env, fixture };
}

function type(fixture: unknown, selector: string, value: string) {
  const input = el<HTMLInputElement>(fixture as never, selector);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('Word of the day admin page', () => {
  it('lists the words in the order they were added, with the example when there is one', async () => {
    const { fixture } = await open();
    expect(all(fixture, '[data-word-id]').map((row) => row.getAttribute('data-word-id'))).toEqual(['w1', 'w2']);
    expect(el(fixture, '#word-list').textContent).toContain('He was bashful.');
    expect(el(fixture, '#word-list').textContent).toContain('bashful');
  });

  it('says so when the list is empty', async () => {
    const { fixture } = await open([]);
    expect(el(fixture, '#no-words').textContent).toContain('No words yet');
  });

  it('adds a word and clears the form', async () => {
    const { fixture, http } = await open([]);
    type(fixture, '#word-input', 'daunt');
    type(fixture, '#meaning-input', 'to intimidate');
    type(fixture, '#example-input', 'Do not be daunted.');
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#add-word').click();
    const request = http.expectOne(`${API}/api/admin/words`);
    expect(request.request.body).toEqual({ kind: 'word', word: 'daunt', meaning: 'to intimidate', example: 'Do not be daunted.' });
    request.flush({ id: 'w3', word: 'daunt', meaning: 'to intimidate', example: 'Do not be daunted.' }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    expect(all(fixture, '[data-word-id]').length).toBe(1);
    expect(el<HTMLInputElement>(fixture, '#word-input').value).toBe('');
  });

  it('shows a refused word as a plain message and keeps what was typed', async () => {
    const { fixture, http } = await open([]);
    type(fixture, '#word-input', '');
    type(fixture, '#meaning-input', 'shy');
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#add-word').click();
    http.expectOne(`${API}/api/admin/words`).flush({ detail: 'Type the word.' }, { status: 422, statusText: 'Unprocessable' });
    await settle(fixture);
    expect(el(fixture, '#word-error').textContent).toContain('Type the word.');
    expect(el<HTMLTextAreaElement>(fixture, '#meaning-input').value).toBe('shy');
  });

  it('removes a word after the admin confirms', async () => {
    const { fixture, http } = await open();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    el<HTMLButtonElement>(fixture, '[data-word-id="w1"] button').click();
    http.expectOne(`${API}/api/admin/words/w1`).flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    expect(all(fixture, '[data-word-id]').map((row) => row.getAttribute('data-word-id'))).toEqual(['w2']);
  });

  it('keeps the word when the admin says no', async () => {
    const { fixture, http } = await open();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    el<HTMLButtonElement>(fixture, '[data-word-id="w1"] button').click();
    http.expectNone(`${API}/api/admin/words/w1`);
    expect(all(fixture, '[data-word-id]').length).toBe(2);
  });
});

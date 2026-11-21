import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { AdminPiBankPage } from './admin-pi-bank';

const ROW = { id: 'q1', topic: 'Current affairs', subtopic: 'General', question: 'Who is the head of state?', hint: '', added_at: 1 };

async function open(rows: object[] = [ROW]) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminPiBankPage);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/pi-questions`).flush(rows);
  await settle(fixture);
  return { ...env, fixture };
}

function type(fixture: unknown, selector: string, value: string) {
  const field = el<HTMLInputElement>(fixture as never, selector);
  field.value = value;
  field.dispatchEvent(new Event('input'));
}

describe('PI question bank (admin)', () => {
  it('lists the questions the admin has added', async () => {
    const { fixture } = await open();
    expect(el(fixture, '[data-question="q1"]').textContent).toContain('Who is the head of state?');
  });

  it('adds a question and shows it in the list', async () => {
    const { fixture, http } = await open([]);
    type(fixture, '#topic-input', 'Self');
    type(fixture, '#question-input', 'Tell us about yourself.');
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#add-question').click();
    const request = http.expectOne(`${API}/api/admin/pi-questions`);
    expect(request.request.body).toEqual({ topic: 'Self', subtopic: '', question: 'Tell us about yourself.', hint: '' });
    request.flush({ id: 'q2', topic: 'Self', subtopic: 'General', question: 'Tell us about yourself.', hint: '', added_at: 2 });
    await settle(fixture);
    expect(el(fixture, '[data-question="q2"]').textContent).toContain('Tell us about yourself.');
  });

  it('shows a refused question as a plain message', async () => {
    const { fixture, http } = await open([]);
    el<HTMLButtonElement>(fixture, '#add-question').click();
    http.expectOne(`${API}/api/admin/pi-questions`).flush({ detail: 'Type the topic. Type the question.' }, { status: 422, statusText: 'Unprocessable' });
    await settle(fixture);
    expect(el(fixture, '#pi-admin-error').textContent).toContain('Type the topic.');
  });

  it('removes a question from the list', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '[aria-label="Remove Who is the head of state?"]').click();
    http.expectOne(`${API}/api/admin/pi-questions/q1`).flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    expect(all(fixture, '[data-question="q1"]').length).toBe(0);
  });
});

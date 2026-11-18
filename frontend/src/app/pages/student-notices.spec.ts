import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NoticeService } from '../core/notice.service';
import { API, all, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { LINK_PATHS, StudentNotices } from './student-notices';

function notice(overrides: object = {}) {
  return { id: 'n1', title: 'Class moved', message: "Friday's class is at 6 pm.", kind: 'info', link: null, source: 'manual', created_at: '2027-01-15T08:00:00+05:30', read_at: null, ...overrides };
}

function data(notices: object[], extra: object = {}) {
  const unread = notices.filter((n) => !(n as { read_at: string | null }).read_at);
  return { unread: unread.length, action_unread: unread.filter((n) => (n as { kind: string }).kind === 'action').length, notices, ...extra };
}

async function open(reply: object | number = data([notice()])) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(StudentNotices);
  fixture.detectChanges();
  const request = env.http.expectOne(`${API}/api/my/notices`);
  if (typeof reply === 'number') request.flush({ detail: 'Nope.' }, { status: reply, statusText: 'x' });
  else request.flush(reply);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Student notices', () => {
  it('shows each notice with its title, message and how long ago, and marks unread ones', async () => {
    const { fixture } = await open();
    const card = el(fixture, '[data-notice="Class moved"]');
    expect(card.textContent).toContain("Friday's class is at 6 pm.");
    expect(card.textContent).toMatch(/just now|ago/);
    expect(card.className).toContain('unread');
    expect(card.querySelector('.notice-dot')).not.toBeNull();
    expect(Array.from(card.querySelectorAll('button')).map((b) => b.textContent!.trim())).toEqual(['Mark read']);
  });

  it('marks an action notice and gives it a button with the label from the server', async () => {
    const { fixture } = await open(data([notice({ kind: 'action', link: { to: 'coursework', label: 'Open coursework' } })]));
    const card = el(fixture, '[data-notice="Class moved"]');
    expect(card.textContent).toContain('Action needed');
    expect(card.className).toContain('action');
    expect(Array.from(card.querySelectorAll('button')).map((b) => b.textContent!.trim())).toEqual(['Open coursework', 'Mark read']);
  });

  it('shows the notices in the order the server gives them', async () => {
    const { fixture } = await open(data([notice({ id: 'a', title: 'First' }), notice({ id: 'b', title: 'Second', read_at: '2027-01-15T09:00:00+05:30' })]));
    expect(all(fixture, '[data-notice]').map((c) => c.getAttribute('data-notice'))).toEqual(['First', 'Second']);
    expect(el(fixture, '[data-notice="Second"]').className).not.toContain('unread');
    expect(el(fixture, '[data-notice="Second"]').querySelectorAll('button').length).toBe(0);
  });

  it('marks one read and updates the count in the top bar', async () => {
    const { fixture, http } = await open();
    const counts = TestBed.inject(NoticeService);
    expect(counts.unread()).toBe(1);
    el(fixture, '[data-notice="Class moved"] button').click();
    const request = http.expectOne(`${API}/api/my/notices/n1/read`);
    expect(request.request.method).toBe('PUT');
    request.flush(data([notice({ read_at: '2027-01-15T10:00:00+05:30' })]));
    await settle(fixture);
    expect(el(fixture, '[data-notice]').className).not.toContain('unread');
    expect(counts.unread()).toBe(0);
    expect(all(fixture, '#read-all').length).toBe(0);
  });

  it('marks everything read', async () => {
    const { fixture, http } = await open(data([notice({ id: 'a', title: 'A' }), notice({ id: 'b', title: 'B', kind: 'action' })]));
    expect(TestBed.inject(NoticeService).actionUnread()).toBe(1);
    el(fixture, '#read-all').click();
    const request = http.expectOne(`${API}/api/my/notices/read-all`);
    expect(request.request.method).toBe('PUT');
    request.flush(data([notice({ id: 'a', title: 'A', read_at: 'x' }), notice({ id: 'b', title: 'B', kind: 'action', read_at: 'x' })]));
    await settle(fixture);
    expect(TestBed.inject(NoticeService).unread()).toBe(0);
    expect(TestBed.inject(NoticeService).actionUnread()).toBe(0);
    expect(all(fixture, '.unread').length).toBe(0);
  });

  it('counts opening through the button as reading, then goes to the place it names', async () => {
    const { fixture, http, navigate } = await open(data([notice({ kind: 'action', link: { to: 'tests', label: 'Open tests' } })]));
    el(fixture, '[data-notice] button').click();
    http.expectOne(`${API}/api/my/notices/n1/read`).flush(data([notice({ kind: 'action', link: { to: 'tests', label: 'Open tests' }, read_at: 'x' })]));
    await settle(fixture);
    expect(navigate).toHaveBeenCalledWith(['/', 'demo', 'learning', 'tests']);
  });

  it('goes straight to the place for a notice already read, without asking the server', async () => {
    const { fixture, http, navigate } = await open(data([notice({ kind: 'action', link: { to: 'results', label: 'Open results' }, read_at: 'x' })]));
    el(fixture, '[data-notice] button').click();
    await settle(fixture);
    http.expectNone(`${API}/api/my/notices/n1/read`);
    expect(navigate).toHaveBeenCalledWith(['/', 'demo', 'learning', 'results']);
  });

  it('stays on the page and says why when marking fails', async () => {
    const { fixture, http, navigate } = await open(data([notice({ kind: 'action', link: { to: 'coursework', label: 'Open coursework' } })]));
    el(fixture, '[data-notice] button').click();
    http.expectOne(`${API}/api/my/notices/n1/read`).flush({ detail: "We couldn't find that notice." }, { status: 404, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain("We couldn't find that notice.");
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says so when there are no notices', async () => {
    const { fixture } = await open(data([]));
    expect(text(fixture)).toContain('No notices');
    expect(all(fixture, '#read-all').length).toBe(0);
  });

  it('explains a failure to load', async () => {
    const { fixture } = await open(500);
    expect(text(fixture)).toContain('Nope.');
  });

  it('sends each button to a place inside the app', () => {
    expect(LINK_PATHS).toEqual({ coursework: ['learning'], tests: ['learning', 'tests'], results: ['learning', 'results'] });
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { chosen } from '../testing';
import { AdminAnnouncements } from './admin-announcements';

const COURSES = [
  { id: 'c1', name: 'CAT', fee: 0, access: { type: 'unlimited' }, papers: [], active: true, created_at: '' },
  { id: 'c2', name: 'Old', fee: 0, access: { type: 'unlimited' }, papers: [], active: false, created_at: '' },
];

function record(overrides: object = {}) {
  return {
    id: 'a1', title: 'Class moved', message: 'x', kind: 'info', link: null, source: 'manual', audience: { type: 'all' }, recipients: 40, email_requested: false,
    emailed: 0, email_failed: 0, created_at: '2027-01-15T08:00:00+05:30', created_by: 'ritesh@example.com', ...overrides,
  };
}

async function open(history: object[] = []) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminAnnouncements);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/courses`).flush(COURSES);
  env.http.expectOne(`${API}/api/admin/announcements`).flush(history);
  await settle(fixture);
  return { ...env, fixture };
}

function fill(fixture: Parameters<typeof el>[0], title = 'Class moved', message = "Friday's class is at 6 pm.") {
  type(fixture, '#title', title);
  type(fixture, '#message', message);
}

const send = (fixture: Parameters<typeof el>[0]) => el<HTMLButtonElement>(fixture, '#send');

describe('Admin announcements page', () => {
  it('starts with an empty form, Everyone as the audience and no email', async () => {
    const { fixture } = await open();
    expect(chosen(fixture, '#audience')).toBe('all');
    expect(el<HTMLInputElement>(fixture, '#send-email').checked).toBe(false);
    expect(all(fixture, '#link').length).toBe(0);
    expect(send(fixture).disabled).toBe(true);
    expect(text(fixture)).toContain('Nothing sent yet');
  });

  it('keeps Send off until there is a title and a message', async () => {
    const { fixture } = await open();
    type(fixture, '#title', 'Hello');
    await settle(fixture);
    expect(send(fixture).disabled).toBe(true);
    type(fixture, '#message', 'World');
    await settle(fixture);
    expect(send(fixture).disabled).toBe(false);
  });

  it('sends information to everyone and shows the result and the new history row', async () => {
    const { fixture, http } = await open();
    fill(fixture);
    await settle(fixture);
    send(fixture).click();
    const request = http.expectOne(`${API}/api/admin/announcements`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ title: 'Class moved', message: "Friday's class is at 6 pm.", kind: 'info', link: null, audience: { type: 'all' }, send_email: false });
    request.flush(record());
    await settle(fixture);
    expect(el(fixture, '#sent').textContent!.replace(/\s+/g, ' ')).toContain('Sent to 40 students');
    expect(el(fixture, '[data-announcement="Class moved"]').textContent).toContain('Everyone');
    expect(el<HTMLInputElement>(fixture, '#title').value).toBe('');
  });

  it('turns the email tick on for action needed and off again for information, and offers a button', async () => {
    const { fixture } = await open();
    const radio = (value: string) => all<HTMLInputElement>(fixture, 'input[name="kind"]').find((r) => r.value === value)!;
    radio('action').click();
    await settle(fixture);
    expect(el<HTMLInputElement>(fixture, '#send-email').checked).toBe(true);
    expect(Array.from(el<HTMLSelectElement>(fixture, '#link').options).map((o) => o.textContent!.trim())).toEqual(['No button', 'Open coursework', 'Open tests', 'Open results']);
    radio('info').click();
    await settle(fixture);
    expect(el<HTMLInputElement>(fixture, '#send-email').checked).toBe(false);
    expect(all(fixture, '#link').length).toBe(0);
  });

  it('sends action needed with a button and an email to a course, listing only open courses', async () => {
    const { fixture, http } = await open();
    fill(fixture, 'Take the mock', 'It closes Friday.');
    all<HTMLInputElement>(fixture, 'input[name="kind"]').find((r) => r.value === 'action')!.click();
    await settle(fixture);
    type(fixture, '#link', 'tests');
    type(fixture, '#audience', 'course');
    await settle(fixture);
    expect(Array.from(el<HTMLSelectElement>(fixture, '#course').options).map((o) => o.textContent!.trim())).toEqual(['Choose a course…', 'CAT']);
    expect(send(fixture).disabled).toBe(true);
    type(fixture, '#course', 'c1');
    await settle(fixture);
    send(fixture).click();
    const request = http.expectOne(`${API}/api/admin/announcements`);
    expect(request.request.body).toEqual({ title: 'Take the mock', message: 'It closes Friday.', kind: 'action', link: 'tests', audience: { type: 'course', course_id: 'c1' }, send_email: true });
    request.flush(record({ kind: 'action', audience: { type: 'course', course_id: 'c1', course_name: 'CAT' }, recipients: 12, email_requested: true, emailed: 11, email_failed: 1 }));
    await settle(fixture);
    const note = el(fixture, '#sent').textContent!.replace(/\s+/g, ' ');
    expect(note).toContain('Sent to 12 students');
    expect(note).toContain('11 emailed');
    expect(note).toContain('1 emails could not be sent');
  });

  it('splits chosen students on lines, commas and spaces, and needs at least one', async () => {
    const { fixture, http } = await open();
    fill(fixture);
    type(fixture, '#audience', 'students');
    await settle(fixture);
    expect(send(fixture).disabled).toBe(true);
    type(fixture, '#emails', 'asha@example.com, ravi@example.com\nmeera@example.com;  ');
    await settle(fixture);
    send(fixture).click();
    expect(http.expectOne(`${API}/api/admin/announcements`).request.body.audience).toEqual({ type: 'students', emails: ['asha@example.com', 'ravi@example.com', 'meera@example.com'] });
  });

  it('shows the reason when the server refuses and keeps what was typed', async () => {
    const { fixture, http } = await open();
    fill(fixture);
    await settle(fixture);
    send(fixture).click();
    http.expectOne(`${API}/api/admin/announcements`).flush({ detail: 'There are no students to send this to.' }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('There are no students to send this to.');
    expect(el<HTMLInputElement>(fixture, '#title').value).toBe('Class moved');
    expect(all(fixture, '#sent').length).toBe(0);
  });

  it('lists what was sent with audience, how many were reached and emailed, and marks actions and reminders', async () => {
    const { fixture } = await open([
      record(),
      record({ id: 'a2', title: 'Reminder: behind in CAT', kind: 'action', source: 'reminder', audience: { type: 'course', course_id: 'c1', course_name: 'CAT' }, recipients: 5, email_requested: true, emailed: 4, email_failed: 1 }),
      record({ id: 'a3', title: 'To a few', audience: { type: 'students', count: 3 }, recipients: 3 }),
    ]);
    expect(all(fixture, '[data-announcement]').length).toBe(3);
    const reminder = el(fixture, '[data-announcement="Reminder: behind in CAT"]').textContent!.replace(/\s+/g, ' ');
    expect(reminder).toContain('Action');
    expect(reminder).toContain('Reminder');
    expect(reminder).toContain('CAT');
    expect(reminder).toContain('5');
    expect(reminder).toContain('4 (1 failed)');
    expect(el(fixture, '[data-announcement="To a few"]').textContent).toContain('3 chosen');
    expect(el(fixture, '[data-announcement="Class moved"]').textContent).toContain('no');
  });

  it('explains a failure to load', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(AdminAnnouncements);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/admin/courses`).flush({ detail: 'Nope.' }, { status: 500, statusText: 'x' });
    env.http.expectOne(`${API}/api/admin/announcements`).flush([]);
    await settle(fixture);
    expect(text(fixture)).toContain('Nope.');
  });
});

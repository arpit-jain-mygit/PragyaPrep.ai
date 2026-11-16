import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, clickButton, el, registration, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminRegistrations } from './admin-registrations';

async function open(initial: unknown[] = [registration()]) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminRegistrations);
  fixture.detectChanges();
  env.http.expectOne((r) => r.url === `${API}/api/admin/registrations` && r.params.get('status') === 'pending').flush(initial as object[]);
  await settle(fixture);
  return { ...env, fixture };
}

/** After a decision the page reloads the list. Answer that reload. */
function answerReload(http: ReturnType<typeof setupTestBed>['http'], status: string, list: unknown[]) {
  http.expectOne((r) => r.url === `${API}/api/admin/registrations` && r.params.get('status') === status).flush(list as object[]);
}

describe('Admin registrations page', () => {
  it('shows each pending registration with who, which course and its status', async () => {
    const { fixture } = await open([
      registration(),
      registration({ email: 'pooja@example.com', first_name: 'Pooja', last_name: 'Shah', course_name: 'CAT' }),
    ]);
    const content = text(fixture);
    expect(content).toContain('Meera Kapoor');
    expect(content).toContain('meera@example.com');
    expect(content).toContain('CLAT');
    expect(content).toContain('Pooja Shah');
    expect(content).toContain('CAT');
    expect(all(fixture, '.chip.pending').length).toBe(2);
  });

  it('has a tab for each status, with pending selected first', async () => {
    const { fixture } = await open();
    const tabs = all(fixture, '[role=tab]');
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['pending', 'approved', 'rejected', 'suspended', 'all']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('asks the API for the other statuses when a tab is clicked', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'approved');
    answerReload(http, 'approved', [registration({ status: 'approved' })]);
    await settle(fixture);
    expect(all(fixture, '.chip.approved').length).toBe(1);
    expect(all(fixture, '[role=tab]')[1].getAttribute('aria-selected')).toBe('true');
  });

  it('says so when there is nobody in a list', async () => {
    const { fixture } = await open([]);
    expect(text(fixture)).toContain('No pending registrations.');
  });

  it('shows the person\'s full details when asked, and hides them again', async () => {
    const { fixture } = await open();
    expect(text(fixture)).not.toContain('201309');

    clickButton(fixture, 'Show details');
    await settle(fixture);
    const details = text(fixture);
    expect(details).toContain('21 Aug 2004');
    expect(details).toContain('Female');
    expect(details).toContain('9876543210');
    expect(details).toContain('B-14, Sector 62, Noida 201309');

    clickButton(fixture, 'Hide details');
    await settle(fixture);
    expect(text(fixture)).not.toContain('201309');
  });

  it('offers Approve and Reject for a pending registration only', async () => {
    const { fixture } = await open();
    const labels = all(fixture, 'article button').map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Show details', 'Approve', 'Reject']);
  });

  it('approves, tells the admin an email went out, and refreshes the list', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Approve');
    const request = http.expectOne(`${API}/api/admin/registrations/meera%40example.com/approve`);
    expect(request.request.method).toBe('POST');
    request.flush({ registration: registration({ status: 'approved' }), email_sent: true });
    await settle(fixture);
    answerReload(http, 'pending', []);
    await settle(fixture);

    expect(text(fixture)).toContain('Approved Meera Kapoor. We emailed them.');
    expect(text(fixture)).toContain('No pending registrations.');
  });

  it('warns when the decision was saved but the email could not be sent', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Approve');
    http.expectOne(`${API}/api/admin/registrations/meera%40example.com/approve`).flush({
      registration: registration({ status: 'approved' }), email_sent: false,
    });
    await settle(fixture);
    answerReload(http, 'pending', []);
    await settle(fixture);
    expect(text(fixture)).toContain('Approved Meera Kapoor, but the email could not be sent.');
    expect(el(fixture, '.alert').className).toContain('warn');
  });

  it('escapes a + in the email so the right person is decided on', async () => {
    const { fixture, http } = await open([registration({ email: 'meera+prep@example.com' })]);
    clickButton(fixture, 'Approve');
    http.expectOne(`${API}/api/admin/registrations/meera%2Bprep%40example.com/approve`).flush({
      registration: registration({ status: 'approved' }), email_sent: true,
    });
    await settle(fixture);
    answerReload(http, 'pending', []);
  });

  it('asks for a reason before rejecting, then sends it', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Reject');
    await settle(fixture);
    expect(all(fixture, 'textarea').length).toBe(1);
    expect(all(fixture, 'article button').map((b) => b.textContent?.trim())).toEqual(['Reject registration', 'Cancel']);

    type(fixture, 'textarea', 'Mobile number does not match');
    clickButton(fixture, 'Reject registration');
    const request = http.expectOne(`${API}/api/admin/registrations/meera%40example.com/reject`);
    expect(request.request.body).toEqual({ reason: 'Mobile number does not match' });
    request.flush({ registration: registration({ status: 'rejected' }), email_sent: true });
    await settle(fixture);
    answerReload(http, 'pending', []);
    await settle(fixture);

    expect(text(fixture)).toContain('Rejected Meera Kapoor. We emailed them.');
    expect(all(fixture, 'textarea').length).toBe(0);
  });

  it('lets the admin cancel a rejection without sending anything', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Reject');
    await settle(fixture);
    clickButton(fixture, 'Cancel');
    await settle(fixture);
    expect(all(fixture, 'textarea').length).toBe(0);
    http.expectNone(`${API}/api/admin/registrations/meera%40example.com/reject`);
  });

  it.each([
    ['approved', 'Suspend'],
    ['suspended', 'Reactivate'],
  ] as const)('offers %s people the %s button', async (status, button) => {
    const { fixture } = await open([registration({ status })]);
    expect(all(fixture, 'article button').map((b) => b.textContent?.trim())).toEqual(['Show details', button]);
  });

  it('offers Approve for a rejected registration, and shows the reason given', async () => {
    const { fixture } = await open([registration({ status: 'rejected', reason: 'Blurry details', decided_by: 'ritesh@example.com', decided_at: '2027-01-15T08:00:00+00:00' })]);
    expect(all(fixture, 'article button').map((b) => b.textContent?.trim())).toEqual(['Show details', 'Approve']);
    clickButton(fixture, 'Show details');
    await settle(fixture);
    expect(text(fixture)).toContain('Blurry details');
    expect(text(fixture)).toContain('by ritesh@example.com');
  });

  it('does not mention an email when suspending', async () => {
    const { fixture, http } = await open([registration({ status: 'approved' })]);
    clickButton(fixture, 'Suspend');
    http.expectOne(`${API}/api/admin/registrations/meera%40example.com/suspend`).flush({
      registration: registration({ status: 'suspended' }), email_sent: false,
    });
    await settle(fixture);
    answerReload(http, 'pending', []);
    await settle(fixture);
    expect(text(fixture)).toContain('Suspended Meera Kapoor.');
    expect(text(fixture)).not.toContain('could not be sent');
    expect(text(fixture)).not.toContain('We emailed them');
  });

  it('shows what went wrong when a move is refused, and refreshes the list', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Approve');
    http.expectOne(`${API}/api/admin/registrations/meera%40example.com/approve`).flush(
      { detail: "You can't approve a registration that is approved." },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(fixture);
    answerReload(http, 'pending', []);
    await settle(fixture);

    expect(text(fixture)).toContain("You can't approve a registration that is approved.");
    expect(el(fixture, '.alert').className).toContain('error');
  });

  it('explains it when the list cannot be loaded', async () => {
    const env = setupTestBed();
    const fixture = TestBed.createComponent(AdminRegistrations);
    fixture.detectChanges();
    env.http.expectOne((r) => r.url === `${API}/api/admin/registrations`).flush(
      { detail: "You don't have access to this." },
      { status: 403, statusText: 'Forbidden' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain("You don't have access to this.");
  });
});

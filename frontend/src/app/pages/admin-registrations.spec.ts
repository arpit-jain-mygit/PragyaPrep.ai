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
    expect(all(fixture, '.status.warn').length).toBe(2);
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
    expect(all(fixture, '.status.ok').length).toBe(1);
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
    expect(labels).toEqual(['Show details', 'Edit', 'Approve', 'Reject']);
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
    expect(all(fixture, 'article button').map((b) => b.textContent?.trim())).toEqual(['Show details', 'Edit', button]);
  });

  it('offers Approve for a rejected registration, and shows the reason given', async () => {
    const { fixture } = await open([registration({ status: 'rejected', reason: 'Blurry details', decided_by: 'ritesh@example.com', decided_at: '2027-01-15T08:00:00+00:00' })]);
    expect(all(fixture, 'article button').map((b) => b.textContent?.trim())).toEqual(['Show details', 'Edit', 'Approve']);
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

const COURSES = [
  { id: 'c1', name: 'CLAT', fee: 10000, access: { type: 'unlimited' }, active: true, created_at: '' },
  { id: 'c2', name: 'CAT', fee: 12000, access: { type: 'unlimited' }, active: true, created_at: '' },
];

/** Open the edit form on the first registration, answering the course list the form needs. */
async function openEdit(initial: unknown[] = [registration()]) {
  const env = await open(initial);
  clickButton(env.fixture, 'Edit');
  env.http.expectOne(`${API}/api/admin/courses`).flush(COURSES);
  await settle(env.fixture);
  return env;
}

describe('Admin registrations: editing a student', () => {
  it('opens a form filled with what the student gave', async () => {
    const { fixture } = await openEdit();
    expect(el<HTMLInputElement>(fixture, '#e-email').value).toBe('meera@example.com');
    expect(el<HTMLInputElement>(fixture, '#e-first_name').value).toBe('Meera');
    expect(el<HTMLInputElement>(fixture, '#e-city').value).toBe('Noida');
    expect(el<HTMLInputElement>(fixture, '#e-same').checked).toBe(true);
    expect(all(fixture, '#e-course_id option').map((o) => o.textContent?.trim())).toEqual(['CLAT', 'CAT']);
  });

  it('fetches the course list only the first time', async () => {
    const { fixture, http } = await openEdit();
    clickButton(fixture, 'Cancel');
    await settle(fixture);
    clickButton(fixture, 'Edit');
    await settle(fixture);
    http.expectNone(`${API}/api/admin/courses`);
    expect(el(fixture, '#e-email')).toBeTruthy();
  });

  it('sends only the fields that changed', async () => {
    const { fixture, http } = await openEdit();
    type(fixture, '#e-city', 'Delhi');
    clickButton(fixture, 'Save');
    const request = http.expectOne(`${API}/api/admin/registrations/meera%40example.com`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ city: 'Delhi' });
    request.flush({ registration: registration({ city: 'Delhi' }), email_sent: false });
    await settle(fixture);
    answerReload(http, 'pending', [registration({ city: 'Delhi' })]);
    await settle(fixture);
    expect(text(fixture)).toContain('Saved Meera Kapoor.');
    expect(all(fixture, '#e-city').length).toBe(0); // the form closed
  });

  it('says nothing was saved when nothing changed, without calling the API', async () => {
    const { fixture, http } = await openEdit();
    clickButton(fixture, 'Save');
    await settle(fixture);
    http.expectNone(`${API}/api/admin/registrations/meera%40example.com`);
    expect(text(fixture)).toContain('No changes to Meera Kapoor.');
  });

  it('warns before an email change, and sends it with the new address', async () => {
    const { fixture, http } = await openEdit();
    type(fixture, '#e-email', ' new.meera@example.com ');
    await settle(fixture);
    expect(text(fixture)).toContain('new.meera@example.com');
    expect(text(fixture)).toContain('meera@example.com will stop working');
    await settle(fixture);
    clickButton(fixture, 'Save and change email');
    const request = http.expectOne(`${API}/api/admin/registrations/meera%40example.com`);
    expect(request.request.body).toEqual({ email: 'new.meera@example.com' });
    request.flush({ registration: registration({ email: 'new.meera@example.com' }), email_sent: true });
    await settle(fixture);
    answerReload(http, 'pending', [registration({ email: 'new.meera@example.com' })]);
    await settle(fixture);
    expect(text(fixture)).toContain('Their email is now new.meera@example.com, and we emailed it.');
  });

  it('warns when the email was changed but the message could not be sent', async () => {
    const { fixture, http } = await openEdit();
    type(fixture, '#e-email', 'new.meera@example.com');
    await settle(fixture);
    clickButton(fixture, 'Save and change email');
    http.expectOne(`${API}/api/admin/registrations/meera%40example.com`).flush({
      registration: registration({ email: 'new.meera@example.com' }), email_sent: false,
    });
    await settle(fixture);
    answerReload(http, 'pending', []);
    await settle(fixture);
    expect(text(fixture)).toContain('could not be sent');
    expect(el(fixture, '.alert').className).toContain('warn');
  });

  it('shows the server\'s message under each wrong field, keeps the form open, and clears one as it is fixed', async () => {
    const { fixture, http } = await openEdit();
    type(fixture, '#e-mobile', '555');
    type(fixture, '#e-email', 'taken@example.com');
    await settle(fixture);
    clickButton(fixture, 'Save and change email');
    http.expectOne(`${API}/api/admin/registrations/meera%40example.com`).flush(
      { detail: 'Please correct the marked fields.', errors: { mobile: 'Enter a 10-digit Indian mobile number.', email: 'Someone at this institute is already registered with that email.' } },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain('Please correct the marked fields.');
    expect(text(fixture)).toContain('Enter a 10-digit Indian mobile number.');
    expect(text(fixture)).toContain('already registered with that email');
    expect(el<HTMLInputElement>(fixture, '#e-mobile').value).toBe('555'); // nothing typed was lost

    type(fixture, '#e-mobile', '9123456789');
    await settle(fixture);
    expect(text(fixture)).not.toContain('Enter a 10-digit Indian mobile number.');
    expect(text(fixture)).toContain('already registered with that email');
  });

  it('can make the WhatsApp number different from the mobile', async () => {
    const { fixture, http } = await openEdit();
    el<HTMLInputElement>(fixture, '#e-same').click();
    await settle(fixture);
    type(fixture, '#e-whatsapp', '9000000001');
    clickButton(fixture, 'Save');
    expect(http.expectOne(`${API}/api/admin/registrations/meera%40example.com`).request.body).toEqual({ whatsapp: '9000000001' });
  });

  it('changes the course', async () => {
    const { fixture, http } = await openEdit();
    type(fixture, '#e-course_id', 'c2');
    clickButton(fixture, 'Save');
    expect(http.expectOne(`${API}/api/admin/registrations/meera%40example.com`).request.body).toEqual({ course_id: 'c2' });
  });

  it('closes the form on Cancel without saving', async () => {
    const { fixture, http } = await openEdit();
    type(fixture, '#e-city', 'Delhi');
    clickButton(fixture, 'Cancel');
    await settle(fixture);
    http.expectNone(`${API}/api/admin/registrations/meera%40example.com`);
    expect(all(fixture, '#e-city').length).toBe(0);
  });

  it('shows who last edited, and the earlier email, in the details', async () => {
    const { fixture } = await open([
      registration({ edited_by: 'ritesh@example.com', edited_at: '2027-01-16T08:00:00+00:00', previous_email: 'old@example.com' }),
    ]);
    clickButton(fixture, 'Show details');
    await settle(fixture);
    expect(text(fixture)).toContain('by ritesh@example.com');
    expect(text(fixture)).toContain('old@example.com');
  });
});

describe('Admin registrations: course access', () => {
  const approved = () => registration({ status: 'approved' });
  const GIVEN = { course_id: 'c1', course_name: 'CLAT', granted_at: '2027-01-15T08:00:00+00:00', granted_by: 'ritesh@example.com', source: 'manual', expires_at: null, active: true };

  async function openDetails(given: unknown[] = [GIVEN]) {
    const env = await open([approved()]);
    clickButton(env.fixture, 'Show details');
    env.http.expectOne(`${API}/api/admin/courses`).flush(COURSES);
    await settle(env.fixture);
    env.http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access`).flush(given as object[]);
    await settle(env.fixture);
    return env;
  }

  it('shows an approved student what courses they have', async () => {
    const { fixture } = await openDetails();
    const content = text(fixture);
    expect(content).toContain('Course access');
    expect(content).toContain('CLAT');
    expect(content).toContain('No end date');
    expect(content).toContain('given by ritesh@example.com');
    expect(all(fixture, '.access .status.ok').length).toBe(1);
  });

  it('says when they have none yet', async () => {
    const { fixture } = await openDetails([]);
    expect(text(fixture)).toContain('No courses yet.');
  });

  it('shows an ended course as ended', async () => {
    const { fixture } = await openDetails([{ ...GIVEN, expires_at: '2027-02-01T23:59:59+05:30', active: false }]);
    expect(text(fixture)).toContain('Ended 1 Feb 2027');
    expect(all(fixture, '.access .status:not(.ok)').length).toBe(1);
  });

  it('has no access section for a student who is not approved', async () => {
    const { fixture } = await open([registration()]);
    clickButton(fixture, 'Show details');
    await settle(fixture);
    expect(all(fixture, '.access').length).toBe(0);
  });

  it('gives access to the chosen course and shows it', async () => {
    const { fixture, http } = await openDetails([]);
    expect(el<HTMLButtonElement>(fixture, '.access .btn:not(.danger)').disabled).toBe(true); // nothing chosen yet
    type(fixture, '.access select', 'c2');
    await settle(fixture);
    clickButton(fixture, 'Give or renew access');
    const request = http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ course_id: 'c2' });
    request.flush({ ...GIVEN, course_id: 'c2', course_name: 'CAT' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access`).flush([{ ...GIVEN, course_id: 'c2', course_name: 'CAT' }]);
    await settle(fixture);
    expect(text(fixture)).toContain('Gave Meera access.');
    expect(text(fixture)).toContain('CAT');
  });

  it('removes a course', async () => {
    const { fixture, http } = await openDetails();
    clickButton(fixture, 'Remove');
    const request = http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access/c1`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access`).flush([]);
    await settle(fixture);
    expect(text(fixture)).toContain('Removed CLAT from Meera.');
    expect(text(fixture)).toContain('No courses yet.');
  });

  it("shows the API's reason when access can't be given", async () => {
    const { fixture, http } = await openDetails([]);
    type(fixture, '.access select', 'c1');
    await settle(fixture);
    clickButton(fixture, 'Give or renew access');
    http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access`).flush(
      { detail: "This course's end date has passed. Change its access length first." }, { status: 409, statusText: 'Conflict' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain("end date has passed");
  });
});

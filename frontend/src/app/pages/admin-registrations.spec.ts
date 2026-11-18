import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { API, all, clickButton, el, registration, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminRegistrations, searchText } from './admin-registrations';

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

const PEOPLE = [
  registration({ email: 'meera@example.com', first_name: 'Meera', last_name: 'Kapoor', mobile: '9876543210', city: 'Noida', pin_code: '201309', course_names: ['CLAT'], gender: 'female', birth_date: '2004-08-21', created_at: '2027-01-15T08:00:00+00:00' }),
  registration({ email: 'rahul.bansal@example.org', first_name: 'Rahul', last_name: 'Bansal', mobile: '9123456780', whatsapp: '9000011111', city: 'Pune', pin_code: '411001', address: '12, Kothrud', course_names: ['CAT', 'IPMAT'], gender: 'male', birth_date: '2003-03-05', created_at: '2027-02-02T08:00:00+00:00', status: 'approved', decided_by: 'ritesh@example.com', decided_at: '2027-02-03T08:00:00+00:00' }),
  registration({ email: 'zed@example.com', first_name: 'Zed', last_name: 'Khan', mobile: '9000000001', city: 'Pune', pin_code: '411045', course_names: ['CUET'], gender: 'other', reason: 'Documents unclear', previous_email: 'old.zed@example.com' }),
];

describe('Registrations: search', () => {
  const emails = (fixture: Parameters<typeof el>[0]) => all(fixture, '[data-email]').map((r) => r.getAttribute('data-email'));

  it('has a search box only when there are registrations, and says how many are shown', async () => {
    const { fixture } = await open(PEOPLE);
    expect(el(fixture, '#search').getAttribute('aria-label')).toBe('Search registrations');
    expect(el(fixture, '#showing').textContent).toContain('3 shown');
  });

  it('has no search box when the list is empty', async () => {
    const { fixture } = await open([]);
    expect(all(fixture, '#search').length).toBe(0);
  });

  it.each([
    ['name', 'meera', ['meera@example.com']],
    ['surname, in any case', 'BANSAL', ['rahul.bansal@example.org']],
    ['email', 'zed@example', ['zed@example.com']],
    ['mobile', '9123456780', ['rahul.bansal@example.org']],
    ['part of a mobile', '000001', ['zed@example.com']],
    ['WhatsApp number', '9000011111', ['rahul.bansal@example.org']],
    ['city', 'pune', ['rahul.bansal@example.org', 'zed@example.com']],
    ['PIN code', '201309', ['meera@example.com']],
    ['address', 'kothrud', ['rahul.bansal@example.org']],
    ['a course', 'IPMAT', ['rahul.bansal@example.org']],
    ['gender', 'female', ['meera@example.com']],
    ['status', 'approved', ['rahul.bansal@example.org']],
    ['birth date as stored', '2003-03-05', ['rahul.bansal@example.org']],
    ['registered date as stored', '2027-02-02', ['rahul.bansal@example.org']],
    ['who decided', 'ritesh', ['rahul.bansal@example.org']],
    ['the reason given', 'unclear', ['zed@example.com']],
    ['an earlier email', 'old.zed', ['zed@example.com']],
  ])('finds a registration by its %s', async (_what, query, expected) => {
    const { fixture } = await open(PEOPLE);
    type(fixture, '#search', query);
    await settle(fixture);
    expect(emails(fixture)).toEqual(expected);
  });

  it('needs every word to be found, in any order and across different details', async () => {
    const { fixture } = await open(PEOPLE);
    type(fixture, '#search', 'pune cat');
    await settle(fixture);
    expect(emails(fixture)).toEqual(['rahul.bansal@example.org']);
    type(fixture, '#search', '  411045   zed ');
    await settle(fixture);
    expect(emails(fixture)).toEqual(['zed@example.com']);
  });

  it('finds a mobile number typed with a space, and shows how many match', async () => {
    const { fixture } = await open(PEOPLE);
    type(fixture, '#search', '91234 56780');
    await settle(fixture);
    expect(emails(fixture)).toEqual(['rahul.bansal@example.org']);
    expect(el(fixture, '#showing').textContent).toContain('Showing 1 of 3');
  });

  it('says so when nothing matches, and clears with the button', async () => {
    const { fixture } = await open(PEOPLE);
    type(fixture, '#search', 'nobody here');
    await settle(fixture);
    expect(emails(fixture)).toEqual([]);
    expect(el(fixture, '#no-match').textContent).toContain('No registrations match "nobody here"');
    el(fixture, '#clear-search').click();
    await settle(fixture);
    expect(emails(fixture).length).toBe(3);
    expect(all(fixture, '#clear-search').length).toBe(0);
    expect(all(fixture, '#no-match').length).toBe(0);
  });

  it('keeps the search when another list is opened', async () => {
    const { fixture, http } = await open(PEOPLE);
    type(fixture, '#search', 'pune');
    await settle(fixture);
    clickButton(fixture, 'approved');
    answerReload(http, 'approved', [PEOPLE[1], registration({ email: 'x@example.com', first_name: 'X', city: 'Delhi', status: 'approved' })]);
    await settle(fixture);
    expect(emails(fixture)).toEqual(['rahul.bansal@example.org']);
    expect(el<HTMLInputElement>(fixture, '#search').value).toBe('pune');
  });

  it('never matches the words undefined or null for details that are empty', async () => {
    const { fixture } = await open([registration({ email: 'blank@example.com', birth_date: '', gender: '', address: '', city: '', pin_code: '', reason: '' })]);
    type(fixture, '#search', 'undefined');
    await settle(fixture);
    expect(emails(fixture)).toEqual([]);
    type(fixture, '#search', 'null');
    await settle(fixture);
    expect(emails(fixture)).toEqual([]);
  });

  it('builds the line it searches from every detail the page shows', () => {
    const line = searchText(PEOPLE[1]);
    for (const part of ['rahul', 'bansal', 'rahul.bansal@example.org', '9123456780', '9000011111', 'kothrud', 'pune', '411001', 'male', '2003-03-05', 'cat ipmat', 'approved', 'ritesh@example.com']) {
      expect(line).toContain(part);
    }
  });
});

describe('Registrations: import link', () => {
  it('has an Import button that opens the import page', async () => {
    const { fixture } = await open([]);
    const link = el<HTMLAnchorElement>(fixture, '#import-link');
    expect(link.getAttribute('href')).toBe('/demo/admin/import-students');
    expect(link.textContent).toContain('Import');
  });
});

describe('Registrations: template download', () => {
  it('has a Template button next to Import that saves the Excel template', async () => {
    const { fixture, http } = await open([]);
    expect(el(fixture, '#template').textContent).toContain('Template');
    const link = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValueOnce(link);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    el(fixture, '#template').click();
    const request = http.expectOne(`${API}/api/admin/students/import/template`);
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['x']));
    await settle(fixture);
    expect(link.download).toBe('student-import-template.xlsx');
    expect(link.click).toHaveBeenCalled();
  });

  it('shows why the template could not be downloaded', async () => {
    const { fixture, http } = await open([]);
    el(fixture, '#template').click();
    http.expectOne(`${API}/api/admin/students/import/template`).flush(new Blob(['{}']), { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(all(fixture, '.alert.error').length).toBe(1);
  });
});

describe('Registrations opened from the admin home', () => {
  async function openWith(status: string | undefined, list: unknown[] = []) {
    const env = setupTestBed(status === undefined ? {} : { queryParams: { status } });
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(AdminRegistrations);
    fixture.detectChanges();
    return { env, fixture, list };
  }

  it('opens on the list named in the address, for example approved students', async () => {
    const { env, fixture } = await openWith('approved');
    env.http.expectOne((r) => r.url === `${API}/api/admin/registrations` && r.params.get('status') === 'approved').flush([]);
    await settle(fixture);
    expect(el(fixture, '[role="tab"][aria-selected="true"]').textContent!.trim()).toBe('approved');
  });

  it.each([[undefined], ['nonsense']])('opens on pending when the address names %s', async (status) => {
    const { env, fixture } = await openWith(status);
    env.http.expectOne((r) => r.url === `${API}/api/admin/registrations` && r.params.get('status') === 'pending').flush([]);
    await settle(fixture);
    expect(el(fixture, '[role="tab"][aria-selected="true"]').textContent!.trim()).toBe('pending');
  });
});

describe('Admin registrations page', () => {
  it('shows every course a student chose on their card', async () => {
    const { fixture } = await open([registration({ course_ids: ['c1', 'c2'], course_names: ['CLAT', 'CAT'] })]);
    expect(el(fixture, '.item-head div.small:not(.muted)').textContent).toContain('CLAT, CAT');
  });

  it('shows each pending registration with who, which course and its status', async () => {
    const { fixture } = await open([
      registration(),
      registration({ email: 'pooja@example.com', first_name: 'Pooja', last_name: 'Shah', course_ids: ['c2'], course_names: ['CAT'], course_name: 'CAT' }),
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
    expect(all(fixture, '#e-courses label').map((l) => l.textContent?.trim())).toEqual(['CLAT', 'CAT']);
    expect(el<HTMLInputElement>(fixture, '#e-course-c1').checked).toBe(true);
    expect(el<HTMLInputElement>(fixture, '#e-course-c2').checked).toBe(false);
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

  it('changes the courses and sends the new list', async () => {
    const { fixture, http } = await openEdit();
    el<HTMLInputElement>(fixture, '#e-course-c2').click();
    await settle(fixture);
    clickButton(fixture, 'Save');
    expect(http.expectOne(`${API}/api/admin/registrations/meera%40example.com`).request.body).toEqual({ course_ids: ['c1', 'c2'] });
  });

  it('can untick a course, and sends nothing about courses when they are left alone', async () => {
    const { fixture, http } = await openEdit();
    el<HTMLInputElement>(fixture, '#e-course-c2').click();
    el<HTMLInputElement>(fixture, '#e-course-c1').click();
    await settle(fixture);
    type(fixture, '#e-city', 'Delhi');
    clickButton(fixture, 'Save');
    expect(http.expectOne(`${API}/api/admin/registrations/meera%40example.com`).request.body).toEqual({ city: 'Delhi', course_ids: ['c2'] });
  });

  it('shows the message next to the courses when the server refuses the choice', async () => {
    const { fixture, http } = await openEdit();
    el<HTMLInputElement>(fixture, '#e-course-c1').click();
    await settle(fixture);
    clickButton(fixture, 'Save');
    http.expectOne(`${API}/api/admin/registrations/meera%40example.com`).flush(
      { detail: 'Please correct the marked fields.', errors: { course_ids: 'Choose at least one course.' } }, { status: 422, statusText: 'x' },
    );
    await settle(fixture);
    expect(el(fixture, '#e-courses').textContent).toContain('Choose at least one course.');
  });

  it('offers a course the student already has even if it is hidden now, and hides other hidden courses', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(AdminRegistrations);
    fixture.detectChanges();
    env.http.expectOne((r) => r.url === `${API}/api/admin/registrations`).flush([registration({ course_ids: ['c1', 'c3'], course_names: ['CLAT', 'Old'] })]);
    await settle(fixture);
    clickButton(fixture, 'Edit');
    env.http.expectOne(`${API}/api/admin/courses`).flush([
      ...COURSES, { id: 'c3', name: 'Old', fee: 0, access: { type: 'unlimited' }, active: false, created_at: '' },
      { id: 'c4', name: 'Hidden', fee: 0, access: { type: 'unlimited' }, active: false, created_at: '' },
    ]);
    await settle(fixture);
    expect(all(fixture, '#e-courses label').map((l) => l.textContent?.trim())).toEqual(['CLAT', 'CAT', 'Old']);
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

describe('Admin registrations: giving access to all chosen courses', () => {
  const OPEN = { course_id: 'c1', course_name: 'CLAT', granted_at: '2027-01-15T08:00:00+00:00', granted_by: 'ritesh@example.com', source: 'manual', expires_at: null, active: true };
  const OPEN2 = { ...OPEN, course_id: 'c2', course_name: 'CAT' };

  async function openChosen(names = ['CLAT', 'CAT']) {
    const env = await open([registration({ status: 'approved', course_ids: names.map((_, i) => `c${i + 1}`), course_names: names, course_id: 'c1', course_name: names[0] })]);
    clickButton(env.fixture, 'Show details');
    env.http.expectOne(`${API}/api/admin/courses`).flush(COURSES);
    await settle(env.fixture);
    env.http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access`).flush([]);
    await settle(env.fixture);
    return env;
  }

  it('shows the chosen courses beside a button that gives access to all of them', async () => {
    const { fixture } = await openChosen();
    expect(el(fixture, '#give-requested').textContent).toContain('Give access to all chosen courses');
    expect(el(fixture, '.access').textContent).toContain('CLAT, CAT');
    expect(el<HTMLButtonElement>(fixture, '.access .btn:not(.danger)').textContent).toContain('Give or renew access'); // the single-course button stays first
  });

  it('gives all the chosen courses at once and says which', async () => {
    const { fixture, http } = await openChosen();
    el<HTMLButtonElement>(fixture, '#give-requested').click();
    const request = http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access/requested`);
    expect(request.request.method).toBe('POST');
    request.flush({ granted: [OPEN, OPEN2], skipped: [] });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access`).flush([OPEN, OPEN2]);
    await settle(fixture);
    expect(text(fixture)).toContain('Gave Meera access to CLAT and CAT.');
    expect(all(fixture, '.access .status.ok').length).toBe(2);
  });

  it('names three courses with commas and one course on its own', async () => {
    const env = await openChosen(['CLAT', 'CAT', 'IPMAT']);
    el<HTMLButtonElement>(env.fixture, '#give-requested').click();
    env.http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access/requested`).flush({ granted: [OPEN, OPEN2, { ...OPEN, course_id: 'c3', course_name: 'IPMAT' }], skipped: [] });
    await settle(env.fixture);
    env.http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access`).flush([]);
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('Gave Meera access to CLAT, CAT and IPMAT.');
  });

  it('says which chosen courses were skipped because they no longer exist', async () => {
    const { fixture, http } = await openChosen();
    el<HTMLButtonElement>(fixture, '#give-requested').click();
    http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access/requested`).flush({ granted: [OPEN], skipped: ['Vanished'] });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access`).flush([OPEN]);
    await settle(fixture);
    expect(text(fixture)).toContain('Gave Meera access to CLAT. Skipped Vanished: no longer a course.');
    expect(el(fixture, '.access .alert').className).toContain('error');
  });

  it("shows the server's reason when access cannot be given", async () => {
    const { fixture, http } = await openChosen();
    el<HTMLButtonElement>(fixture, '#give-requested').click();
    http.expectOne(`${API}/api/admin/registrations/meera%40example.com/access/requested`).flush({ detail: 'You can only give access to an approved student, and this one is suspended.' }, { status: 409, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('You can only give access to an approved student');
    expect(el<HTMLButtonElement>(fixture, '#give-requested').disabled).toBe(false);
  });
});

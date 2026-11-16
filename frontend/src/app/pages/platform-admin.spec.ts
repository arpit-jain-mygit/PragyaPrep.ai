import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Institute } from '../core/models';
import { API, all, clickButton, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { PlatformAdmin } from './platform-admin';

const LIST = `${API}/api/platform/institutes`;

const ALPHA: Institute = {
  slug: 'alpha', name: 'Alpha Institute', status: 'active', primary_color: '#2563eb', created_at: '2027-01-15T08:00:00+00:00',
  admin: { email: 'ann@alpha.example.com', first_name: 'Ann', last_name: 'Lee', status: 'approved' },
};
const BETA: Institute = {
  slug: 'beta', name: 'Beta Academy', status: 'suspended', primary_color: '#0f766e', created_at: '2027-02-01T08:00:00+00:00', admin: null,
};

async function open(institutes: Institute[] = [ALPHA, BETA]) {
  const env = setupTestBed({ tenant: false });
  env.sessions.save(sessionFor('platform_admin', 'platform'));
  const fixture = TestBed.createComponent(PlatformAdmin);
  fixture.detectChanges();
  env.http.expectOne(LIST).flush(institutes);
  await settle(fixture);
  return { ...env, fixture };
}

function answerReload(http: ReturnType<typeof setupTestBed>['http'], institutes: Institute[]) {
  http.expectOne(LIST).flush(institutes);
}

describe('Platform admin page: viewing', () => {
  it('lists each institute with its status and admin', async () => {
    const { fixture } = await open();
    const rows = all(fixture, 'tbody tr').map((r) => r.textContent?.replace(/\s+/g, ' ').trim() ?? '');
    expect(rows[0]).toContain('Alpha Institute');
    expect(rows[0]).toContain('alpha');
    expect(rows[0]).toContain('active');
    expect(rows[0]).toContain('Ann Lee');
    expect(rows[0]).toContain('ann@alpha.example.com');
    expect(rows[0]).toContain('15 Jan 2027');
    expect(rows[1]).toContain('Beta Academy');
    expect(rows[1]).toContain('suspended');
    expect(rows[1]).toContain('No admin on record');
  });

  it('shows each institute\'s colour', async () => {
    const { fixture } = await open();
    const dots = all<HTMLElement>(fixture, '.swatch');
    expect(dots.length).toBe(2);
    expect(dots[1].style.background).toBeTruthy();
  });

  it('links to each institute\'s own page', async () => {
    const { fixture } = await open();
    const link = all<HTMLAnchorElement>(fixture, 'a.btn').find((a) => a.textContent?.trim() === 'Open page')!;
    expect(link.getAttribute('href')).toBe('/alpha/login');
  });

  it('invites the first institute when there are none', async () => {
    const { fixture } = await open([]);
    expect(text(fixture)).toContain('No institutes yet. Add the first one.');
  });

  it('explains it when the list cannot be loaded', async () => {
    const env = setupTestBed({ tenant: false });
    const fixture = TestBed.createComponent(PlatformAdmin);
    fixture.detectChanges();
    env.http.expectOne(LIST).flush({ detail: "You don't have access to this." }, { status: 403, statusText: 'Forbidden' });
    await settle(fixture);
    expect(text(fixture)).toContain("You don't have access to this.");
  });

  it('has no delete or remove button anywhere, in the list or while editing', async () => {
    const { fixture } = await open();
    const labels = () => all(fixture, 'button, a').map((b) => b.textContent?.toLowerCase() ?? '').join(' | ');
    expect(labels()).not.toMatch(/delete|remove/);

    clickButton(fixture, 'Edit');
    await settle(fixture);
    expect(labels()).not.toMatch(/delete|remove/);
    expect(text(fixture)).toContain("Institutes can't be deleted here.");

    clickButton(fixture, 'Cancel');
    clickButton(fixture, 'Add an institute');
    await settle(fixture);
    expect(labels()).not.toMatch(/delete|remove/);
  });
});

describe('Platform admin page: adding an institute', () => {
  async function openForm() {
    const env = await open([ALPHA]);
    clickButton(env.fixture, 'Add an institute');
    await settle(env.fixture);
    return env;
  }

  function fill(fixture: ReturnType<typeof TestBed.createComponent<PlatformAdmin>>) {
    type(fixture, '#new-slug', ' NewInst ');
    type(fixture, '#new-name', 'New Institute');
    type(fixture, '#new-color', '#7c3aed');
    type(fixture, '#new-admin-name', 'Nina Shah');
    type(fixture, '#new-admin-email', 'nina@newinst.example.com');
  }

  it('shows the form with a note about the short name, and hides the button while it is open', async () => {
    const { fixture } = await openForm();
    expect(text(fixture)).toContain("can't be changed later");
    expect(text(fixture)).toContain('The admin is approved straight away and gets an email.');
    expect(all(fixture, 'button').some((b) => b.textContent?.trim() === 'Add an institute')).toBe(false);
  });

  it('creates the institute, tells the platform admin the admin was emailed, and refreshes the list', async () => {
    const { fixture, http } = await openForm();
    fill(fixture);
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));

    const request = http.expectOne(LIST);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      slug: 'NewInst', name: 'New Institute', primary_color: '#7c3aed', admin_name: 'Nina Shah', admin_email: 'nina@newinst.example.com',
    });
    const created: Institute = { ...ALPHA, slug: 'newinst', name: 'New Institute', admin: { email: 'nina@newinst.example.com', first_name: 'Nina', last_name: 'Shah', status: 'approved' } };
    request.flush({ institute: created, new_admin_notified: true });
    await settle(fixture);
    answerReload(http, [ALPHA, created]);
    await settle(fixture);

    expect(text(fixture)).toContain('Created New Institute. We emailed nina@newinst.example.com.');
    expect(all(fixture, 'form').length).toBe(0);
    expect(all(fixture, 'tbody tr').length).toBe(2);
  });

  it('warns when the institute was created but the email could not be sent', async () => {
    const { fixture, http } = await openForm();
    fill(fixture);
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    const created: Institute = { ...ALPHA, slug: 'newinst', name: 'New Institute' };
    http.expectOne(LIST).flush({ institute: created, new_admin_notified: false });
    await settle(fixture);
    answerReload(http, [ALPHA, created]);
    await settle(fixture);
    expect(text(fixture)).toContain('could not be sent');
    expect(el(fixture, '.alert').className).toContain('warn');
  });

  it('shows the API\'s message and keeps what was typed when something is refused', async () => {
    const { fixture, http } = await openForm();
    fill(fixture);
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    http.expectOne(LIST).flush({ detail: "An institute called 'newinst' already exists." }, { status: 422, statusText: 'Unprocessable Entity' });
    await settle(fixture);

    expect(text(fixture)).toContain("An institute called 'newinst' already exists.");
    expect(all(fixture, 'form').length).toBe(1);
    expect(el<HTMLInputElement>(fixture, '#new-name').value).toBe('New Institute');
  });

  it('closes the form without sending anything when cancelled', async () => {
    const { fixture, http } = await openForm();
    clickButton(fixture, 'Cancel');
    await settle(fixture);
    expect(all(fixture, 'form').length).toBe(0);
    http.expectNone(LIST);
  });
});

describe('Platform admin page: editing an institute', () => {
  async function openEdit(institute: Institute = ALPHA) {
    const env = await open([institute, BETA]);
    clickButton(env.fixture, 'Edit');
    await settle(env.fixture);
    return env;
  }

  async function save(env: Awaited<ReturnType<typeof openEdit>>, result: object, label = 'Save') {
    clickButton(env.fixture, label);
    const request = env.http.expectOne(`${LIST}/alpha`);
    expect(request.request.method).toBe('PATCH');
    const sent = request.request.body;
    request.flush(result);
    await settle(env.fixture);
    answerReload(env.http, [ALPHA, BETA]);
    await settle(env.fixture);
    return sent;
  }

  it('opens with the current values', async () => {
    const { fixture } = await openEdit();
    expect(el<HTMLInputElement>(fixture, '#name-alpha').value).toBe('Alpha Institute');
    expect(el<HTMLInputElement>(fixture, '#color-alpha').value).toBe('#2563eb');
    expect(el<HTMLSelectElement>(fixture, '#status-alpha').value).toBe('active');
    expect(el<HTMLInputElement>(fixture, '#admin-name-alpha').value).toBe('Ann Lee');
    expect(el<HTMLInputElement>(fixture, '#admin-email-alpha').value).toBe('ann@alpha.example.com');
  });

  it('sends only what was changed', async () => {
    const env = await openEdit();
    type(env.fixture, '#name-alpha', 'Alpha Renamed');
    const sent = await save(env, { institute: { ...ALPHA, name: 'Alpha Renamed' }, new_admin_notified: null });
    expect(sent).toEqual({ name: 'Alpha Renamed' });
    expect(text(env.fixture)).toContain('Saved Alpha Renamed.');
    expect(all(env.fixture, '#name-alpha').length).toBe(0);
  });

  it('changes the colour', async () => {
    const env = await openEdit();
    type(env.fixture, '#color-alpha', '#0f766e');
    expect(await save(env, { institute: { ...ALPHA, primary_color: '#0f766e' }, new_admin_notified: null })).toEqual({ primary_color: '#0f766e' });
  });

  it('warns before suspending, then sends the new status', async () => {
    const env = await openEdit();
    expect(text(env.fixture)).not.toContain('locked out');
    type(env.fixture, '#status-alpha', 'suspended');
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('Everyone at this institute will be locked out');
    expect(await save(env, { institute: { ...ALPHA, status: 'suspended' }, new_admin_notified: null })).toEqual({ status: 'suspended' });
  });

  it('can set a suspended institute back to active, without the lock-out warning', async () => {
    const env = await open([ALPHA, BETA]);
    clickButton(env.fixture, 'Edit'); // the first Edit is Alpha, so open Beta by its row instead
    await settle(env.fixture);
    clickButton(env.fixture, 'Cancel');
    await settle(env.fixture);
    const betaEdit = all<HTMLButtonElement>(env.fixture, 'tr[data-institute=beta] button').find((b) => b.textContent?.trim() === 'Edit')!;
    betaEdit.click();
    await settle(env.fixture);
    type(env.fixture, '#status-beta', 'active');
    await settle(env.fixture);
    expect(text(env.fixture)).not.toContain('locked out');
    clickButton(env.fixture, 'Save');
    expect(env.http.expectOne(`${LIST}/beta`).request.body).toEqual({ status: 'active' });
  });

  it('changes the admin\'s name without calling it a replacement', async () => {
    const env = await openEdit();
    type(env.fixture, '#admin-name-alpha', 'Ann Marie Lee');
    await settle(env.fixture);
    expect(text(env.fixture)).not.toContain('will become the admin');
    expect(await save(env, { institute: ALPHA, new_admin_notified: null })).toEqual({ admin_name: 'Ann Marie Lee' });
  });

  it('treats the same email in another case as no change', async () => {
    const env = await openEdit();
    type(env.fixture, '#admin-email-alpha', '  ANN@alpha.example.com ');
    await settle(env.fixture);
    expect(text(env.fixture)).not.toContain('will become the admin');
    clickButton(env.fixture, 'Save');
    env.http.expectNone(`${LIST}/alpha`);
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('No changes to Alpha Institute.');
  });

  it('says plainly who becomes the admin and who is switched off, before anything is sent', async () => {
    const env = await openEdit();
    type(env.fixture, '#admin-email-alpha', 'priya@alpha.example.com');
    await settle(env.fixture);

    const note = text(env.fixture);
    expect(note).toContain('priya@alpha.example.com will become the admin and get an email.');
    expect(note).toContain('ann@alpha.example.com will be switched off.');
    expect(note).toContain('They will be called Ann Lee.');
    expect(note).toContain('Change the name above if this is a different person.');
    expect(all<HTMLButtonElement>(env.fixture, 'button').some((b) => b.textContent?.trim() === 'Save and switch admin')).toBe(true);
    env.http.expectNone(`${LIST}/alpha`);
  });

  it('replaces the admin and tells the platform admin the new one was emailed', async () => {
    const env = await openEdit();
    type(env.fixture, '#admin-email-alpha', 'priya@alpha.example.com');
    await settle(env.fixture);
    const now = { ...ALPHA, admin: { email: 'priya@alpha.example.com', first_name: 'Ann', last_name: 'Lee', status: 'approved' } };

    const sent = await save(env, { institute: now, new_admin_notified: true }, 'Save and switch admin');

    // The name shown on screen goes with a new email, so the new admin can't silently inherit the old admin's.
    expect(sent).toEqual({ admin_name: 'Ann Lee', admin_email: 'priya@alpha.example.com' });
    expect(text(env.fixture)).toContain('We emailed the new admin, priya@alpha.example.com.');
  });

  it('warns when the new admin could not be emailed', async () => {
    const env = await openEdit();
    type(env.fixture, '#admin-email-alpha', 'priya@alpha.example.com');
    await settle(env.fixture);
    const now = { ...ALPHA, admin: { email: 'priya@alpha.example.com', first_name: 'Ann', last_name: 'Lee', status: 'approved' } };
    await save(env, { institute: now, new_admin_notified: false }, 'Save and switch admin');
    expect(text(env.fixture)).toContain('the email to the new admin could not be sent');
    expect(text(env.fixture)).toContain('priya@alpha.example.com');
    expect(el(env.fixture, '.alert').className).toContain('warn');
  });

  it('sends the new admin\'s name together with a new email', async () => {
    const env = await openEdit();
    type(env.fixture, '#admin-email-alpha', 'priya@alpha.example.com');
    type(env.fixture, '#admin-name-alpha', 'Priya Menon');
    await settle(env.fixture);
    const sent = await save(env, { institute: ALPHA, new_admin_notified: true }, 'Save and switch admin');
    expect(sent).toEqual({ admin_name: 'Priya Menon', admin_email: 'priya@alpha.example.com' });
  });

  it('keeps the form open, with what was typed, when a change is refused', async () => {
    const env = await openEdit();
    type(env.fixture, '#admin-email-alpha', 'asha@alpha.example.com');
    await settle(env.fixture);
    clickButton(env.fixture, 'Save and switch admin');
    env.http.expectOne(`${LIST}/alpha`).flush(
      { detail: 'That email is already registered with this institute.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle(env.fixture);

    expect(text(env.fixture)).toContain('That email is already registered with this institute.');
    expect(el<HTMLInputElement>(env.fixture, '#admin-email-alpha').value).toBe('asha@alpha.example.com');
  });

  it('closes the form without sending anything when cancelled', async () => {
    const { fixture, http } = await openEdit();
    clickButton(fixture, 'Cancel');
    await settle(fixture);
    expect(all(fixture, '#name-alpha').length).toBe(0);
    http.expectNone(`${LIST}/alpha`);
  });

  it('offers an admin email for an institute that has none on record, and asks only for what changed', async () => {
    const env = await open([BETA]);
    clickButton(env.fixture, 'Edit');
    await settle(env.fixture);
    expect(el<HTMLInputElement>(env.fixture, '#admin-email-beta').value).toBe('');
    type(env.fixture, '#admin-email-beta', 'new@beta.example.com');
    type(env.fixture, '#admin-name-beta', 'Bea Rao');
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('new@beta.example.com will become the admin');
    expect(text(env.fixture)).not.toContain('will be switched off');
  });
});

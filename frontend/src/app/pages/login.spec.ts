import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API, all, clickButton, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { Login, homeFor } from './login';

async function open(queryParams: Record<string, string> = {}) {
  const env = setupTestBed({ queryParams });
  const fixture = TestBed.createComponent(Login);
  fixture.detectChanges();
  await settle(fixture);
  return { ...env, fixture };
}

async function ask(fixture: ReturnType<typeof TestBed.createComponent<Login>>, http: ReturnType<typeof setupTestBed>['http'], email: string, reply: object, status = 200) {
  type(fixture, '#email', email);
  el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
  http.expectOne(`${API}/api/auth/request-code`).flush(reply, status === 200 ? {} : { status, statusText: 'Error' });
  await settle(fixture);
}

afterEach(() => vi.useRealTimers());

describe('Login page: asking for a code', () => {
  it('starts by asking for the email', async () => {
    const { fixture } = await open();
    expect(text(fixture)).toContain('Enter the email address you registered with');
    expect(el<HTMLButtonElement>(fixture, 'button[type=submit]').disabled).toBe(true);
  });

  it('only lets the person ask once an email is typed', async () => {
    const { fixture } = await open();
    type(fixture, '#email', 'asha@example.com');
    await settle(fixture);
    expect(el<HTMLButtonElement>(fixture, 'button[type=submit]').disabled).toBe(false);
  });

  it('sends the email to the API and moves on to the code step when a code was sent', async () => {
    const { fixture, http } = await open();
    type(fixture, '#email', '  asha@example.com ');
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    const request = http.expectOne(`${API}/api/auth/request-code`);
    expect(request.request.body).toEqual({ email: 'asha@example.com' });
    request.flush({ status: 'code_sent', message: "We've emailed you a 6-digit code." });
    await settle(fixture);

    expect(text(fixture)).toContain("We've emailed you a 6-digit code.");
    expect(text(fixture)).toContain('asha@example.com');
    expect(all(fixture, '#code').length).toBe(1);
  });

  it('tells an unregistered email to register, and offers the button', async () => {
    const { fixture, http } = await open();
    await ask(fixture, http, 'nobody@example.com', { status: 'not_registered', message: "This email isn't registered with Demo Institute. Register first." });

    expect(text(fixture)).toContain("This email isn't registered with Demo Institute. Register first.");
    const button = all<HTMLAnchorElement>(fixture, '#status-message a')[0];
    expect(button.textContent?.trim()).toBe('Register');
    expect(button.getAttribute('href')).toContain('/demo/register');
    expect(button.getAttribute('href')).toContain('email=nobody@example.com');
    expect(all(fixture, '#code').length).toBe(0);
  });

  it('tells a pending person their registration is waiting', async () => {
    const { fixture, http } = await open();
    await ask(fixture, http, 'p@example.com', { status: 'pending', message: "Your registration is waiting for approval. We'll email you once it's approved." });
    expect(text(fixture)).toContain('Your registration is waiting for approval.');
    expect(all(fixture, '#status-message a').length).toBe(0);
    expect(all(fixture, '#code').length).toBe(0);
  });

  it('tells a rejected person, and offers to register again', async () => {
    const { fixture, http } = await open();
    await ask(fixture, http, 'r@example.com', { status: 'rejected', message: "Your registration wasn't approved. Contact Demo Institute." });
    expect(text(fixture)).toContain("Your registration wasn't approved.");
    expect(all<HTMLAnchorElement>(fixture, '#status-message a')[0].textContent?.trim()).toBe('Register again');
  });

  it('tells a suspended person their access is paused', async () => {
    const { fixture, http } = await open();
    await ask(fixture, http, 's@example.com', { status: 'suspended', message: 'Your access is paused. Contact Demo Institute.' });
    expect(text(fixture)).toContain('Your access is paused. Contact Demo Institute.');
    expect(all(fixture, '#code').length).toBe(0);
  });

  it.each([
    [422, 'Enter a valid email address.'],
    [429, 'Please wait 20 seconds before asking for another code.'],
    [503, "We couldn't send the email right now. Please try again in a few minutes."],
  ])('shows the refusal for a %i answer', async (status, detail) => {
    const { fixture, http } = await open();
    await ask(fixture, http, 'asha@example.com', { detail }, status);
    expect(text(fixture)).toContain(detail);
    expect(all(fixture, '#code').length).toBe(0);
  });

  it('fills in the email when it comes from the register page, and mentions an ended session', async () => {
    const { fixture } = await open({ email: 'meera@example.com', ended: '1' });
    expect(el<HTMLInputElement>(fixture, '#email').value).toBe('meera@example.com');
    expect(text(fixture)).toContain('Your session ended. Please log in again.');
  });
});

describe('Login page: entering the code', () => {
  async function atCodeStep() {
    const env = await open();
    await ask(env.fixture, env.http, 'asha@example.com', { status: 'code_sent', message: "We've emailed you a 6-digit code." });
    return env;
  }

  it('signs a student in and takes them to their home page', async () => {
    const { fixture, http, sessions, navigate } = await atCodeStep();
    type(fixture, '#code', '123 456');
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    const request = http.expectOne(`${API}/api/auth/verify-code`);
    expect(request.request.body).toEqual({ email: 'asha@example.com', code: '123 456' });
    request.flush(sessionFor('student'));
    await settle(fixture);

    expect(sessions.member('demo')?.role).toBe('student');
    expect(navigate).toHaveBeenCalledWith(['/', 'demo', 'home']);
  });

  it('takes the institute admin to the admin home', async () => {
    const { fixture, http, navigate } = await atCodeStep();
    type(fixture, '#code', '123456');
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/api/auth/verify-code`).flush(sessionFor('tenant_admin'));
    await settle(fixture);
    expect(navigate).toHaveBeenCalledWith(['/', 'demo', 'admin', 'home']);
  });

  it('keeps the Log in button off until six digits are typed', async () => {
    const { fixture } = await atCodeStep();
    const button = () => el<HTMLButtonElement>(fixture, 'button[type=submit]');
    type(fixture, '#code', '12345');
    await settle(fixture);
    expect(button().disabled).toBe(true);
    type(fixture, '#code', '123456');
    await settle(fixture);
    expect(button().disabled).toBe(false);
  });

  it('shows the message for a wrong code and lets the person try again', async () => {
    const { fixture, http, sessions } = await atCodeStep();
    type(fixture, '#code', '000000');
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/api/auth/verify-code`).flush(
      { detail: "That code isn't right, or it has expired. Ask for a new one." },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle(fixture);

    expect(text(fixture)).toContain("That code isn't right, or it has expired.");
    expect(all(fixture, '#code').length).toBe(1);
    expect(sessions.get('demo')).toBeNull();
  });

  it('goes back to the first step, with the reason, if the person is no longer approved', async () => {
    const { fixture, http } = await atCodeStep();
    type(fixture, '#code', '123456');
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/api/auth/verify-code`).flush(
      { detail: 'Your access is paused. Contact Demo Institute.' },
      { status: 403, statusText: 'Forbidden' },
    );
    await settle(fixture);

    expect(text(fixture)).toContain('Your access is paused. Contact Demo Institute.');
    expect(all(fixture, '#code').length).toBe(0);
    expect(all(fixture, '#email').length).toBe(1);
  });

  it('lets the person use a different email', async () => {
    const { fixture } = await atCodeStep();
    clickButton(fixture, 'Use a different email');
    await settle(fixture);
    expect(all(fixture, '#email').length).toBe(1);
    expect(all(fixture, '#code').length).toBe(0);
  });

  it('makes the person wait before asking for a new code, then allows it', async () => {
    // Only the countdown's interval is faked. Angular's own scheduling keeps running normally.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { fixture, http } = await atCodeStep();
    const resend = () => all<HTMLButtonElement>(fixture, 'button').find((b) => b.textContent?.includes('new code'))!;

    expect(resend().disabled).toBe(true);
    expect(resend().textContent).toContain('Send a new code in 30s');

    vi.advanceTimersByTime(31_000);
    await settle(fixture);
    expect(resend().disabled).toBe(false);

    resend().click();
    http.expectOne(`${API}/api/auth/request-code`).flush({ status: 'code_sent', message: "We've emailed you a 6-digit code." });
    await settle(fixture);
    expect(resend().disabled).toBe(true);
  });

  it('reminds the person to check spam', async () => {
    const { fixture } = await atCodeStep();
    expect(text(fixture)).toContain('Check your spam folder');
  });
});

describe('Login page: already signed in', () => {
  it('goes straight to the right home page', () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    expect(env.navigate).toHaveBeenCalledWith(['/', 'demo', 'admin', 'home'], { replaceUrl: true });
  });
});

describe('homeFor', () => {
  it('sends institute admins to the queue, the platform admin to the institutes page, and students home', () => {
    expect(homeFor({ ...sessionFor('tenant_admin').member }, 'demo')).toEqual(['/', 'demo', 'admin', 'home']);
    expect(homeFor({ ...sessionFor('student').member }, 'demo')).toEqual(['/', 'demo', 'home']);
    expect(homeFor({ ...sessionFor('platform_admin').member }, 'platform')).toEqual(['/', 'platform-admin']);
  });
});

describe('Login page: the platform\'s own login', () => {
  it('offers no registration, because the platform\'s people are set up by the owner', async () => {
    const env = setupTestBed({ tenant: false });
    env.tenants.slug.set('platform');
    env.tenants.info.set({ slug: 'platform', name: 'PragyaPrep Platform', branding: { display_name: 'PragyaPrep Platform', primary_color: '#2563eb', logo_url: null } });
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    await settle(fixture);
    expect(text(fixture)).not.toContain('New here?');

    type(fixture, '#email', 'nobody@example.com');
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    env.http.expectOne(`${API}/api/auth/request-code`).flush({ status: 'not_registered', message: "This email isn't registered with PragyaPrep Platform. Register first." });
    await settle(fixture);
    expect(text(fixture)).toContain("isn't registered");
    expect(all(fixture, '#status-message a').length).toBe(0);
  });

  it('takes a platform admin to the institutes page after signing in', async () => {
    const env = setupTestBed({ tenant: false });
    env.tenants.slug.set('platform');
    env.tenants.info.set({ slug: 'platform', name: 'PragyaPrep Platform', branding: { display_name: 'PragyaPrep Platform', primary_color: '#2563eb', logo_url: null } });
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    await settle(fixture);
    await ask(fixture, env.http, 'owner@example.com', { status: 'code_sent', message: "We've emailed you a 6-digit code." });
    type(fixture, '#code', '123456');
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    env.http.expectOne(`${API}/api/auth/verify-code`).flush(sessionFor('platform_admin', 'platform'));
    await settle(fixture);
    expect(env.navigate).toHaveBeenCalledWith(['/', 'platform-admin']);
  });
});

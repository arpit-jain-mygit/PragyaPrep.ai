import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';
import { UploadService } from '../core/upload.service';
import { PhotoPicker } from '../ui/photo-picker';
import { API, all, clickButton, el, settle, setupTestBed, text, type } from '../testing';
import { Register } from './register';

const COURSES = [
  { id: 'c1', name: 'CLAT', fee: 10000 },
  { id: 'c2', name: 'IPMAT', fee: 12500 },
];

async function open(queryParams: Record<string, string> = {}, courses: unknown = COURSES) {
  const env = setupTestBed({ queryParams });
  const fixture = TestBed.createComponent(Register);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/courses`).flush(courses as object);
  await settle(fixture);
  return { ...env, fixture };
}

function fillValidForm(fixture: ReturnType<typeof TestBed.createComponent<Register>>) {
  type(fixture, '#email', 'meera@example.com');
  type(fixture, '#first_name', 'Meera');
  type(fixture, '#last_name', 'Kapoor');
  type(fixture, '#birth_date', '2004-08-21');
  type(fixture, '#gender', 'female');
  type(fixture, '#mobile', '98765 43210');
  type(fixture, '#address', 'B-14, Sector 62');
  type(fixture, '#city', 'Noida');
  type(fixture, '#pin_code', '201309');
  el<HTMLInputElement>(fixture, '#course-c1').click();
}

describe('Register page', () => {
  it('lists the institute\'s courses by name, without fees', async () => {
    const { fixture } = await open();
    const names = all(fixture, '#courses label').map((l) => l.textContent?.trim());
    expect(names).toEqual(['CLAT', 'IPMAT']);
    expect(all(fixture, '#courses input[type=checkbox]').length).toBe(2);
  });

  it('asks for every field the institute needs', async () => {
    const { fixture } = await open();
    for (const id of ['email', 'first_name', 'last_name', 'birth_date', 'gender', 'mobile', 'address', 'city', 'pin_code', 'course-c1', 'course-c2']) {
      expect(el(fixture, `#${id}`), id).toBeTruthy();
    }
    expect(all(fixture, 'select#gender option').map((o) => o.textContent?.trim())).toEqual([
      'Choose…', 'Male', 'Female', 'Other', 'Prefer not to say',
    ]);
  });

  it('hides the WhatsApp field until "same as mobile" is unticked', async () => {
    const { fixture } = await open();
    expect(all(fixture, '#whatsapp').length).toBe(0);

    el<HTMLInputElement>(fixture, '#same').click();
    await settle(fixture);

    expect(all(fixture, '#whatsapp').length).toBe(1);
  });

  it('does not let a birth date in the future be picked', async () => {
    const { fixture } = await open();
    const max = el<HTMLInputElement>(fixture, '#birth_date').max;
    expect(max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(max <= new Date().toISOString().slice(0, 10)).toBe(true);
  });

  it('sends the form and thanks the person', async () => {
    const { fixture, http } = await open();
    fillValidForm(fixture);
    await settle(fixture);

    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    const request = http.expectOne(`${API}/api/register`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      email: 'meera@example.com', first_name: 'Meera', last_name: 'Kapoor', birth_date: '2004-08-21', gender: 'female',
      mobile: '98765 43210', whatsapp_same_as_mobile: true, city: 'Noida', pin_code: '201309', course_ids: ['c1'],
    });
    request.flush({ status: 'pending', message: "Thank you. Your registration is waiting for approval. We'll email you once it's approved." });
    await settle(fixture);

    expect(text(fixture)).toContain('Thank you, Meera!');
    expect(text(fixture)).toContain('waiting for approval');
    expect(text(fixture)).toContain('What happens next');
    expect(all(fixture, 'form').length).toBe(0);
  });

  it('shows each mistake next to its field, and a summary', async () => {
    const { fixture, http } = await open();
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/api/register`).flush(
      {
        detail: 'Please correct the marked fields.',
        errors: { email: 'Enter a valid email address.', pin_code: 'Enter a 6-digit PIN code.' },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle(fixture);

    expect(text(fixture)).toContain('Please correct the marked fields.');
    expect(text(fixture)).toContain('Enter a valid email address.');
    expect(text(fixture)).toContain('Enter a 6-digit PIN code.');
    expect(el(fixture, '#email').getAttribute('aria-invalid')).toBe('true');
    expect(el(fixture, '#pin_code').getAttribute('aria-invalid')).toBe('true');
    expect(el(fixture, '#city').getAttribute('aria-invalid')).toBeNull();
    expect(text(fixture)).not.toContain('Thank you');
  });

  it('clears the old mistakes when the form is sent again', async () => {
    const { fixture, http } = await open();
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/api/register`).flush(
      { detail: 'Please correct the marked fields.', errors: { city: 'Enter your city.' } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain('Enter your city.');

    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(text(fixture)).not.toContain('Enter your city.');
    http.expectOne(`${API}/api/register`);
  });

  it('tells someone already registered what to do, with a link to log in', async () => {
    const { fixture, http } = await open();
    type(fixture, '#email', 'meera@example.com');
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/api/register`).flush(
      { detail: 'This email is already registered. Your registration is waiting for approval.' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(fixture);

    expect(text(fixture)).toContain('This email is already registered. Your registration is waiting for approval.');
    const link = all<HTMLAnchorElement>(fixture, '#banner a')[0];
    expect(link.getAttribute('href')).toContain('/demo/login');
    expect(link.getAttribute('href')).toContain('email=meera@example.com');
  });

  it('shows a limit message as it is', async () => {
    const { fixture, http } = await open();
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/api/register`).flush(
      { detail: 'Too many registrations from this connection. Try again in 40 minutes.' },
      { status: 429, statusText: 'Too Many Requests' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain('Try again in 40 minutes.');
  });

  it('stops a second click while the first is still being sent', async () => {
    const { fixture, http } = await open();
    const form = el<HTMLFormElement>(fixture, 'form');
    form.dispatchEvent(new Event('submit'));
    form.dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/api/register`);
    await settle(fixture);
    expect(el<HTMLButtonElement>(fixture, 'button[type=submit]').disabled).toBe(true);
  });

  it('fills in the email from the link on the login page', async () => {
    const { fixture } = await open({ email: 'meera@example.com' });
    expect(el<HTMLInputElement>(fixture, '#email').value).toBe('meera@example.com');
  });

  it('says so when no courses are open, and hides the form', async () => {
    const { fixture } = await open({}, []);
    expect(text(fixture)).toContain('No courses are open for registration yet.');
    expect(all(fixture, 'form').length).toBe(0);
  });

  it('explains it when the courses cannot be loaded', async () => {
    const env = setupTestBed();
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/courses`).flush('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });
    await settle(fixture);
    expect(text(fixture)).toContain('Something went wrong on our side');
  });

  it('has the Register button', async () => {
    const { fixture } = await open();
    expect(() => clickButton(fixture, 'Register')).not.toThrow();
  });
});

describe('Register page: fixing mistakes', () => {
  it('removes a field\'s message as soon as that field is edited, and the summary when none are left', async () => {
    const { fixture, http } = await open();
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/api/register`).flush(
      { detail: 'Please correct the marked fields.', errors: { email: 'Enter a valid email address.', city: 'Enter your city.' } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain('Enter a valid email address.');
    expect(text(fixture)).toContain('Enter your city.');

    type(fixture, '#email', 'meera@example.com');
    await settle(fixture);
    expect(text(fixture)).not.toContain('Enter a valid email address.');
    expect(el(fixture, '#email').getAttribute('aria-invalid')).toBeNull();
    expect(text(fixture)).toContain('Enter your city.');
    expect(text(fixture)).toContain('Please correct the marked fields.');

    type(fixture, '#city', 'Noida');
    await settle(fixture);
    expect(text(fixture)).not.toContain('Enter your city.');
    expect(text(fixture)).not.toContain('Please correct the marked fields.');
  });

  it('clears a select\'s message when a choice is made', async () => {
    const { fixture, http } = await open();
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/api/register`).flush(
      { detail: 'Please correct the marked fields.', errors: { gender: 'Choose a gender from the list.' } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle(fixture);
    type(fixture, '#gender', 'female');
    await settle(fixture);
    expect(text(fixture)).not.toContain('Choose a gender from the list.');
  });

  it('lets a student tick several courses and sends them in the order ticked', async () => {
    const { fixture, http } = await open();
    fillValidForm(fixture);
    el<HTMLInputElement>(fixture, '#course-c2').click();
    await settle(fixture);
    expect(el<HTMLInputElement>(fixture, '#course-c1').checked).toBe(true);
    expect(el<HTMLInputElement>(fixture, '#course-c2').checked).toBe(true);
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    expect(http.expectOne(`${API}/api/register`).request.body.course_ids).toEqual(['c1', 'c2']);
  });

  it('lets a course be unticked again', async () => {
    const { fixture, http } = await open();
    fillValidForm(fixture);
    el<HTMLInputElement>(fixture, '#course-c2').click();
    el<HTMLInputElement>(fixture, '#course-c1').click();
    await settle(fixture);
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    expect(http.expectOne(`${API}/api/register`).request.body.course_ids).toEqual(['c2']);
  });

  it('shows the message next to the courses when none is ticked, and clears it when one is', async () => {
    const { fixture, http } = await open();
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    const request = http.expectOne(`${API}/api/register`);
    expect(request.request.body.course_ids).toEqual([]);
    request.flush({ detail: 'Please correct the marked fields.', errors: { course_ids: 'Choose at least one course.' } }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(el(fixture, '#courses').textContent).toContain('Choose at least one course.');
    expect(el(fixture, '#course-c1').getAttribute('aria-invalid')).toBe('true');
    el<HTMLInputElement>(fixture, '#course-c1').click();
    await settle(fixture);
    expect(el(fixture, '#courses').textContent).not.toContain('Choose at least one course.');
  });
});

describe('Register page: photo', () => {
  async function ready() {
    const env = await open();
    const send = vi.spyOn(TestBed.inject(UploadService), 'send').mockResolvedValue(undefined);
    fillValidForm(env.fixture);
    await settle(env.fixture);
    return { ...env, send };
  }

  const photoOf = (fixture: Parameters<typeof el>[0]) => (fixture.debugElement.query(By.directive(PhotoPicker)).componentInstance as PhotoPicker);
  const MADE = () => new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
  const submit = (fixture: Parameters<typeof el>[0]) => el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));

  it('has an optional photo step on the form', async () => {
    const { fixture } = await open();
    expect(all(fixture, '#photo-field app-photo-picker').length).toBe(1);
    expect(el(fixture, '#photo-field .photo-choose').textContent).toContain('Add photo');
  });

  it('registers as usual, with no photo request, when no photo was chosen', async () => {
    const { fixture, http, send } = await ready();
    submit(fixture);
    const request = http.expectOne(`${API}/api/register`);
    expect(request.request.body.photo).toBeUndefined();
    request.flush({ status: 'pending', message: 'Thank you.' });
    await settle(fixture);
    http.expectNone(`${API}/api/register/photo`);
    expect(send).not.toHaveBeenCalled();
    expect(all(fixture, '#photo-note').length).toBe(0);
  });

  it('says it has a photo, then sends it with the permission it gets back and finishes with the token', async () => {
    const { fixture, http, send } = await ready();
    photoOf(fixture).photo.emit(MADE());
    submit(fixture);
    const request = http.expectOne(`${API}/api/register`);
    expect(request.request.body.photo).toBe(true);
    const upload = { url: 'https://s3.example/upload', fields: { key: 'demo/avatars/x.jpg' } };
    request.flush({ status: 'pending', message: 'Thank you.', photo_upload: upload, photo_token: 'token-1' });
    await settle(fixture);
    expect(send).toHaveBeenCalledTimes(1);
    const [form, file] = send.mock.calls[0];
    expect(form).toEqual(upload);
    expect((file as File).name).toBe('photo.jpg');
    expect((file as File).type).toBe('image/jpeg');
    const finish = http.expectOne(`${API}/api/register/photo`);
    expect(finish.request.body).toEqual({ email: 'meera@example.com', token: 'token-1' });
    finish.flush({ ok: true });
    await settle(fixture);
    expect(text(fixture)).toContain('Thank you, Meera!');
    expect(all(fixture, '#photo-note').length).toBe(0);
  });

  it('keeps the registration and says the photo could not be uploaded when sending fails', async () => {
    const { fixture, http, send } = await ready();
    send.mockRejectedValue({ status: 0, detail: 'The upload failed.' });
    photoOf(fixture).photo.emit(MADE());
    submit(fixture);
    http.expectOne(`${API}/api/register`).flush({ status: 'pending', message: 'Thank you.', photo_upload: { url: 'u', fields: {} }, photo_token: 't' });
    await settle(fixture);
    http.expectNone(`${API}/api/register/photo`);
    expect(text(fixture)).toContain('Thank you, Meera!');
    expect(el(fixture, '#photo-note').textContent).toContain("photo couldn't be uploaded");
  });

  it('says the same when finishing is refused', async () => {
    const { fixture, http } = await ready();
    photoOf(fixture).photo.emit(MADE());
    submit(fixture);
    http.expectOne(`${API}/api/register`).flush({ status: 'pending', message: 'Thank you.', photo_upload: { url: 'u', fields: {} }, photo_token: 't' });
    await settle(fixture);
    http.expectOne(`${API}/api/register/photo`).flush({ detail: 'expired' }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('Thank you, Meera!');
    expect(all(fixture, '#photo-note').length).toBe(1);
  });

  it('sends no photo when the registration is refused', async () => {
    const { fixture, http, send } = await ready();
    photoOf(fixture).photo.emit(MADE());
    submit(fixture);
    http.expectOne(`${API}/api/register`).flush({ detail: 'Please correct the marked fields.', errors: { email: 'Enter a valid email address.' } }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(send).not.toHaveBeenCalled();
    http.expectNone(`${API}/api/register/photo`);
    expect(all(fixture, '#photo-note').length).toBe(0);
  });

  it('forgets a removed photo', async () => {
    const { fixture, http } = await ready();
    photoOf(fixture).photo.emit(MADE());
    photoOf(fixture).photo.emit(null);
    submit(fixture);
    expect(http.expectOne(`${API}/api/register`).request.body.photo).toBeUndefined();
  });
});

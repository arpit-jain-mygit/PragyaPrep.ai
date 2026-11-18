import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { MyProfilePage } from './my-profile';

const STUDENT = {
  role: 'student', email: 'asha@example.com', first_name: 'Asha', last_name: 'Rao', avatar_url: '', mobile: '', birth_date: '', target_exams: ['CLAT'], exam_date: '',
  weekly_goal_hours: 6, notify: { announcements: true, tests: true, live_classes: true }, deletion_requested: false, linked: [{ name: 'Meena Rao', email: 'mum@example.com' }],
};
const PARENT = { role: 'parent', email: 'mum@example.com', first_name: 'Meena', last_name: 'Rao', avatar_url: '', mobile: '', relation: '', summary: 'weekly', consent: false, deletion_requested: false, linked: [{ name: 'Asha Rao', email: 'asha@example.com' }] };

async function open(role: 'student' | 'parent', profile: object) {
  const env = setupTestBed();
  env.sessions.save(sessionFor(role));
  const fixture = TestBed.createComponent(MyProfilePage);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/me/profile`).flush(profile);
  await settle(fixture);
  return { ...env, fixture };
}

describe('My profile', () => {
  it('shows a student their name, exam goals and linked parent', async () => {
    const { fixture } = await open('student', STUDENT);
    expect(el(fixture, '#who').textContent).toContain('Asha Rao');
    expect(el<HTMLInputElement>(fixture, '#exams').value).toBe('CLAT');
    expect(el<HTMLInputElement>(fixture, '#goal').value).toBe('6');
    expect(el(fixture, '#linked').textContent).toContain('Meena Rao');
    expect(all(fixture, '#relation').length).toBe(0);
  });

  it('saves only the student fields, turning the exams text into a list', async () => {
    const { fixture, http } = await open('student', STUDENT);
    type(fixture, '#mobile', '9876543210');
    type(fixture, '#exams', 'CLAT, CUET ,');
    type(fixture, '#goal', '10');
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#save').click();
    const request = http.expectOne(`${API}/api/me/profile`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toMatchObject({ mobile: '9876543210', target_exams: ['CLAT', 'CUET'], weekly_goal_hours: 10, notify: { announcements: true, tests: true, live_classes: true } });
    expect('relation' in request.request.body).toBe(false);
    request.flush({ ...STUDENT, mobile: '9876543210', target_exams: ['CLAT', 'CUET'], weekly_goal_hours: 10 });
    await settle(fixture);
    expect(all(fixture, '#saved').length).toBe(1);
  });

  it('shows the server problem and no "Saved"', async () => {
    const { fixture, http } = await open('student', STUDENT);
    el<HTMLButtonElement>(fixture, '#save').click();
    http.expectOne(`${API}/api/me/profile`).flush({ detail: 'Enter a 10-digit Indian mobile number, or leave it empty.' }, { status: 422, statusText: 'Unprocessable' });
    await settle(fixture);
    expect(el(fixture, '#save-error').textContent).toContain('10-digit');
    expect(all(fixture, '#saved').length).toBe(0);
  });

  it('gives a parent relation, summary and consent instead of exam goals', async () => {
    const { fixture, http } = await open('parent', PARENT);
    expect(all(fixture, '#exams').length).toBe(0);
    expect(el(fixture, '#linked').textContent).toContain('Asha Rao');
    type(fixture, '#relation', 'Mother');
    type(fixture, '#summary', 'monthly');
    el<HTMLInputElement>(fixture, '#consent').click();
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#save').click();
    const request = http.expectOne(`${API}/api/me/profile`);
    expect(request.request.body).toEqual({ mobile: '', relation: 'Mother', summary: 'monthly', consent: true });
    request.flush({ ...PARENT, relation: 'Mother', summary: 'monthly', consent: true });
  });

  it('asks before requesting deletion, then shows it as requested', async () => {
    const { fixture, http } = await open('student', STUDENT);
    el<HTMLButtonElement>(fixture, '#delete').click();
    await settle(fixture);
    expect(text(fixture)).toContain('Nothing is deleted until they do it');
    http.expectNone(`${API}/api/me/delete-request`);
    el<HTMLButtonElement>(fixture, '#delete-yes').click();
    http.expectOne(`${API}/api/me/delete-request`).flush({ message: 'ok' });
    await settle(fixture);
    http.expectOne(`${API}/api/me/profile`).flush({ ...STUDENT, deletion_requested: true });
    await settle(fixture);
    expect(all(fixture, '#deletion-asked').length).toBe(1);
    expect(all(fixture, '#delete').length).toBe(0);
  });

  it('keeping the account closes the confirmation without asking', async () => {
    const { fixture, http } = await open('student', STUDENT);
    el<HTMLButtonElement>(fixture, '#delete').click();
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#delete-no').click();
    await settle(fixture);
    expect(all(fixture, '#delete-confirm').length).toBe(0);
    http.expectNone(`${API}/api/me/delete-request`);
  });
});

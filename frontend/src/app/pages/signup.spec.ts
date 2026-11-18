import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, settle, setupTestBed, text, type } from '../testing';
import { FreeHome } from './free-home';
import { Signup } from './signup';

const SESSION = (tenant: string, role: string) => ({ access_token: 't', expires_in: 3600, tenant, member: { email: 'a@b.co', first_name: 'Nita', last_name: 'Rao', role, status: 'approved' } });

async function open(as?: string) {
  const env = setupTestBed({ tenant: false, queryParams: as ? { as } : {} });
  const fixture = TestBed.createComponent(Signup);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Signup', () => {
  it('starts on the kind the visitor chose, and shows the institute fields only for an institute', async () => {
    const { fixture } = await open('parent');
    expect(el(fixture, '.persona-btn.on').getAttribute('data-persona')).toBe('parent');
    expect(fixture.nativeElement.querySelector('#slug')).toBeNull();
    el(fixture, '.persona-btn[data-persona="institute"]').click();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('#slug')).not.toBeNull();
    expect(text(fixture)).toContain('one student and one parent');
  });

  it('signs a student up with a code and lands on the free home', async () => {
    const { fixture, http, sessions, navigate } = await open('student');
    type(fixture, '#name', 'Kabir Shah');
    type(fixture, '#email', 'kid@example.com');
    await settle(fixture);
    el(fixture, '#send').click();
    const asked = http.expectOne(`${API}/api/public/signup/code`);
    expect(asked.request.body).toEqual({ kind: 'student', email: 'kid@example.com', name: 'Kabir Shah' });
    asked.flush({ message: 'sent' });
    await settle(fixture);
    expect(text(fixture)).toContain('kid@example.com');
    type(fixture, '#code', '123456');
    await settle(fixture);
    el(fixture, '#finish').click();
    const made = http.expectOne(`${API}/api/public/signup`);
    expect(made.request.body.code).toBe('123456');
    made.flush(SESSION('free', 'student'));
    await settle(fixture);
    expect(sessions.member('free')?.role).toBe('student');
    expect(navigate).toHaveBeenCalledWith(['/', 'free', 'home']);
  });

  it('sends the institute details and lands on the new institute\'s admin home', async () => {
    const { fixture, http, navigate } = await open('institute');
    type(fixture, '#name', 'Nita Rao');
    type(fixture, '#email', 'nita@school.example');
    type(fixture, '#institute', 'Nita Coaching');
    type(fixture, '#slug', 'Nita-Coaching');
    await settle(fixture);
    el(fixture, '#send').click();
    const asked = http.expectOne(`${API}/api/public/signup/code`);
    expect(asked.request.body).toMatchObject({ kind: 'institute', institute_name: 'Nita Coaching', slug: 'nita-coaching' });
    asked.flush({ message: 'sent' });
    await settle(fixture);
    type(fixture, '#code', '654321');
    await settle(fixture);
    el(fixture, '#finish').click();
    http.expectOne(`${API}/api/public/signup`).flush(SESSION('nita-coaching', 'tenant_admin'));
    await settle(fixture);
    expect(navigate).toHaveBeenCalledWith(['/', 'nita-coaching', 'admin', 'home']);
  });

  it('shows the problem and stays on the form when the details are refused', async () => {
    const { fixture, http } = await open('institute');
    type(fixture, '#name', 'Nita');
    type(fixture, '#email', 'nita@school.example');
    await settle(fixture);
    el(fixture, '#send').click();
    http.expectOne(`${API}/api/public/signup/code`).flush({ detail: "The short name 'x' is taken." }, { status: 422, statusText: 'Unprocessable' });
    await settle(fixture);
    expect(text(fixture)).toContain('is taken');
    expect(fixture.nativeElement.querySelector('#code')).toBeNull();
  });
});

describe('Free home', () => {
  const COURSES = [{ name: 'CAT', subjects: [{ name: 'Quant', topics: [{ title: 'Percentages', subtopics: ['Concepts', 'Practice'] }] }] }];
  const ME = { email: 'kid@example.com', first_name: 'Kabir', last_name: 'Shah', role: 'student', status: 'approved' };

  it('lets a new learner pick one course, then shows its free sub-topic and the rest locked', async () => {
    const env = setupTestBed();
    const fixture = TestBed.createComponent(FreeHome);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/auth/me`).flush(ME);
    await settle(fixture);
    env.http.expectOne(`${API}/api/free/courses`).flush({ picked: null, courses: COURSES });
    await settle(fixture);
    expect(text(fixture)).toContain('Welcome, Kabir');
    el(fixture, '[data-course="CAT"]').click();
    env.http.expectOne(`${API}/api/free/pick`).flush({ picked: 'CAT', courses: COURSES });
    await settle(fixture);
    env.http.expectOne(`${API}/api/free/sample`).flush({ sample: { course: 'CAT', subject: 'Quant', topic: 'Percentages', title: 'Concepts', note: 'Free note', links: [{ title: 'Read this', url: 'https://x.example' }], more_in_paid: 2 } });
    await settle(fixture);
    expect(el(fixture, '#free-sample').textContent).toContain('Free note');
    expect(text(fixture)).toContain('2 files in this sub-topic open on a paid plan');
    expect(all(fixture, '#locked-list li').map((li) => li.textContent!.trim())).toEqual(['Percentages: Practice']);
    expect(fixture.nativeElement.querySelector('#pick-course')).toBeNull();
  });
});

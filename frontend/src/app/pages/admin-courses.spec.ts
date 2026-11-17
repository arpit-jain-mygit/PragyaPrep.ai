import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, clickButton, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminCourses } from './admin-courses';

const PAPERS = [
  { id: 'english', name: 'English', section: 'I: Language', stream: 'All', topics: ['Grammar'] },
  { id: 'physics', name: 'Physics', section: 'II: Domain', stream: 'Science', topics: ['Optics'] },
  { id: 'quantitative-ability', name: 'Quantitative Ability', section: 'IV: Management and law entrance', stream: 'All', topics: ['Arithmetic'] },
  { id: 'logical-reasoning', name: 'Logical Reasoning', section: 'IV: Management and law entrance', stream: 'All', topics: ['Puzzles'] },
];
const CAT = { id: 'c1', name: 'CAT', fee: 10000, access: { type: 'unlimited' }, active: true, created_at: '', papers: ['quantitative-ability', 'logical-reasoning'] };
const CLAT = { id: 'c2', name: 'CLAT', fee: 12500, access: { type: 'days', days: 365 }, active: false, created_at: '', papers: [] };

async function open(courses: object[] = [CAT, CLAT]) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminCourses);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/papers`).flush(PAPERS);
  await settle(fixture);
  env.http.expectOne(`${API}/api/admin/courses`).flush(courses);
  await settle(fixture);
  return { ...env, fixture };
}

function answerReload(http: ReturnType<typeof setupTestBed>['http'], courses: object[]) {
  http.expectOne(`${API}/api/admin/courses`).flush(courses);
}

describe('Admin courses page', () => {
  it('lists every course with its access length and whether it is open, and no fee', async () => {
    const { fixture } = await open();
    const rows = all(fixture, 'tbody tr').map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('CAT');
    expect(rows[0]).not.toContain('₹');
    expect(rows[0]).toContain('Unlimited');
    expect(rows[0]).toContain('open');
    expect(rows[1]).toContain('CLAT');
    expect(rows[1]).toContain('365 days after payment');
    expect(rows[1]).toContain('hidden');
  });

  it('invites the admin to add the first course when there are none', async () => {
    const { fixture } = await open([]);
    expect(text(fixture)).toContain('No courses yet. Add the first one below.');
  });

  it('adds a course with unlimited access', async () => {
    const { fixture, http } = await open([CAT]);
    type(fixture, '#new-name', 'IPMAT');
    await settle(fixture);
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    const request = http.expectOne(`${API}/api/admin/courses`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'IPMAT', access: { type: 'unlimited' }, papers: [] });
    request.flush({ ...CAT, id: 'c3', name: 'IPMAT', fee: 9000 });
    await settle(fixture);
    answerReload(http, [CAT, { ...CAT, id: 'c3', name: 'IPMAT', fee: 9000 }]);
    await settle(fixture);

    expect(text(fixture)).toContain('Added IPMAT.');
    expect(all(fixture, 'tbody tr').length).toBe(2);
    expect(el<HTMLInputElement>(fixture, '#new-name').value).toBe('');
  });

  it('adds a course whose access lasts a number of days', async () => {
    const { fixture, http } = await open([]);
    type(fixture, '#new-name', 'CUET');
    type(fixture, '#new-type', 'days');
    await settle(fixture);
    type(fixture, '#new-days', '180');
    await settle(fixture);
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    expect(http.expectOne(`${API}/api/admin/courses`).request.body).toEqual({
      name: 'CUET', access: { type: 'days', days: 180 }, papers: [],
    });
  });

  it('adds a course whose access ends on a date', async () => {
    const { fixture, http } = await open([]);
    type(fixture, '#new-name', 'CUET');
    type(fixture, '#new-type', 'until_date');
    await settle(fixture);
    type(fixture, '#new-until', '2027-06-30');
    await settle(fixture);
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    expect(http.expectOne(`${API}/api/admin/courses`).request.body).toEqual({
      name: 'CUET', access: { type: 'until_date', until: '2027-06-30' }, papers: [],
    });
  });

  it('keeps the Add button off until there is a name, and has no fee box', async () => {
    const { fixture } = await open([]);
    const add = () => all<HTMLButtonElement>(fixture, 'button[type=submit]')[0];
    expect(add().disabled).toBe(true);
    type(fixture, '#new-name', 'CAT');
    await settle(fixture);
    expect(add().disabled).toBe(false);
    expect(all(fixture, '#new-fee').length).toBe(0);
  });

  it('shows the API\'s message when a course cannot be added', async () => {
    const { fixture, http } = await open([CAT]);
    type(fixture, '#new-name', 'cat');
    await settle(fixture);
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/api/admin/courses`).flush(
      { detail: "A course called 'cat' already exists." },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain("A course called 'cat' already exists.");
    expect(all(fixture, 'tbody tr').length).toBe(1);
  });

  it('edits a course\'s name and access length', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Edit');
    await settle(fixture);
    expect(el<HTMLInputElement>(fixture, '#name-c1').value).toBe('CAT');
    expect(all(fixture, '#fee-c1').length).toBe(0);
    expect(text(fixture)).toContain('Students who already have access keep what they have.');

    type(fixture, '#name-c1', 'CAT 2027');
    type(fixture, '#type-c1', 'days');
    await settle(fixture);
    type(fixture, '#days-c1', '90');
    await settle(fixture);
    clickButton(fixture, 'Save');
    const request = http.expectOne(`${API}/api/admin/courses/c1`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ name: 'CAT 2027', access: { type: 'days', days: 90 }, papers: ['quantitative-ability', 'logical-reasoning'] });
    request.flush({ ...CAT, name: 'CAT 2027' });
    await settle(fixture);
    answerReload(http, [{ ...CAT, name: 'CAT 2027', access: { type: 'days', days: 90 } }, CLAT]);
    await settle(fixture);

    expect(text(fixture)).toContain('Saved CAT 2027.');
    expect(all(fixture, '#name-c1').length).toBe(0);
    expect(text(fixture)).toContain('90 days after payment');
  });

  it('lets the admin cancel an edit', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Edit');
    await settle(fixture);
    clickButton(fixture, 'Cancel');
    await settle(fixture);
    expect(all(fixture, '#name-c1').length).toBe(0);
    http.expectNone(`${API}/api/admin/courses/c1`);
  });

  it('hides an open course and shows a hidden one', async () => {
    const { fixture, http } = await open();

    clickButton(fixture, 'Hide');
    const hide = http.expectOne(`${API}/api/admin/courses/c1`);
    expect(hide.request.body).toEqual({ active: false });
    hide.flush({ ...CAT, active: false });
    await settle(fixture);
    answerReload(http, [{ ...CAT, active: false }, CLAT]);
    await settle(fixture);
    expect(text(fixture)).toContain('CAT is now hidden.');

    clickButton(fixture, 'Show');
    const show = http.expectOne(`${API}/api/admin/courses/c1`);
    expect(show.request.body).toEqual({ active: true });
  });

  it('shows the message when a change is refused, and keeps the old values', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Edit');
    await settle(fixture);
    type(fixture, '#name-c1', 'CLAT');
    clickButton(fixture, 'Save');
    http.expectOne(`${API}/api/admin/courses/c1`).flush(
      { detail: "A course called 'CLAT' already exists." },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain("A course called 'CLAT' already exists.");
    expect(all(fixture, '#name-c1').length).toBe(1); // still editing, so nothing is lost
  });

  it('explains it when the courses cannot be loaded', async () => {
    const env = setupTestBed();
    const fixture = TestBed.createComponent(AdminCourses);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/admin/papers`).flush({ detail: "You don't have access to this." }, { status: 403, statusText: 'Forbidden' });
    await settle(fixture);
    expect(text(fixture)).toContain("You don't have access to this.");
  });

  it('explains it when the course list cannot be loaded', async () => {
    const env = setupTestBed();
    const fixture = TestBed.createComponent(AdminCourses);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/admin/papers`).flush(PAPERS);
    await settle(fixture);
    env.http.expectOne(`${API}/api/admin/courses`).flush({ detail: "You don't have access to this." }, { status: 403, statusText: 'Forbidden' });
    await settle(fixture);
    expect(text(fixture)).toContain("You don't have access to this.");
  });

  describe('subjects on a course', () => {
    it('shows the subjects of each course: names when there are few, a count when many, or none yet', async () => {
      const many = { ...CAT, id: 'c3', name: 'CUET', papers: ['english', 'physics', 'quantitative-ability', 'logical-reasoning', 'english2'] };
      const { fixture } = await open([CAT, CLAT, many]);
      const rows = all(fixture, 'tbody tr').map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
      expect(rows[0]).toContain('Quantitative Ability, Logical Reasoning');
      expect(rows[1]).toContain('No subjects yet');
      expect(rows[2]).toContain('5 subjects');
    });

    it('ticks the course\'s papers when editing and sends the changed list', async () => {
      const { fixture, http } = await open();
      clickButton(fixture, 'Edit');
      await settle(fixture);
      expect(el<HTMLInputElement>(fixture, '#papers-c1-quantitative-ability').checked).toBe(true);
      expect(el<HTMLInputElement>(fixture, '#papers-c1-english').checked).toBe(false);
      expect(text(fixture)).toContain('2 of 4 selected');
      el<HTMLInputElement>(fixture, '#papers-c1-english').click();
      el<HTMLInputElement>(fixture, '#papers-c1-logical-reasoning').click();
      await settle(fixture);
      expect(text(fixture)).toContain('2 of 4 selected');
      clickButton(fixture, 'Save');
      const request = http.expectOne(`${API}/api/admin/courses/c1`);
      expect(request.request.body.papers).toEqual(['quantitative-ability', 'english']);
    });

    it('groups the subjects by section and has Select all and Clear', async () => {
      const { fixture } = await open();
      clickButton(fixture, 'Edit');
      await settle(fixture);
      const editor = el(fixture, '.paper-checklist');
      expect(Array.from(editor.querySelectorAll('.paper-group legend')).map((l) => l.textContent?.trim())).toEqual([
        'I: Language', 'II: Domain', 'IV: Management and law entrance']);
      const press = (name: string) => Array.from(editor.querySelectorAll('button')).find((b) => b.textContent?.trim() === name)!.click();
      press('Select all');
      await settle(fixture);
      expect(editor.textContent).toContain('4 of 4 selected');
      press('Clear');
      await settle(fixture);
      expect(editor.textContent).toContain('0 of 4 selected');
    });

    it('ticks the usual subjects when a known course name is typed, and sends them', async () => {
      const { fixture, http } = await open([]);
      type(fixture, '#new-name', 'CAT 2027');
        el<HTMLInputElement>(fixture, '#new-name').dispatchEvent(new Event('change'));
      const ask = http.expectOne(`${API}/api/admin/course-papers/suggested?name=CAT%202027`);
      expect(ask.request.method).toBe('GET');
      ask.flush({ papers: ['quantitative-ability', 'logical-reasoning'] });
      await settle(fixture);
      expect(el<HTMLInputElement>(fixture, '#new-papers-quantitative-ability').checked).toBe(true);
      expect(text(fixture)).toContain('2 of 4 selected');
      el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
      expect(http.expectOne(`${API}/api/admin/courses`).request.body.papers).toEqual(['quantitative-ability', 'logical-reasoning']);
    });

    it('does not override subjects the admin has already ticked', async () => {
      const { fixture, http } = await open([]);
      el<HTMLInputElement>(fixture, '#new-papers-english').click();
      await settle(fixture);
      type(fixture, '#new-name', 'CAT');
      el<HTMLInputElement>(fixture, '#new-name').dispatchEvent(new Event('change'));
      await settle(fixture);
      http.expectNone((r) => r.url.includes('/course-papers/suggested'));
      expect(text(fixture)).toContain('1 of 4 selected');
    });

    it('carries on when the suggestion cannot be fetched', async () => {
      const { fixture, http } = await open([]);
      type(fixture, '#new-name', 'CAT');
      el<HTMLInputElement>(fixture, '#new-name').dispatchEvent(new Event('change'));
      http.expectOne((r) => r.url.includes('/course-papers/suggested')).flush({ detail: 'x' }, { status: 500, statusText: 'x' });
      await settle(fixture);
      expect(text(fixture)).toContain('0 of 4 selected');
      expect(all(fixture, '.alert.error').length).toBe(0);
    });
  });
});

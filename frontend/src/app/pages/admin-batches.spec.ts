import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminBatchesPage } from './admin-batches';

const COURSES = [{ id: 'c1', name: 'CAT', active: true }, { id: 'c2', name: 'CLAT', active: true }, { id: 'c3', name: 'Old', active: false }];
const STUDENTS = [
  { email: 'asha@example.com', first_name: 'Asha', last_name: 'Rao' },
  { email: 'ravi@example.com', first_name: 'Ravi', last_name: 'Kumar' },
];
const BATCH = { id: 'b1', name: 'Morning CAT', status: 'active', course_ids: ['c1'], course_names: ['CAT'], start_date: '2027-02-01', end_date: '2027-06-30', seat_limit: 30, seats_left: 29, enrolled: 1, faculty: 'Dr Rao', schedule: 'Mon to Fri, 7 to 9 am' };
const DETAIL = { ...BATCH, students: [{ email: 'asha@example.com', name: 'Asha Rao', status: 'approved' }] };

async function open(batches: object[] = [BATCH]) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminBatchesPage);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/batches`).flush(batches);
  env.http.expectOne(`${API}/api/admin/courses`).flush(COURSES);
  env.http.expectOne(`${API}/api/admin/registrations?status=approved`).flush(STUDENTS);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Batches', () => {
  it('invites the first batch when there are none', async () => {
    const { fixture } = await open([]);
    expect(el(fixture, '#no-batches').textContent).toContain('No batches yet');
  });

  it('lists each batch with its courses, dates, faculty, timetable and seats', async () => {
    const { fixture } = await open();
    const card = el(fixture, '[data-batch="Morning CAT"]').textContent!.replace(/\s+/g, ' ');
    expect(card).toContain('CAT');
    expect(card).toContain('Dr Rao');
    expect(card).toContain('Mon to Fri, 7 to 9 am');
    expect(card).toContain('1 of 30 students');
  });

  it('creates a batch from the form, offering only active courses', async () => {
    const { fixture, http } = await open([]);
    el<HTMLButtonElement>(fixture, '#new-batch').click();
    await settle(fixture);
    expect(all(fixture, '#batch-form input[type="checkbox"]').length).toBe(2);
    type(fixture, '#b-name', 'Evening CLAT');
    type(fixture, '#b-seats', '20');
    type(fixture, '#b-faculty', 'Ms Iyer');
    all<HTMLInputElement>(fixture, '#batch-form input[type="checkbox"]')[1].click();
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#batch-save').click();
    const request = http.expectOne(`${API}/api/admin/batches`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({ name: 'Evening CLAT', course_ids: ['c2'], seat_limit: 20, faculty: 'Ms Iyer' });
    request.flush({ ...BATCH, id: 'b2', name: 'Evening CLAT', course_ids: ['c2'], course_names: ['CLAT'], students: [] });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/batches`).flush([BATCH]);
    await settle(fixture);
    expect(el(fixture, '#batch-notice').textContent).toContain('Created Evening CLAT');
    expect(all(fixture, '#batch-form').length).toBe(0);
  });

  it('shows the server problem and keeps the form open', async () => {
    const { fixture, http } = await open([]);
    el<HTMLButtonElement>(fixture, '#new-batch').click();
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#batch-save').click();
    http.expectOne(`${API}/api/admin/batches`).flush({ detail: 'Choose at least one course.' }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(el(fixture, '#batch-error').textContent).toContain('at least one course');
    expect(all(fixture, '#batch-form').length).toBe(1);
  });

  it('opens a batch to show its students, and adds the chosen ones', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '[data-open="Morning CAT"]').click();
    http.expectOne(`${API}/api/admin/batches/b1`).flush(DETAIL);
    await settle(fixture);
    expect(el(fixture, '[data-student="asha@example.com"]').textContent).toContain('Asha Rao');
    const labels = all(fixture, '.pick-list label').map((l) => l.textContent!.trim());
    expect(labels.length).toBe(1);
    expect(labels[0]).toContain('Ravi Kumar');
    all<HTMLInputElement>(fixture, '.pick-list input')[0].click();
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#enrol').click();
    const request = http.expectOne(`${API}/api/admin/batches/b1/students`);
    expect(request.request.body).toEqual({ emails: ['ravi@example.com'] });
    request.flush({ ...DETAIL, enrolled: 2, students: [...DETAIL.students, { email: 'ravi@example.com', name: 'Ravi Kumar', status: 'approved' }] });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/batches`).flush([{ ...BATCH, enrolled: 2 }]);
    await settle(fixture);
    expect(text(fixture)).toContain('Added 1 to Morning CAT');
    expect(all(fixture, '[data-student]').length).toBe(2);
  });

  it('removes a student from the batch', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '[data-open="Morning CAT"]').click();
    http.expectOne(`${API}/api/admin/batches/b1`).flush(DETAIL);
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '[data-student="asha@example.com"] button[aria-label^="Remove"]').click();
    const request = http.expectOne(`${API}/api/admin/batches/b1/students/asha%40example.com`);
    expect(request.request.method).toBe('DELETE');
    request.flush({ ...DETAIL, enrolled: 0, students: [] });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/batches`).flush([{ ...BATCH, enrolled: 0 }]);
    await settle(fixture);
    expect(all(fixture, '[data-student]').length).toBe(0);
  });

  it('archives a batch and says its courses are closed', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '[data-open="Morning CAT"]').click();
    http.expectOne(`${API}/api/admin/batches/b1`).flush(DETAIL);
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#batch-archive').click();
    const request = http.expectOne(`${API}/api/admin/batches/b1`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ status: 'archived' });
    request.flush({ ...DETAIL, status: 'archived' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/batches`).flush([{ ...BATCH, status: 'archived' }]);
    await settle(fixture);
    expect(el(fixture, '#batch-notice').textContent).toContain('archived');
    expect(all(fixture, '#enrol').length).toBe(0);
  });
});

describe('Batches: quick look', () => {
  it('opens the student drawer from a name in the batch', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '[data-open="Morning CAT"]').click();
    http.expectOne(`${API}/api/admin/batches/b1`).flush(DETAIL);
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '[data-quick="asha@example.com"]').click();
    await settle(fixture);
    http.expectOne(`${API}/api/admin/students/asha%40example.com/quick`).flush({
      email: 'asha@example.com', first_name: 'Asha', last_name: 'Rao', status: 'approved', mobile: '', city: '', created_at: '', avatar_url: '',
      target_exams: [], exam_date: '', courses: [], batches: ['Morning CAT'], parents: [], deletion_requested: false,
    });
    await settle(fixture);
    expect(el(fixture, '#student-drawer').textContent).toContain('Asha Rao');
  });
});

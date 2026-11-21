import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { StudentApplications } from './student-applications';

const ROW = {
  id: 'a1', college: 'Delhi University', programme: 'B.Com (Hons)', status: 'applied', deadline: '2026-12-15',
  notes: 'Form sent', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
};

async function open(rows: object[] = [ROW]) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(StudentApplications);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/my/applications`).flush(rows);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Application tracker', () => {
  it('lists the applications with their stage, deadline and note', async () => {
    const { fixture } = await open();
    const row = el(fixture, '[data-application="a1"]');
    expect(row.textContent).toContain('Delhi University');
    expect(row.textContent).toContain('15 Dec 2026');
    expect(row.textContent).toContain('Form sent');
  });

  it('says there are no applications yet when the list is empty', async () => {
    const { fixture } = await open([]);
    expect(el(fixture, '#applications-empty').textContent).toContain('No applications yet');
    expect(all(fixture, '#applications-table').length).toBe(0);
  });

  it('adds a college and clears the form when the server accepts it', async () => {
    const { fixture, http } = await open([]);
    el<HTMLInputElement>(fixture, '#college').value = 'IIT Delhi';
    el<HTMLInputElement>(fixture, '#college').dispatchEvent(new Event('input'));
    el<HTMLInputElement>(fixture, '#programme').value = 'MBA';
    el<HTMLInputElement>(fixture, '#programme').dispatchEvent(new Event('input'));
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#add-application').click();
    const request = http.expectOne(`${API}/api/my/applications`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ college: 'IIT Delhi', programme: 'MBA', status: 'planning', deadline: null, notes: '' });
    request.flush({ ...ROW, id: 'a2', college: 'IIT Delhi', programme: 'MBA', status: 'planning', deadline: null, notes: '' });
    await settle(fixture);
    expect(el(fixture, '[data-application="a2"]').textContent).toContain('IIT Delhi');
    expect((el<HTMLInputElement>(fixture, '#college')).value).toBe('');
  });

  it('shows a refused add as a plain message and keeps what was typed', async () => {
    const { fixture, http } = await open([]);
    el<HTMLInputElement>(fixture, '#college').value = 'IIT';
    el<HTMLInputElement>(fixture, '#college').dispatchEvent(new Event('input'));
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '#add-application').click();
    http.expectOne(`${API}/api/my/applications`).flush({ detail: 'Type the programme you are applying for.' }, { status: 422, statusText: 'Unprocessable' });
    await settle(fixture);
    expect(el(fixture, '#application-error').textContent).toContain('Type the programme');
    expect((el<HTMLInputElement>(fixture, '#college')).value).toBe('IIT');
  });

  it('changes the stage of one application straight away', async () => {
    const { fixture, http } = await open();
    const stage = el<HTMLSelectElement>(fixture, '[data-application="a1"] select');
    stage.value = 'shortlisted';
    stage.dispatchEvent(new Event('change'));
    const request = http.expectOne(`${API}/api/my/applications/a1`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      college: 'Delhi University', programme: 'B.Com (Hons)', status: 'shortlisted', deadline: '2026-12-15', notes: 'Form sent',
    });
    request.flush({ ...ROW, status: 'shortlisted' });
    await settle(fixture);
    expect(el<HTMLSelectElement>(fixture, '[data-application="a1"] select').value).toBe('shortlisted');
  });

  it('removes an application from the list when the server deletes it', async () => {
    const { fixture, http } = await open();
    el<HTMLButtonElement>(fixture, '[aria-label="Delete Delhi University"]').click();
    http.expectOne(`${API}/api/my/applications/a1`).flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    expect(all(fixture, '[data-application="a1"]').length).toBe(0);
  });
});

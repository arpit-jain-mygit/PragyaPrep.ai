import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { API, all, el, settle, setupTestBed, text } from '../testing';
import { StudentDrawer } from './student-drawer';

const QUICK = {
  email: 'asha@example.com', first_name: 'Asha', last_name: 'Rao', status: 'approved', mobile: '9876543210', city: 'Noida', created_at: '2027-01-15T08:00:00+00:00', avatar_url: '',
  target_exams: ['CLAT'], exam_date: '2027-05-20', courses: [{ name: 'CAT', active: true, expires_at: null, source: 'batch' }], batches: ['Morning CAT'],
  parents: [{ name: 'Meena Rao', email: 'mum@example.com' }], deletion_requested: false,
};

async function open(reply: object | number = QUICK) {
  const env = setupTestBed();
  const fixture = TestBed.createComponent(StudentDrawer);
  fixture.componentRef.setInput('email', 'asha@example.com');
  fixture.detectChanges();
  const request = env.http.expectOne(`${API}/api/admin/students/asha%40example.com/quick`);
  if (typeof reply === 'number') request.flush({ detail: 'We could not find that student.' }, { status: reply, statusText: 'x' });
  else request.flush(reply);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Student quick look (side drawer)', () => {
  it('shows the student at a glance', async () => {
    const { fixture } = await open();
    const card = el(fixture, '#student-drawer').textContent!.replace(/\s+/g, ' ');
    for (const part of ['Asha Rao', 'asha@example.com', 'Noida', 'CLAT', 'CAT', 'from a batch', 'Morning CAT', 'Meena Rao']) expect(card).toContain(part);
    expect(all(fixture, '#quick-deletion').length).toBe(0);
  });

  it('warns when the student asked for deletion', async () => {
    const { fixture } = await open({ ...QUICK, deletion_requested: true });
    expect(el(fixture, '#quick-deletion').textContent).toContain('asked for their account to be deleted');
  });

  it('says so when the student cannot be found', async () => {
    const { fixture } = await open(404);
    expect(text(fixture)).toContain('We could not find that student');
  });

  it('closes with Escape and with the cross', async () => {
    const { fixture } = await open();
    const closed = vi.fn();
    fixture.componentInstance.close.subscribe(closed);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    el<HTMLButtonElement>(fixture, '.modal-head button').click();
    expect(closed).toHaveBeenCalledTimes(2);
  });
});

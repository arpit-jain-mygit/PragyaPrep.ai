import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminParents } from './admin-parents';

const MEENA = { email: 'meena@example.com', name: 'Meena Rao', mobile: '9876543210', children: [{ email: 'asha@example.com', name: 'Asha Rao' }, { email: 'ravi@example.com', name: 'Ravi K' }], created_at: '' };
const LIST = `${API}/api/admin/parents`;

async function open(list: object[] = [MEENA]) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminParents);
  fixture.detectChanges();
  env.http.expectOne(LIST).flush(list);
  await settle(fixture);
  return { ...env, fixture };
}

function fill(fixture: Parameters<typeof el>[0]) {
  type(fixture, '#p-first', 'Vikram');
  type(fixture, '#p-last', 'Shah');
  type(fixture, '#p-email', 'vikram@example.com');
  type(fixture, '#p-mobile', '9123456789');
  type(fixture, '#p-student', 'asha@example.com');
}

describe('Admin parents', () => {
  it('lists parents with their children', async () => {
    const { fixture } = await open();
    const row = el(fixture, '[data-parent="meena@example.com"]').textContent!.replace(/\s+/g, ' ');
    expect(row).toContain('Meena Rao');
    expect(row).toContain('9876543210');
    expect(all(fixture, '[data-child]').map((c) => c.getAttribute('data-child'))).toEqual(['asha@example.com', 'ravi@example.com']);
  });

  it('says so when there are no parents', async () => {
    const { fixture } = await open([]);
    expect(text(fixture)).toContain('No parents yet');
  });

  it('adds a parent with a child and shows the new list', async () => {
    const { fixture, http } = await open([]);
    el(fixture, '#add-parent').click();
    await settle(fixture);
    fill(fixture);
    el(fixture, '#parent-form form').dispatchEvent(new Event('submit'));
    const request = http.expectOne(LIST);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ first_name: 'Vikram', last_name: 'Shah', email: 'vikram@example.com', mobile: '9123456789', student_email: 'asha@example.com' });
    request.flush([{ ...MEENA, email: 'vikram@example.com', name: 'Vikram Shah' }], { status: 201, statusText: 'Created' });
    await settle(fixture);
    expect(all(fixture, '#parent-form').length).toBe(0);
    expect(el(fixture, '#notice').textContent).toContain('Parent added');
    expect(all(fixture, '[data-parent]').length).toBe(1);
  });

  it('shows each mistake next to its field and keeps the form', async () => {
    const { fixture, http } = await open([]);
    el(fixture, '#add-parent').click();
    await settle(fixture);
    el(fixture, '#parent-form form').dispatchEvent(new Event('submit'));
    http.expectOne(LIST).flush({ detail: 'Please correct the marked fields.', errors: { first_name: 'Enter the first name (up to 60 characters).', student_email: 'There is no student with the email x here.' } }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(el(fixture, '#parent-form').textContent).toContain('Enter the first name');
    expect(el(fixture, '#parent-form').textContent).toContain('There is no student');
    expect(el(fixture, '#p-first').getAttribute('aria-invalid')).toBe('true');
  });

  it('shows a refusal that is not about one field', async () => {
    const { fixture, http } = await open([]);
    el(fixture, '#add-parent').click();
    await settle(fixture);
    el(fixture, '#parent-form form').dispatchEvent(new Event('submit'));
    http.expectOne(LIST).flush({ detail: 'This parent is already linked to that student.' }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('already linked');
  });

  it('unlinks a child and removes a parent after asking', async () => {
    const { fixture, http } = await open();
    el(fixture, 'button[title="Unlink Ravi K"]').click();
    const unlink = http.expectOne(`${LIST}/meena%40example.com/children/ravi%40example.com`);
    expect(unlink.request.method).toBe('DELETE');
    unlink.flush([{ ...MEENA, children: [MEENA.children[0]] }]);
    await settle(fixture);
    expect(all(fixture, '[data-child]').length).toBe(1);
    el(fixture, 'button[title="Remove parent"]').click();
    await settle(fixture);
    http.expectNone(`${LIST}/meena%40example.com`);
    all(fixture, 'button').find((b) => b.textContent!.trim() === 'Yes, remove')!.click();
    http.expectOne(`${LIST}/meena%40example.com`).flush([]);
    await settle(fixture);
    expect(text(fixture)).toContain('No parents yet');
  });

  it('downloads the Excel template', async () => {
    const { fixture, http } = await open();
    const link = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValueOnce(link);
    (globalThis.URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:x');
    (globalThis.URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    el(fixture, '#parent-template').click();
    const request = http.expectOne(`${LIST}/template`);
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['x']));
    await settle(fixture);
    expect(link.download).toBe('parents-template.xlsx');
  });

  const row = (overrides: object = {}) => ({ row: 2, email: 'a@example.com', name: 'A B', children: ['asha@example.com'], status: 'ready', message: '', problems: {}, ...overrides });

  function choose(fixture: Parameters<typeof el>[0]) {
    const file = new File(['x'], 'parents.xlsx');
    const input = el<HTMLInputElement>(fixture, '#parent-sheet');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    return file;
  }

  it('checks a sheet first, names each problem by column, then adds the ready rows on confirm', async () => {
    const { fixture, http } = await open([]);
    const file = choose(fixture);
    const check = http.expectOne(`${LIST}/import?confirm=false`);
    expect(check.request.body).toBe(file);
    check.flush({
      summary: { total: 2, ready: 1, skipped: 0, errors: 1 }, confirmed: false,
      rows: [row(), row({ row: 3, email: 'bad', name: '', children: [], status: 'error', problems: { 'Student email': 'There is no student with the email ghost@example.com here.' } })],
    });
    await settle(fixture);
    expect(['#i-total', '#i-ready', '#i-skipped', '#i-errors'].map((s) => el(fixture, s).textContent!.trim())).toEqual(['2', '1', '0', '1']);
    expect(el(fixture, '[data-row="3"] [data-problem="Student email"]').textContent).toContain('ghost@example.com');
    el(fixture, '#import-confirm').click();
    http.expectOne(`${LIST}/import?confirm=true`).flush({ summary: { total: 2, ready: 1, skipped: 0, errors: 1, created: 1, linked: 0, emailed: 1 }, confirmed: true, rows: [row({ status: 'created' })] });
    await settle(fixture);
    http.expectOne(LIST).flush([MEENA]);
    await settle(fixture);
    expect(el(fixture, '#i-ready').textContent!.trim()).toBe('1');
    expect(all(fixture, '#import-confirm').length).toBe(0);
    expect(all(fixture, '[data-parent]').length).toBe(1);
    el(fixture, '#import-done').click();
    await settle(fixture);
    expect(all(fixture, '#import-panel').length).toBe(0);
  });

  it('turns the add button off when nothing is ready, and explains a refused sheet', async () => {
    const { fixture, http } = await open([]);
    choose(fixture);
    http.expectOne(`${LIST}/import?confirm=false`).flush({ summary: { total: 1, ready: 0, skipped: 0, errors: 1 }, confirmed: false, rows: [row({ status: 'error', problems: { Email: 'x' } })] });
    await settle(fixture);
    expect((el(fixture, '#import-confirm') as HTMLButtonElement).disabled).toBe(true);
    el(fixture, '#import-cancel').click();
    await settle(fixture);
    choose(fixture);
    http.expectOne(`${LIST}/import?confirm=false`).flush({ detail: "The file has no sheet called 'Parents'. Download the template and fill that in." }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain("no sheet called 'Parents'");
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { UploadService } from '../core/upload.service';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { chosen } from '../testing';
import { AdminLiveClasses } from './admin-live-classes';

const BASE = `${API}/api/admin/courses/c1/live-classes`;
const FILES = [
  { id: 'v1', course_id: 'c1', title: 'Algebra recording', kind: 'mp4', content_type: 'video/mp4', size: 5000, status: 'ready', created_at: '' },
  { id: 'p1', course_id: 'c1', title: 'Algebra slides', kind: 'pdf', content_type: 'application/pdf', size: 900, status: 'ready', created_at: '' },
  { id: 'half', course_id: 'c1', title: 'Half', kind: 'mp4', content_type: 'video/mp4', size: 10, status: 'uploading', created_at: '' },
];

const PLAN = { course: { id: 'c1', name: 'CAT' }, counts: {}, subjects: [
  { paper_id: 'quantitative-ability', name: 'Quantitative Ability', topics: [{ id: 't1', title: 'Percentages', subtopics: [{ id: 's1', title: 'Concepts' }] }, { id: 't2', title: 'Ratios', subtopics: [] }] },
  { paper_id: 'logical-reasoning', name: 'Logical Reasoning', topics: [] },
] };

function live(overrides: object = {}) {
  return { id: 'l1', paper_id: 'quantitative-ability', topic_id: 't1', subtopic_id: 's1', place: 'Quantitative Ability › Percentages › Concepts', title: 'Algebra live', held_on: '2027-02-10', held_time: '18:30', description: 'Chapter 1', status: 'draft', materials: [], ...overrides };
}

async function open(classes: object[] = [live()], files: object[] = FILES) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminLiveClasses);
  fixture.componentRef.setInput('courseId', 'c1');
  fixture.detectChanges();
  env.http.expectOne(BASE).flush(classes);
  env.http.expectOne(`${API}/api/admin/courses/c1/files`).flush(files);
  env.http.expectOne(`${API}/api/admin/courses/c1/coursework`).flush(PLAN);
  await settle(fixture);
  const send = vi.spyOn(TestBed.inject(UploadService), 'send').mockResolvedValue(undefined);
  return { ...env, fixture, send };
}

describe('Admin live classes', () => {
  it('lists the classes with date, time, files and status, and counts the uploaded recordings and PDFs', async () => {
    const { fixture } = await open([live({ materials: [{ type: 'link', url: 'https://a.com', title: '' }], status: 'published' })]);
    const row = el(fixture, '[data-class="Algebra live"]').textContent!.replace(/\s+/g, ' ');
    expect(row).toContain('10 Feb 2027');
    expect(row).toContain('18:30');
    expect(row).toContain('Chapter 1');
    expect(row).toContain('Published');
    expect(el(fixture, '[data-class="Algebra live"] [data-place]').textContent).toContain('Quantitative Ability › Percentages › Concepts');
    expect(el(fixture, '#file-count').textContent).toContain('1 recording and 1 PDF uploaded');
  });

  it('says so when there are no live classes', async () => {
    const { fixture } = await open([]);
    expect(text(fixture)).toContain('No live classes yet');
    expect(el(fixture, '#file-count').textContent).toContain('1 recording');
  });

  it('adds a class with the chosen files and a link, as a draft', async () => {
    const { fixture, http } = await open([]);
    el(fixture, '#add-class').click();
    await settle(fixture);
    type(fixture, '#lc-subject', 'quantitative-ability');
    await settle(fixture);
    expect(Array.from(el<HTMLSelectElement>(fixture, '#lc-topic').options).map((o) => o.textContent!.trim())).toEqual(['Whole subject', 'Percentages', 'Ratios']);
    expect(el<HTMLSelectElement>(fixture, '#lc-subtopic').disabled).toBe(true);
    type(fixture, '#lc-topic', 't1');
    await settle(fixture);
    expect(Array.from(el<HTMLSelectElement>(fixture, '#lc-subtopic').options).map((o) => o.textContent!.trim())).toEqual(['Whole topic', 'Concepts']);
    type(fixture, '#lc-subtopic', 's1');
    await settle(fixture);
    type(fixture, '#lc-title', 'Geometry live');
    type(fixture, '#lc-date', '2027-03-01');
    type(fixture, '#lc-time', '19:00');
    type(fixture, '#lc-desc', 'Triangles');
    const picker = el<HTMLSelectElement>(fixture, 'select[name="pick"]');
    expect(Array.from(picker.options).map((o) => o.textContent!.trim())).toEqual(['Add an uploaded file…', 'Algebra recording (Video)', 'Algebra slides (PDF)']);
    type(fixture, 'select[name="pick"]', 'v1');
    await settle(fixture);
    type(fixture, 'input[name="link"]', 'https://youtu.be/abc');
    await settle(fixture);
    el(fixture, 'button[title="Add link"]').click();
    await settle(fixture);
    expect(el(fixture, '#lc-material').textContent).toContain('Algebra recording (Video)');
    expect(Array.from(el<HTMLSelectElement>(fixture, 'select[name="pick"]').options).length).toBe(2);
    el(fixture, '#class-form form').dispatchEvent(new Event('submit'));
    const request = http.expectOne(BASE);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      paper_id: 'quantitative-ability', topic_id: 't1', subtopic_id: 's1', title: 'Geometry live', held_on: '2027-03-01', held_time: '19:00', description: 'Triangles', status: 'draft',
      materials: [{ type: 'file', file_id: 'v1' }, { type: 'link', url: 'https://youtu.be/abc', title: '' }],
    });
    request.flush([live({ title: 'Geometry live' })]);
    await settle(fixture);
    expect(all(fixture, '#class-form').length).toBe(0);
    expect(el(fixture, '#notice').textContent).toContain('Live class added.');
    expect(all(fixture, '[data-class]').length).toBe(1);
  });

  it('shows why a class was refused and keeps the form open', async () => {
    const { fixture, http } = await open([]);
    el(fixture, '#add-class').click();
    await settle(fixture);
    el(fixture, '#class-form form').dispatchEvent(new Event('submit'));
    http.expectOne(BASE).flush({ detail: 'The title must be 1 to 120 characters.' }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('The title must be 1 to 120 characters.');
    expect(all(fixture, '#class-form').length).toBe(1);
  });

  it('edits a class with its details filled in, and removes an attached file', async () => {
    const { fixture, http } = await open([live({ materials: [{ type: 'file', file_id: 'v1', title: 'Algebra recording', kind: 'mp4', size: 5000 }], status: 'published' })]);
    el(fixture, '[data-class="Algebra live"] button[title="Edit"]').click();
    await settle(fixture);
    expect(el<HTMLInputElement>(fixture, '#lc-title').value).toBe('Algebra live');
    expect(chosen(fixture, '#lc-subject')).toBe('quantitative-ability');
    expect(chosen(fixture, '#lc-subtopic')).toBe('s1');
    expect(el<HTMLInputElement>(fixture, '#lc-time').value).toBe('18:30');
    expect(el(fixture, '#lc-material').textContent).toContain('Algebra recording');
    el(fixture, '#lc-material button[title="Remove"]').click();
    await settle(fixture);
    type(fixture, '#lc-title', 'Renamed');
    el(fixture, '#class-form form').dispatchEvent(new Event('submit'));
    const request = http.expectOne(`${BASE}/l1`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body.title).toBe('Renamed');
    expect(request.request.body.materials).toEqual([]);
    request.flush([live({ title: 'Renamed' })]);
    await settle(fixture);
    expect(el(fixture, '#notice').textContent).toContain('Saved.');
  });

  it('asks before deleting a class', async () => {
    const { fixture, http } = await open();
    el(fixture, 'button[title="Delete"]').click();
    await settle(fixture);
    el(fixture, 'button[title="Keep"]').click();
    await settle(fixture);
    http.expectNone(`${BASE}/l1`);
    el(fixture, 'button[title="Delete"]').click();
    await settle(fixture);
    all(fixture, 'button').find((b) => b.textContent!.trim() === 'Yes, delete')!.click();
    const request = http.expectOne(`${BASE}/l1`);
    expect(request.request.method).toBe('DELETE');
    request.flush([]);
    await settle(fixture);
    expect(text(fixture)).toContain('No live classes yet');
  });

  it('uploads several recordings and PDFs, one after another, then shows the new count', async () => {
    const { fixture, http, send } = await open([], []);
    const input = el<HTMLInputElement>(fixture, '#live-files');
    Object.defineProperty(input, 'files', { value: [new File(['a'], 'Class 1.mp4'), new File(['b'], 'slides.pdf')], configurable: true });
    input.dispatchEvent(new Event('change'));
    for (const [name, id] of [['Class 1.mp4', 'n1'], ['slides.pdf', 'n2']]) {
      await settle(fixture);
      const start = http.expectOne(`${API}/api/admin/courses/c1/files`);
      expect(start.request.body).toEqual({ filename: name, size: 1, title: name.replace(/\.[^.]+$/, '') });
      start.flush({ file: { id, title: name }, upload: { url: 'u', fields: {} } });
      await settle(fixture);
      http.expectOne(`${API}/api/admin/courses/c1/files/${id}/complete`).flush({ id });
    }
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush(FILES);
    await settle(fixture);
    expect(send).toHaveBeenCalledTimes(2);
    expect(el(fixture, '#upload-status').textContent!.replace(/\s+/g, ' ')).toContain('2 files added');
    expect(el(fixture, '#file-count').textContent).toContain('1 recording and 1 PDF');
  });

  it('lists the files that could not be added and carries on with the rest', async () => {
    const { fixture, http } = await open([], []);
    const input = el<HTMLInputElement>(fixture, '#live-files');
    Object.defineProperty(input, 'files', { value: [new File(['a'], 'notes.txt'), new File(['b'], 'ok.mp4')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush({ detail: 'Only PDF and MP4 files can be added.' }, { status: 422, statusText: 'x' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush({ file: { id: 'n1', title: 'ok' }, upload: { url: 'u', fields: {} } });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/files/n1/complete`).flush({ id: 'n1' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush([]);
    await settle(fixture);
    expect(el(fixture, '#upload-status').textContent!.replace(/\s+/g, ' ').replace(/ ,/g, ',')).toContain('1 file added, 1 could not be added');
    expect(el(fixture, '#upload-failures').textContent).toContain('notes.txt');
    expect(el(fixture, '#upload-failures').textContent).toContain('Only PDF and MP4');
  });

  it('downloads the Excel template', async () => {
    const { fixture, http } = await open();
    const link = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValueOnce(link);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    el(fixture, '#live-template').click();
    const request = http.expectOne(`${BASE}/template`);
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['x']));
    await settle(fixture);
    expect(link.download).toBe('live-classes-template.xlsx');
  });

  function chooseSheet(fixture: Parameters<typeof el>[0]) {
    const file = new File(['x'], 'classes.xlsx');
    const input = el<HTMLInputElement>(fixture, '#live-sheet');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    return file;
  }

  const row = (overrides: object = {}) => ({ row: 2, title: 'Algebra live', held_on: '2027-02-10', files: 1, status: 'ready', message: '', problems: {}, ...overrides });

  it('checks an uploaded sheet first, naming each problem by its column, then adds the ready rows on confirm', async () => {
    const { fixture, http } = await open([]);
    const file = chooseSheet(fixture);
    const check = http.expectOne(`${BASE}/import?confirm=false`);
    expect(check.request.body).toBe(file);
    expect(check.request.headers.get('Content-Type')).toBe('application/octet-stream');
    check.flush({
      summary: { total: 3, ready: 1, skipped: 1, errors: 1 }, confirmed: false,
      rows: [row(), row({ row: 3, title: 'Old', status: 'skipped', message: 'A class with this title and date is already there, so it was left as it is.' }),
        row({ row: 4, title: 'Bad', files: 0, status: 'error', problems: { Video: "Not among this course's uploaded files: nope.mp4. Upload them on the Live classes tab first." } })],
    });
    await settle(fixture);
    expect(['#i-total', '#i-ready', '#i-skipped', '#i-errors'].map((s) => el(fixture, s).textContent!.trim())).toEqual(['3', '1', '1', '1']);
    expect(el(fixture, '[data-row="4"] [data-problem="Video"]').textContent).toContain('nope.mp4');
    expect(el(fixture, '#import-confirm').textContent!.replace(/\s+/g, ' ')).toContain('Add 1 class');
    el(fixture, '#import-confirm').click();
    const done = http.expectOne(`${BASE}/import?confirm=true`);
    done.flush({ summary: { total: 3, ready: 1, skipped: 1, errors: 1, created: 1 }, confirmed: true, rows: [row({ status: 'created' })] });
    await settle(fixture);
    http.expectOne(BASE).flush([live()]);
    await settle(fixture);
    expect(el(fixture, '#i-ready').textContent!.trim()).toBe('1');
    expect(all(fixture, '#import-confirm').length).toBe(0);
    expect(all(fixture, '[data-class]').length).toBe(1);
    el(fixture, '#import-done').click();
    await settle(fixture);
    expect(all(fixture, '#import-panel').length).toBe(0);
  });

  it('turns the add button off when no row is ready, and Cancel closes the preview', async () => {
    const { fixture, http } = await open([]);
    chooseSheet(fixture);
    http.expectOne(`${BASE}/import?confirm=false`).flush({ summary: { total: 1, ready: 0, skipped: 0, errors: 1 }, confirmed: false, rows: [row({ status: 'error', problems: { Date: 'x' } })] });
    await settle(fixture);
    expect((el(fixture, '#import-confirm') as HTMLButtonElement).disabled).toBe(true);
    el(fixture, '#import-cancel').click();
    await settle(fixture);
    expect(all(fixture, '#import-panel').length).toBe(0);
  });

  it('shows why a sheet was refused', async () => {
    const { fixture, http } = await open([]);
    chooseSheet(fixture);
    http.expectOne(`${BASE}/import?confirm=false`).flush({ detail: "The file has no sheet called 'Live classes'. Download the template and fill that in." }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain("no sheet called 'Live classes'");
    expect(all(fixture, '#import-panel').length).toBe(0);
  });
});

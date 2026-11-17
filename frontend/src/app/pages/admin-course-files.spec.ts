import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { UploadService } from '../core/upload.service';
import { API, all, clickButton, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminCourseFiles } from './admin-course-files';

const COURSE = { id: 'c1', name: 'CLAT', fee: 10000, access: { type: 'unlimited' }, active: true, created_at: '' };
const FILE = {
  id: 'f1', course_id: 'c1', title: 'Notes', kind: 'pdf', content_type: 'application/pdf', size: 2048,
  status: 'ready', created_at: '2027-01-15T08:00:00+00:00',
};

async function open(files: unknown[] = [FILE], courseId = 'c1') {
  const env = setupTestBed({ params: { id: courseId } });
  env.sessions.save(sessionFor('tenant_admin'));
  // The real service would talk to S3, so its send() is replaced by a spy that we can answer.
  const send = vi.spyOn(TestBed.inject(UploadService), 'send').mockResolvedValue(undefined);
  const fixture = TestBed.createComponent(AdminCourseFiles);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/courses`).flush([COURSE]);
  await settle(fixture);
  if (courseId === 'c1') env.http.expectOne(`${API}/api/admin/courses/c1/files`).flush(files as object[]);
  await settle(fixture);
  return { ...env, fixture, send };
}

function pick(fixture: Parameters<typeof el>[0], file: File) {
  const input = el<HTMLInputElement>(fixture, '#file');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
}

describe('Admin course files page', () => {
  it('names the course and lists its files with type, size and status', async () => {
    const { fixture } = await open();
    const content = text(fixture);
    expect(content).toContain('Files: CLAT');
    expect(content).toContain('Notes');
    expect(content).toContain('PDF');
    expect(content).toContain('2 KB');
    expect(all(fixture, '.status.ok').length).toBe(1);
  });

  it('says so when there are no files', async () => {
    const { fixture } = await open([]);
    expect(text(fixture)).toContain('No files yet.');
  });

  it('marks a file that never arrived and explains it', async () => {
    const { fixture } = await open([{ ...FILE, status: 'uploading' }]);
    expect(text(fixture)).toContain('not finished');
    expect(text(fixture)).toContain("students can't see it");
  });

  it('says when the course does not exist', async () => {
    const env = setupTestBed({ params: { id: 'nope' } });
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(AdminCourseFiles);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/admin/courses`).flush([COURSE]);
    await settle(fixture);
    expect(text(fixture)).toContain("We couldn't find that course.");
  });

  it('fills the title from the file name, but not over one already typed', async () => {
    const { fixture } = await open();
    pick(fixture, new File(['x'], 'Lecture 1.mp4'));
    await settle(fixture);
    expect(el<HTMLInputElement>(fixture, '#title').value).toBe('Lecture 1');
    type(fixture, '#title', 'My own title');
    pick(fixture, new File(['x'], 'other.mp4'));
    await settle(fixture);
    expect(el<HTMLInputElement>(fixture, '#title').value).toBe('My own title');
  });

  it('keeps Upload switched off until a file is chosen', async () => {
    const { fixture } = await open();
    expect(el<HTMLButtonElement>(fixture, 'form button[type=submit]').disabled).toBe(true);
    pick(fixture, new File(['x'], 'a.pdf'));
    await settle(fixture);
    expect(el<HTMLButtonElement>(fixture, 'form button[type=submit]').disabled).toBe(false);
  });

  it('uploads in three steps: ask, send to storage, then check', async () => {
    const { fixture, http, send } = await open();
    const file = new File(['%PDF-1.4 hello'], 'Notes 2.pdf', { type: 'application/pdf' });
    pick(fixture, file);
    await settle(fixture);
    clickButton(fixture, 'Upload');

    const ask = http.expectOne(`${API}/api/admin/courses/c1/files`);
    expect(ask.request.method).toBe('POST');
    expect(ask.request.body).toEqual({ filename: 'Notes 2.pdf', size: file.size, title: 'Notes 2' });
    const form = { url: 'https://s3.example/upload', fields: { key: 'k', policy: 'p' } };
    ask.flush({ file: { ...FILE, id: 'f2', title: 'Notes 2', status: 'uploading' }, upload: form });
    await settle(fixture);

    expect(send).toHaveBeenCalledWith(form, file, expect.any(Function));
    const done = http.expectOne(`${API}/api/admin/courses/c1/files/f2/complete`);
    done.flush({ ...FILE, id: 'f2', title: 'Notes 2' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush([FILE, { ...FILE, id: 'f2', title: 'Notes 2' }]);
    await settle(fixture);

    expect(text(fixture)).toContain('Added Notes 2.');
    expect(all(fixture, 'tbody tr').length).toBe(2);
    expect(el<HTMLInputElement>(fixture, '#title').value).toBe(''); // ready for the next file
  });

  it('shows the progress while the file goes up', async () => {
    const { fixture, http, send } = await open();
    let report: (percent: number) => void = () => undefined;
    send.mockImplementation((_form, _file, onProgress) => new Promise(() => { report = onProgress; }));
    pick(fixture, new File(['x'], 'a.pdf'));
    await settle(fixture);
    clickButton(fixture, 'Upload');
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush({ file: { ...FILE, id: 'f2' }, upload: { url: 'u', fields: {} } });
    await settle(fixture);
    report(42);
    await settle(fixture);
    expect(text(fixture)).toContain('Uploading… 42%');
    expect(el<HTMLProgressElement>(fixture, 'progress').value).toBe(42);
  });

  it("shows the API's reason when it refuses a file, and still refreshes the list", async () => {
    const { fixture, http, send } = await open();
    pick(fixture, new File(['x'], 'virus.exe'));
    await settle(fixture);
    clickButton(fixture, 'Upload');
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush({ detail: 'Only PDF and MP4 files can be added.' }, { status: 422, statusText: 'Unprocessable' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush([FILE]);
    await settle(fixture);
    expect(text(fixture)).toContain('Only PDF and MP4 files can be added.');
    expect(send).not.toHaveBeenCalled();
  });

  it('shows a failed upload to storage', async () => {
    const { fixture, http, send } = await open();
    send.mockRejectedValue({ status: 0, detail: "The upload couldn't reach the storage service." });
    pick(fixture, new File(['x'], 'a.pdf'));
    await settle(fixture);
    clickButton(fixture, 'Upload');
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush({ file: { ...FILE, id: 'f2', status: 'uploading' }, upload: { url: 'u', fields: {} } });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush([FILE, { ...FILE, id: 'f2', status: 'uploading' }]);
    await settle(fixture);
    expect(text(fixture)).toContain("couldn't reach the storage service");
    expect(text(fixture)).toContain('not finished');
  });

  it("shows the check's message when the file is not what it says", async () => {
    const { fixture, http } = await open();
    pick(fixture, new File(['x'], 'fake.pdf'));
    await settle(fixture);
    clickButton(fixture, 'Upload');
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush({ file: { ...FILE, id: 'f2' }, upload: { url: 'u', fields: {} } });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/files/f2/complete`).flush({ detail: "That isn't a real PDF file, so it was removed." }, { status: 422, statusText: 'x' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush([FILE]);
    await settle(fixture);
    expect(text(fixture)).toContain("That isn't a real PDF file");
  });

  it('asks before deleting, and deletes after a yes', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Delete');
    await settle(fixture);
    http.expectNone(`${API}/api/admin/courses/c1/files/f1`);
    clickButton(fixture, 'Yes, delete');
    const request = http.expectOne(`${API}/api/admin/courses/c1/files/f1`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush([]);
    await settle(fixture);
    expect(text(fixture)).toContain('Deleted Notes.');
    expect(text(fixture)).toContain('No files yet.');
  });

  it('keeps the file when the admin changes their mind', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Delete');
    await settle(fixture);
    clickButton(fixture, 'Keep');
    await settle(fixture);
    http.expectNone(`${API}/api/admin/courses/c1/files/f1`);
    expect(text(fixture)).toContain('Notes');
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PhotoService } from '../core/photo.service';
import { UploadService } from '../core/upload.service';
import { API, all, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { AdminImportStudents, WELCOME_CHUNK } from './admin-import-students';

const IMPORT = `${API}/api/admin/students/import`;

function row(overrides: object = {}) {
  return { row: 2, email: 'asha@example.com', name: 'Asha Rao', courses: ['CAT'], status: 'ready', message: '', problems: {}, ...overrides };
}

function preview(rows: object[], overrides: object = {}) {
  const count = (s: string) => rows.filter((r) => (r as { status: string }).status === s).length;
  return {
    summary: { total: rows.length, ready: count('ready'), skipped: count('skipped'), errors: count('error') }, rows, confirmed: false, batch: null, created: [], ...overrides,
  };
}

const MIXED = [
  row(),
  row({ row: 3, email: 'old@example.com', name: 'Old One', status: 'skipped', message: 'Already registered (pending), so left as it is.' }),
  row({ row: 4, email: 'bad', name: '', courses: [], status: 'error', problems: { Email: 'Enter a valid email address.', Mobile: 'Enter a 10-digit Indian mobile number.' } }),
  row({ row: 5, email: 'b@example.com', name: 'B C', courses: ['CAT', 'CLAT'] }),
];

async function open() {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminImportStudents);
  fixture.detectChanges();
  await settle(fixture);
  return { ...env, fixture };
}

function pick(fixture: Parameters<typeof el>[0], name = 'students.xlsx') {
  const file = new File(['x'], name);
  const input = el<HTMLInputElement>(fixture, '#file');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  return file;
}

async function previewed(rows: object[] = MIXED) {
  const env = await open();
  const file = pick(env.fixture);
  const request = env.http.expectOne(`${IMPORT}?confirm=false`);
  request.flush(preview(rows));
  await settle(env.fixture);
  return { ...env, file, request };
}

const num = (fixture: Parameters<typeof el>[0], selector: string) => el(fixture, selector).textContent!.trim();

describe('Import students page', () => {
  it('starts with a file box and a template button, and links back to Registrations', async () => {
    const { fixture } = await open();
    expect(all(fixture, '#file').length).toBe(1);
    expect(el(fixture, '#template').textContent).toContain('Template');
    expect(el(fixture, '.page-head a').getAttribute('href')).toBe('/demo/admin/registrations');
    expect(all(fixture, '#summary').length).toBe(0);
  });

  it('downloads the template as an Excel file', async () => {
    const { fixture, http } = await open();
    const link = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValueOnce(link);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    el(fixture, '#template').click();
    http.expectOne(`${API}/api/admin/students/import/template`).flush(new Blob(['x']));
    await settle(fixture);
    expect(link.download).toBe('student-import-template.xlsx');
    expect(link.click).toHaveBeenCalled();
  });

  it('sends the chosen file to be checked and shows the counts', async () => {
    const { fixture, file, request } = await previewed();
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBe(file);
    expect(request.request.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(['#s-total', '#s-ready', '#s-skipped', '#s-errors'].map((s) => num(fixture, s))).toEqual(['4', '2', '1', '1']);
  });

  it('shows the rows that need attention first, with every problem named by its column', async () => {
    const { fixture } = await previewed();
    expect(all(fixture, '[data-row]').map((r) => r.getAttribute('data-row'))).toEqual(['3', '4']);
    const bad = el(fixture, '[data-row="4"]');
    expect(bad.textContent).toContain('Problem');
    expect(bad.querySelector('[data-problem="Email"]')!.textContent).toContain('Enter a valid email address.');
    expect(bad.querySelector('[data-problem="Mobile"]')!.textContent).toContain('10-digit');
    expect(el(fixture, '[data-row="3"]').textContent).toContain('Already registered (pending)');
  });

  it('shows every row when asked', async () => {
    const { fixture } = await previewed();
    el(fixture, '#problems-only').click();
    await settle(fixture);
    expect(all(fixture, '[data-row]').length).toBe(4);
    expect(el(fixture, '[data-row="5"]').textContent).toContain('CAT, CLAT');
    expect(el(fixture, '[data-row="2"]').textContent).toContain('Ready');
  });

  it('has no filter and shows all rows when everything is ready', async () => {
    const { fixture } = await previewed([row(), row({ row: 3, email: 'b@example.com', name: 'B C' })]);
    expect(all(fixture, '#problems-only').length).toBe(0);
    expect(all(fixture, '[data-row]').length).toBe(2);
    expect(all(fixture, '#note').length).toBe(0);
  });

  it('labels the import button with how many will be created, and explains rows that will not be', async () => {
    const { fixture } = await previewed();
    expect(el(fixture, '#import').textContent!.replace(/\s+/g, ' ')).toContain('Import 2 students');
    expect(el(fixture, '#note').textContent).toContain('Rows with problems are not imported');
    const one = await previewedSingle();
    expect(one.textContent!.replace(/\s+/g, ' ')).toContain('Import 1 student');
  });

  async function previewedSingle() {
    TestBed.resetTestingModule();
    const { fixture } = await previewed([row()]);
    return el(fixture, '#import');
  }

  it('turns the import button off when no row is ready', async () => {
    const { fixture } = await previewed([row({ status: 'error', problems: { Email: 'x' } })]);
    expect((el(fixture, '#import') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows why a file was refused and shows no preview', async () => {
    const env = await open();
    pick(env.fixture);
    env.http.expectOne(`${IMPORT}?confirm=false`).flush({ detail: 'That isn\'t an Excel (.xlsx) file. Download the template and fill it in.' }, { status: 422, statusText: 'x' });
    await settle(env.fixture);
    expect(text(env.fixture)).toContain("That isn't an Excel (.xlsx) file.");
    expect(all(env.fixture, '#summary').length).toBe(0);
  });

  it('imports the ready rows, shows what was created, and emails a welcome in chunks', async () => {
    const env = await previewed();
    el(env.fixture, '#import').click();
    const request = env.http.expectOne(`${IMPORT}?confirm=true`);
    expect(request.request.body).toBeInstanceOf(File);
    const emails = Array.from({ length: 60 }, (_, i) => `s${i}@example.com`);
    request.flush({
      ...preview([row({ status: 'created' }), row({ row: 3, status: 'skipped', message: 'x' }), row({ row: 4, status: 'error', problems: { Email: 'x' } }), row({ row: 5, status: 'created' })]),
      summary: { total: 4, ready: 2, skipped: 1, errors: 1, created: 60 }, confirmed: true, batch: 'b1', created: emails,
    });
    await settle(env.fixture);
    expect(num(env.fixture, '#s-ready')).toBe('60');
    expect(el(env.fixture, '#summary').textContent).toContain('Created');
    expect(all(env.fixture, '#import').length).toBe(0);
    expect(WELCOME_CHUNK).toBe(25);
    const first = env.http.expectOne(`${API}/api/admin/students/welcome`);
    expect(first.request.body).toEqual({ emails: emails.slice(0, 25) });
    first.flush({ sent: 25, failed: 0, skipped: 0 });
    await settle(env.fixture);
    expect(el(env.fixture, '#welcome-status').textContent).toContain('25 of 60');
    const second = env.http.expectOne(`${API}/api/admin/students/welcome`);
    expect(second.request.body).toEqual({ emails: emails.slice(25, 50) });
    second.flush({ sent: 23, failed: 2, skipped: 0 });
    await settle(env.fixture);
    const third = env.http.expectOne(`${API}/api/admin/students/welcome`);
    expect(third.request.body).toEqual({ emails: emails.slice(50) });
    third.flush({ sent: 10, failed: 0, skipped: 0 });
    await settle(env.fixture);
    const status = el(env.fixture, '#welcome-status').textContent!.replace(/\s+/g, ' ');
    expect(status).toContain('58 sent');
    expect(status).toContain('2 could not be sent');
    el(env.fixture, '#problems-only').click();
    await settle(env.fixture);
    expect(el(env.fixture, '[data-row="2"]').textContent).toContain('Created');
  });

  it('counts a welcome request that fails as not sent for everyone in it', async () => {
    const env = await previewed();
    el(env.fixture, '#import').click();
    env.http.expectOne(`${IMPORT}?confirm=true`).flush({ ...preview([row({ status: 'created' }), row({ row: 5, status: 'created' })]), summary: { total: 2, ready: 2, skipped: 0, errors: 0, created: 2 }, confirmed: true, batch: 'b', created: ['a@example.com', 'b@example.com'] });
    await settle(env.fixture);
    env.http.expectOne(`${API}/api/admin/students/welcome`).flush({ detail: 'x' }, { status: 500, statusText: 'x' });
    await settle(env.fixture);
    expect(el(env.fixture, '#welcome-status').textContent!.replace(/\s+/g, ' ')).toContain('0 sent, 2 could not be sent');
  });

  it('sends no welcome emails when the tick is off, and says how many were imported', async () => {
    const env = await previewed();
    el(env.fixture, '#welcome').click();
    await settle(env.fixture);
    el(env.fixture, '#import').click();
    env.http.expectOne(`${IMPORT}?confirm=true`).flush({ ...preview([row({ status: 'created' })]), summary: { total: 1, ready: 1, skipped: 0, errors: 0, created: 1 }, confirmed: true, batch: 'b', created: ['asha@example.com'] });
    await settle(env.fixture);
    env.http.expectNone(`${API}/api/admin/students/welcome`);
    expect(el(env.fixture, '#done').textContent).toContain('Imported 1 student.');
  });

  it('keeps the preview and says why when the import fails', async () => {
    const env = await previewed();
    el(env.fixture, '#import').click();
    env.http.expectOne(`${IMPORT}?confirm=true`).flush({ detail: 'Something went wrong.' }, { status: 500, statusText: 'x' });
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('Something went wrong.');
    expect(all(env.fixture, '#import').length).toBe(1);
    expect(num(env.fixture, '#s-ready')).toBe('2');
  });

  it('starts over with another file', async () => {
    const env = await previewed();
    el(env.fixture, '#welcome').click();
    el(env.fixture, '#import').click();
    env.http.expectOne(`${IMPORT}?confirm=true`).flush({ ...preview([row({ status: 'created' })]), summary: { total: 1, ready: 1, skipped: 0, errors: 0, created: 1 }, confirmed: true, batch: 'b', created: ['asha@example.com'] });
    await settle(env.fixture);
    el(env.fixture, '#again').click();
    await settle(env.fixture);
    expect(all(env.fixture, '#summary').length).toBe(0);
    expect(all(env.fixture, '#file').length).toBe(1);
  });
});

describe('Import students: photos step', () => {
  const PHOTO = `${API}/api/admin/student-photos`;

  async function stepReady() {
    const env = await open();
    const send = vi.spyOn(TestBed.inject(UploadService), 'send').mockResolvedValue(undefined);
    const centerSquare = vi.spyOn(TestBed.inject(PhotoService), 'centerSquare').mockImplementation(async () => new Blob(['small-jpeg'], { type: 'image/jpeg' }));
    return { ...env, send, centerSquare };
  }

  function choosePhotos(fixture: Parameters<typeof el>[0], files: File[]) {
    const input = el<HTMLInputElement>(fixture, '#photos');
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  /** Answer every photo's start and finish, whatever order the three workers ask in. */
  async function answerAll(env: Awaited<ReturnType<typeof stepReady>>, names: string[], failName?: string) {
    for (let round = 0; round < 40; round++) {
      await settle(env.fixture);
      const starts = env.http.match((r) => r.url === PHOTO && r.method === 'POST');
      const finishes = env.http.match((r) => r.url.startsWith(`${PHOTO}/`) && r.url.endsWith('/complete'));
      for (const s of starts) {
        const name = (s.request.body as { filename: string }).filename;
        if (name === failName) s.flush({ detail: 'A photo can be up to 300 KB once it has been made small.' }, { status: 422, statusText: 'x' });
        else s.flush({ id: `id-${name}`, name, upload: { url: 'https://s3.example', fields: { key: `demo/avatars/${name}` } } });
      }
      for (const f of finishes) f.flush({ id: f.request.url.split('/').slice(-2)[0], name: 'x' });
      if (!starts.length && !finishes.length && env.fixture.nativeElement.querySelector('#photo-status')?.textContent.includes('ready')) break;
    }
    await settle(env.fixture);
  }

  it('has a Photos step before the Excel file, accepting pictures and a zip', async () => {
    const { fixture } = await open();
    expect(all(fixture, '#photos-step #photos').length).toBe(1);
    expect(el<HTMLInputElement>(fixture, '#photos').multiple).toBe(true);
    expect(el<HTMLInputElement>(fixture, '#photos').accept).toContain('.zip');
    expect(all(fixture, '#photo-status').length).toBe(0);
  });

  it('makes each picture a small square, sends it under its lower-case file name, and counts them', async () => {
    const env = await stepReady();
    choosePhotos(env.fixture, [new File(['a'], 'Asha.JPG'), new File(['b'], 'ravi.png'), new File(['c'], 'notes.txt')]);
    await answerAll(env, ['asha.jpg', 'ravi.png']);
    expect(env.centerSquare).toHaveBeenCalledTimes(2);
    expect(env.send).toHaveBeenCalledTimes(2);
    expect(env.send.mock.calls.map((c) => (c[1] as File).name).sort()).toEqual(['asha.jpg', 'ravi.png']);
    expect(el(env.fixture, '#photo-status').textContent!.replace(/\s+/g, ' ')).toContain('2 photos ready');
  });

  it('sends the size of the small photo, not the original', async () => {
    const env = await stepReady();
    choosePhotos(env.fixture, [new File(['a-very-long-original-file-content'], 'asha.jpg')]);
    await settle(env.fixture);
    const start = env.http.expectOne(PHOTO);
    expect(start.request.body).toEqual({ filename: 'asha.jpg', size: 'small-jpeg'.length });
    start.flush({ id: 'p1', name: 'asha.jpg', upload: { url: 'u', fields: {} } });
    await settle(env.fixture);
    env.http.expectOne(`${PHOTO}/p1/complete`).flush({ id: 'p1', name: 'asha.jpg' });
    await settle(env.fixture);
    expect(el(env.fixture, '#photo-status').textContent).toContain('1 photo ready');
  });

  it('lists the photos that could not be used and carries on with the rest', async () => {
    const env = await stepReady();
    choosePhotos(env.fixture, [new File(['a'], 'good.jpg'), new File(['b'], 'huge.jpg')]);
    await answerAll(env, ['good.jpg', 'huge.jpg'], 'huge.jpg');
    const status = el(env.fixture, '#photo-status').textContent!.replace(/\s+/g, ' ');
    expect(status).toContain('1 photo ready');
    expect(status).toContain('1 could not be used');
    expect(el(env.fixture, '#photo-failures').textContent).toContain('huge.jpg');
    expect(el(env.fixture, '#photo-failures').textContent).toContain('300 KB');
  });

  it('reports a picture that cannot be read, and a failed upload', async () => {
    const env = await stepReady();
    env.centerSquare.mockRejectedValueOnce({ status: 0, detail: "That file couldn't be read as a picture. Choose a JPG, PNG or WebP." });
    env.send.mockRejectedValueOnce({ status: 403, detail: 'The upload was refused. Please try again.' });
    choosePhotos(env.fixture, [new File(['a'], 'bad.jpg'), new File(['b'], 'refused.jpg')]);
    await answerAll(env, ['refused.jpg']);
    const failures = el(env.fixture, '#photo-failures').textContent!;
    expect(failures).toContain("couldn't be read as a picture");
    expect(failures).toContain('The upload was refused.');
  });

  it('opens a zip and takes only the pictures inside, leaving out hidden and system files', async () => {
    const env = await stepReady();
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('students/Asha.jpg', 'a');
    zip.file('students/ravi.PNG', 'b');
    zip.file('students/.hidden.jpg', 'c');
    zip.file('__MACOSX/students/._asha.jpg', 'd');
    zip.file('students/notes.txt', 'e');
    const bytes = await zip.generateAsync({ type: 'blob' });
    choosePhotos(env.fixture, [new File([bytes], 'photos.zip', { type: 'application/zip' })]);
    await new Promise((resolve) => setTimeout(resolve, 40)); // unzipping takes a few real moments
    await answerAll(env, ['asha.jpg', 'ravi.png']);
    expect(env.send.mock.calls.map((c) => (c[1] as File).name).sort()).toEqual(['asha.jpg', 'ravi.png']);
  });

  it('says when a zip cannot be opened and when there is nothing to use', async () => {
    const env = await stepReady();
    choosePhotos(env.fixture, [new File(['not a zip'], 'photos.zip')]);
    await new Promise((resolve) => setTimeout(resolve, 40));
    await settle(env.fixture);
    expect(text(env.fixture)).toContain("photos.zip couldn't be opened as a zip.");
    choosePhotos(env.fixture, [new File(['x'], 'notes.txt')]);
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('Nothing to upload');
    env.http.expectNone(PHOTO);
  });

  it('checks the Excel file again after photos are added, so photo problems clear', async () => {
    const env = await stepReady();
    pick(env.fixture);
    env.http.expectOne(`${IMPORT}?confirm=false`).flush(preview([row({ status: 'error', problems: { Photo: "The photo 'asha.jpg' wasn't uploaded. Choose it in the Photos step." } })]));
    await settle(env.fixture);
    expect(el(env.fixture, '[data-problem="Photo"]').textContent).toContain("wasn't uploaded");
    choosePhotos(env.fixture, [new File(['a'], 'asha.jpg')]);
    await answerAll(env, ['asha.jpg']);
    const again = env.http.expectOne(`${IMPORT}?confirm=false`);
    again.flush(preview([row({ photo: true })]));
    await settle(env.fixture);
    expect(all(env.fixture, '[data-problem="Photo"]').length).toBe(0);
    expect(num(env.fixture, '#s-ready')).toBe('1');
  });

  it('marks a row that has a photo', async () => {
    const env = await previewed([row({ photo: true }), row({ row: 3, email: 'b@example.com', name: 'B C' })]);
    expect(el(env.fixture, '[data-row="2"] app-icon')).not.toBeNull();
    expect(all(env.fixture, '[data-row="3"] app-icon').length).toBe(0);
  });
});

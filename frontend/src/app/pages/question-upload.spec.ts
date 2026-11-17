import { TestBed } from '@angular/core/testing';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { UploadService } from '../core/upload.service';
import { API, all, clickButton, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { QuestionUpload } from './question-upload';

const READY = [
  { row: 2, paper: 'physics', topic: 'Optics', text: 'Q one', pictures: 0 },
  { row: 3, paper: 'physics', topic: 'Optics', text: 'Q two', pictures: 0 },
];
const OK = { confirmed: false, ready: READY, problems: [], duplicates: [], imported: 0 };

type Env = ReturnType<typeof open>;

function open() {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(QuestionUpload);
  const imported: number[] = [];
  const failed: string[] = [];
  fixture.componentInstance.imported.subscribe((n) => imported.push(n));
  fixture.componentInstance.failed.subscribe((m) => failed.push(m));
  const send = vi.spyOn(TestBed.inject(UploadService), 'send').mockResolvedValue();
  fixture.detectChanges();
  return { ...env, fixture, imported, failed, send };
}

const xlsx = (name: string) => new File(['x'], name);
const png = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: 'image/png' });

async function choose(env: Env, files: File[]) {
  const input = el<HTMLInputElement>(env.fixture, '#upload-files');
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle(env.fixture);
}

async function zipOf(entries: Record<string, string | Uint8Array>, name = 'all.zip') {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  return new File([await zip.generateAsync({ type: 'blob' })], name);
}

/** Answer whatever the component has asked for so far: picture steps and Excel checks, until it goes quiet. */
async function pump(env: Env, options: { sheets?: Record<string, object>; failPictures?: string[]; badSheets?: Record<string, { detail: string }> } = {}) {
  const { http, fixture } = env;
  let n = 0;
  const seen: string[] = [];
  let quiet = 0;
  for (let i = 0; i < 400 && quiet < 25; i++) {
    await settle(fixture);
    await new Promise((resolve) => setTimeout(resolve, 8)); // unzipping and reading files take a few real moments
    let did = false;
    for (const r of http.match((q) => q.method === 'POST' && q.url === `${API}/api/admin/question-images`)) {
      const name = (r.request.body as { filename: string }).filename;
      seen.push(name);
      if (options.failPictures?.includes(name)) r.flush({ detail: 'Nope.' }, { status: 422, statusText: 'x' });
      else r.flush({ id: `p${++n}`, upload: { url: 'u', fields: {} } });
      did = true;
    }
    for (const r of http.match((q) => /question-images\/p\d+\/complete$/.test(q.url))) {
      r.flush({ id: r.request.url.split('/').slice(-2)[0], url: 'x' });
      did = true;
    }
    for (const r of http.match((q) => q.url.endsWith('import?confirm=false'))) {
      const name = (r.request.body as File).name;
      const bad = options.badSheets?.[name];
      if (bad) r.flush(bad, { status: 422, statusText: 'x' });
      else r.flush(options.sheets?.[name] ?? OK);
      did = true;
    }
    quiet = did ? 0 : quiet + 1;
  }
  await settle(fixture);
  return seen;
}

/** Answer the confirm calls, in the order they come, saying how many each file imported. */
async function pumpConfirm(env: Env, counts: Record<string, number | { detail: string }>) {
  const order: string[] = [];
  for (let i = 0; i < 100; i++) {
    await settle(env.fixture);
    const pending = env.http.match((q) => q.url.endsWith('import?confirm=true'));
    if (!pending.length) break;
    expect(pending.length).toBe(1); // one file at a time, in order
    const r = pending[0];
    const name = (r.request.body as File).name;
    order.push(name);
    const value = counts[name];
    if (typeof value === 'object') r.flush(value, { status: 500, statusText: 'x' });
    else r.flush({ confirmed: true, ready: [], problems: [], duplicates: [], imported: value });
  }
  await settle(env.fixture);
  return order;
}

describe('Question upload', () => {
  it('downloads the template', async () => {
    const { fixture, http } = open();
    const created = vi.fn(() => 'blob:x');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = created;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    clickButton(fixture, 'Download template');
    const request = http.expectOne(`${API}/api/admin/questions/template`);
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['x']));
    await settle(fixture);
    expect(created).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('takes one Excel file: checks it straight away and shows a preview without saving', async () => {
    const env = open();
    const file = xlsx('questions.xlsx');
    await choose(env, [file]);
    const request = env.http.expectOne(`${API}/api/admin/questions/import?confirm=false`);
    expect(request.request.body).toBe(file);
    request.flush(OK);
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('2 ready');
    expect(text(env.fixture)).toContain('Import 2 questions');
    env.http.expectNone(`${API}/api/admin/questions/import?confirm=true`);
  });

  it('takes several Excel files at once and shows one combined preview', async () => {
    const env = open();
    await choose(env, [xlsx('a.xlsx'), xlsx('b.xlsx'), xlsx('c.xlsx')]);
    await pump(env, {
      sheets: {
        'a.xlsx': OK,
        'b.xlsx': { ...OK, ready: [READY[0]], duplicates: [{ row: 3, text: 'dup' }] },
        'c.xlsx': { ...OK, ready: [], problems: [{ row: 5, errors: { Topic: 'Not a topic of Physics.' } }] },
      },
    });
    const page = text(env.fixture);
    expect(page).toContain('3 ready');
    expect(page).toContain('1 with problems');
    expect(page).toContain('1 already in the bank (skipped)');
    expect(page).toContain('Import 3 questions');
    expect(all(env.fixture, '#sheet-table [data-sheet]').map((r) => r.getAttribute('data-sheet'))).toEqual(['a.xlsx', 'b.xlsx', 'c.xlsx']);
    expect(el(env.fixture, '[data-sheet="b.xlsx"]').textContent).toContain('1');
  });

  it('lists each file\'s problems with their row and column', async () => {
    const env = open();
    await choose(env, [xlsx('a.xlsx')]);
    await pump(env, { sheets: { 'a.xlsx': { ...OK, ready: [READY[0]], problems: [{ row: 5, errors: { Topic: 'Not a topic of Physics.', 'Why C': 'The reason for option 3 is required.' } }] } } });
    const details = el(env.fixture, '[data-problems="a.xlsx"]').textContent!;
    expect(details).toContain('What to fix in a.xlsx');
    expect(details).toContain('Topic: Not a topic of Physics.');
    expect(details).toContain('Why C: The reason for option 3 is required.');
  });

  it('imports every file in order and reports the total', async () => {
    const env = open();
    await choose(env, [xlsx('a.xlsx'), xlsx('b.xlsx')]);
    await pump(env);
    clickButton(env.fixture, 'Import 4 questions');
    const order = await pumpConfirm(env, { 'a.xlsx': 2, 'b.xlsx': 1 });
    expect(order).toEqual(['a.xlsx', 'b.xlsx']);
    expect(env.imported).toEqual([3]); // b.xlsx skipped one as a duplicate of a.xlsx
    expect(all(env.fixture, '#upload-preview').length).toBe(0);
    expect(all(env.fixture, '#upload-files').length).toBe(1);
  });

  it('skips a file that could not be checked, shows why, and still imports the others', async () => {
    const env = open();
    await choose(env, [xlsx('a.xlsx'), xlsx('broken.xlsx')]);
    await pump(env, { badSheets: { 'broken.xlsx': { detail: "That isn't a readable Excel (.xlsx) file." } } });
    expect(el(env.fixture, '[data-sheet="broken.xlsx"]').textContent).toContain("That isn't a readable Excel");
    expect(text(env.fixture)).toContain('Import 2 questions');
    clickButton(env.fixture, 'Import 2 questions');
    expect(await pumpConfirm(env, { 'a.xlsx': 2 })).toEqual(['a.xlsx']);
    expect(env.imported).toEqual([2]);
  });

  it('tells the page which files failed to import, and still reports what was saved', async () => {
    const env = open();
    await choose(env, [xlsx('a.xlsx'), xlsx('b.xlsx')]);
    await pump(env);
    clickButton(env.fixture, 'Import 4 questions');
    await pumpConfirm(env, { 'a.xlsx': 2, 'b.xlsx': { detail: 'Server trouble.' } });
    expect(env.imported).toEqual([2]);
    expect(env.failed[0]).toContain("Some files couldn't be imported.");
    expect(env.failed[0]).toContain('b.xlsx: Server trouble.');
  });

  it('opens a zip, sends its pictures to storage and checks its Excel files, ignoring folders and computer clutter', async () => {
    const env = open();
    const zip = await zipOf({
      'batch/one.xlsx': 'x',
      'batch/two.xlsx': 'x',
      'batch/pictures/DI-S001-Q1.png': 'png1',
      'batch/pictures/DI-S001-Q2.PNG': 'png2',
      'photo.jpg': 'jpg',
      '__MACOSX/batch/._one.xlsx': 'junk',
      'batch/.DS_Store': 'junk',
      'batch/~$one.xlsx': 'lock',
      'batch/readme.txt': 'hi',
    });
    await choose(env, [zip]);
    const sent = await pump(env);
    expect(sent.sort()).toEqual(['DI-S001-Q1.png', 'DI-S001-Q2.PNG', 'photo.jpg']);
    expect(env.send).toHaveBeenCalledTimes(3);
    expect(all(env.fixture, '#sheet-table [data-sheet]').map((r) => r.getAttribute('data-sheet')).sort()).toEqual(['one.xlsx', 'two.xlsx']);
    expect(text(env.fixture)).toContain('4 ready');
  });

  it('shows picture progress and counts the pictures ready', async () => {
    const env = open();
    await choose(env, [png('a.png'), png('b.png'), png('c.png')]);
    await pump(env);
    expect(text(env.fixture)).toContain('3 pictures ready');
    expect(all(env.fixture, '#upload-files').length).toBe(1); // no Excel yet: the box stays so the Excel files can be added next
    await choose(env, [xlsx('q.xlsx')]);
    await pump(env);
    expect(text(env.fixture)).toContain('2 ready');
  });

  it('lists pictures that are too big or could not be sent, and carries on with the rest', async () => {
    const env = open();
    await choose(env, [png('big.png', 1024 * 1024 + 1), png('bad.png'), png('good.png')]);
    await pump(env, { failPictures: ['bad.png'] });
    const page = text(env.fixture);
    expect(page).toContain('1 picture ready');
    expect(page).toContain('2 not uploaded');
    expect(el(env.fixture, '[data-staged="big.png"]').textContent).toContain('up to 1 MB');
    expect(el(env.fixture, '[data-staged="bad.png"]').textContent).toContain('Nope.');
  });

  it('uses a picture name only once and says so', async () => {
    const env = open();
    const zip = await zipOf({ 'a/x.png': '1', 'b/X.png': '2' });
    await choose(env, [zip, png('y.png')]);
    const sent = await pump(env);
    expect(sent.sort()).toEqual(['x.png', 'y.png']);
    expect(text(env.fixture)).toContain('name used twice');
  });

  it('ignores files that are neither Excel nor pictures and says how many', async () => {
    const env = open();
    await choose(env, [xlsx('q.xlsx'), new File(['x'], 'notes.txt'), new File(['x'], 'doc.pdf')]);
    await pump(env);
    // The Excel file moved the page to the preview; the note is shown when no preview is open.
    clickButton(env.fixture, 'Choose other files');
    await settle(env.fixture);
    expect(text(env.fixture)).toContain('Ignored 2 files');
  });

  it('refuses a choice with nothing usable', async () => {
    const env = open();
    await choose(env, [new File(['x'], 'notes.txt')]);
    expect(text(env.fixture)).toContain('Nothing to upload');
  });

  it('refuses a zip that cannot be opened', async () => {
    const env = open();
    await choose(env, [new File(['this is not a zip'], 'broken.zip')]);
    for (let i = 0; i < 50 && !text(env.fixture).includes('broken.zip'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await settle(env.fixture);
    }
    expect(text(env.fixture)).toContain("broken.zip couldn't be opened as a zip.");
  });

  it('limits one run to 30 Excel files', async () => {
    const env = open();
    await choose(env, Array.from({ length: 31 }, (_, i) => xlsx(`f${i}.xlsx`)));
    expect(text(env.fixture)).toContain('31 Excel files');
    env.http.expectNone((r) => r.url.includes('import'));
  });

  it('Choose other files goes back to the picker', async () => {
    const env = open();
    await choose(env, [xlsx('a.xlsx')]);
    await pump(env);
    clickButton(env.fixture, 'Choose other files');
    await settle(env.fixture);
    expect(all(env.fixture, '#upload-preview').length).toBe(0);
    expect(all(env.fixture, '#upload-files').length).toBe(1);
  });

  it('throws away uploaded pictures that no question used, after the import', async () => {
    const env = open();
    await choose(env, [png('a.png'), xlsx('q.xlsx')]);
    await pump(env);
    clickButton(env.fixture, 'Import 2 questions');
    await pumpConfirm(env, { 'q.xlsx': 2 });
    const discard = env.http.expectOne(`${API}/api/admin/question-images/p1`);
    expect(discard.request.method).toBe('DELETE');
    discard.flush(null);
  });

  it('says how many new passages the files bring, and a passage problem shows on its column', async () => {
    const env = open();
    await choose(env, [xlsx('a.xlsx')]);
    await pump(env, {
      sheets: {
        'a.xlsx': {
          ...OK,
          ready: [{ ...READY[0], passage: 'Monsoon' }],
          problems: [{ row: 4, errors: { Passage: 'The passage can be at most 5000 characters.' } }],
          new_passages: 1,
        },
      },
    });
    expect(text(env.fixture)).toContain('1 new passage');
    expect(text(env.fixture)).toContain('Passage: The passage can be at most 5000 characters.');
  });
});

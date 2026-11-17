import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { UploadService } from '../core/upload.service';
import { API, all, clickButton, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { QuestionUpload } from './question-upload';

const READY = [
  { row: 2, paper: 'physics', topic: 'Optics', text: 'Q one' },
  { row: 3, paper: 'physics', topic: 'Optics', text: 'Q two' },
];

function open() {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(QuestionUpload);
  const imported: number[] = [];
  fixture.componentInstance.imported.subscribe((n) => imported.push(n));
  fixture.detectChanges();
  return { ...env, fixture, imported };
}

async function choose(fixture: ReturnType<typeof open>['fixture'], name = 'questions.xlsx') {
  const file = new File(['x'], name);
  const input = el<HTMLInputElement>(fixture, '#upload-file');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
  return file;
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

  it('checks a chosen file straight away and shows a preview without saving', async () => {
    const { fixture, http } = open();
    const file = await choose(fixture);
    const request = http.expectOne(`${API}/api/admin/questions/import?confirm=false`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBe(file);
    request.flush({ confirmed: false, ready: READY, problems: [], duplicates: [], imported: 0 });
    await settle(fixture);
    expect(text(fixture)).toContain('2 ready');
    expect(text(fixture)).toContain('Import 2 questions');
    http.expectNone(`${API}/api/admin/questions/import?confirm=true`);
  });

  it('says how many new passages the file brings, and a passage problem shows on its column', async () => {
    const { fixture, http } = open();
    await choose(fixture);
    http.expectOne(`${API}/api/admin/questions/import?confirm=false`).flush({
      confirmed: false,
      ready: [{ ...READY[0], passage: 'Monsoon' }],
      problems: [{ row: 4, errors: { Passage: "'Nowhere' isn't on the Passages sheet or in your bank." } }],
      duplicates: [],
      new_passages: 1,
      imported: 0,
    });
    await settle(fixture);
    expect(text(fixture)).toContain('1 new passage');
    expect(text(fixture)).toContain("Passage: 'Nowhere' isn't on the Passages sheet");
  });

  it('lists each problem with its row and column, and the duplicates', async () => {
    const { fixture, http } = open();
    await choose(fixture);
    http.expectOne(`${API}/api/admin/questions/import?confirm=false`).flush({
      confirmed: false,
      ready: [READY[0]],
      problems: [{ row: 5, errors: { Topic: 'Not a topic of Physics.', 'Why C': 'The reason for option 3 is required.' } }],
      duplicates: [{ row: 7, text: 'Q' }, { row: 9, text: 'Q2' }],
      imported: 0,
    });
    await settle(fixture);
    const page = text(fixture);
    expect(page).toContain('1 ready');
    expect(page).toContain('1 with problems');
    expect(page).toContain('2 already in the bank (skipped)');
    expect(all(fixture, 'tbody tr').length).toBe(1);
    expect(page).toContain('Topic: Not a topic of Physics.');
    expect(page).toContain('Why C: The reason for option 3 is required.');
    expect(page).toContain('rows 7, 9');
    expect(page).toContain('Import 1 question');
    expect(page).not.toContain('Import 1 questions');
  });

  it('imports on confirm, sends the same file, and reports how many', async () => {
    const { fixture, http, imported } = open();
    const file = await choose(fixture);
    http.expectOne(`${API}/api/admin/questions/import?confirm=false`).flush({ confirmed: false, ready: READY, problems: [], duplicates: [], imported: 0 });
    await settle(fixture);
    clickButton(fixture, 'Import 2 questions');
    const request = http.expectOne(`${API}/api/admin/questions/import?confirm=true`);
    expect(request.request.body).toBe(file);
    request.flush({ confirmed: true, ready: READY, problems: [], duplicates: [], imported: 2 });
    await settle(fixture);
    expect(imported).toEqual([2]);
    expect(all(fixture, '#upload-preview').length).toBe(0);
    expect(all(fixture, '#upload-file').length).toBe(1);
  });

  it('cannot import when nothing is ready', async () => {
    const { fixture, http } = open();
    await choose(fixture);
    http.expectOne(`${API}/api/admin/questions/import?confirm=false`).flush({
      confirmed: false, ready: [], problems: [{ row: 2, errors: { Paper: 'Paper is required.' } }], duplicates: [], imported: 0,
    });
    await settle(fixture);
    expect(el<HTMLButtonElement>(fixture, '.actions .btn').disabled).toBe(true);
  });

  it('lets the admin choose another file', async () => {
    const { fixture, http } = open();
    await choose(fixture);
    http.expectOne(`${API}/api/admin/questions/import?confirm=false`).flush({ confirmed: false, ready: READY, problems: [], duplicates: [], imported: 0 });
    await settle(fixture);
    clickButton(fixture, 'Choose another file');
    await settle(fixture);
    expect(all(fixture, '#upload-file').length).toBe(1);
    http.verify();
  });

  it('shows the server\'s message when the file cannot be read', async () => {
    const { fixture, http } = open();
    await choose(fixture);
    http.expectOne(`${API}/api/admin/questions/import?confirm=false`).flush(
      { detail: 'The column headings have changed. Download a fresh template and copy your questions into it.' },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain('The column headings have changed.');
    expect(all(fixture, '#upload-preview').length).toBe(0);
  });

  it('refuses a file that is not .xlsx without asking the server', async () => {
    const { fixture, http } = open();
    await choose(fixture, 'questions.csv');
    expect(text(fixture)).toContain('Choose an Excel file that ends in .xlsx');
    http.verify();
  });
});

describe('Question upload: pictures', () => {
  async function stageFiles(fixture: ReturnType<typeof open>['fixture'], names: string[], sizes: number[] = []) {
    const files = names.map((n, i) => new File([new Uint8Array(sizes[i] ?? 10)], n));
    const input = el<HTMLInputElement>(fixture, '#upload-pictures');
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle(fixture);
  }

  function answerPicture(http: ReturnType<typeof open>['http'], id: string) {
    http.expectOne(`${API}/api/admin/question-images`).flush({ id, upload: { url: 'u', fields: {} } }, { status: 201, statusText: 'Created' });
    return id;
  }

  it('uploads each chosen picture in three steps, one after another, and lists them as ready', async () => {
    const { fixture, http } = open();
    const send = vi.spyOn(TestBed.inject(UploadService), 'send').mockResolvedValue();
    await stageFiles(fixture, ['a.png', 'b.jpg']);
    expect(text(fixture)).toContain('a.png uploading…');
    expect(all(fixture, '[data-staged]').length).toBe(1); // one at a time: b.jpg joins the list when a.png is done

    answerPicture(http, 'p1');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/question-images/p1/complete`).flush({ id: 'p1', url: 'x' });
    await settle(fixture);
    answerPicture(http, 'p2');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/question-images/p2/complete`).flush({ id: 'p2', url: 'y' });
    await settle(fixture);

    expect(send).toHaveBeenCalledTimes(2);
    expect(all(fixture, '[data-staged] .chip').map((c) => c.textContent?.trim())).toEqual(['ready', 'ready']);
  });

  it('refuses a wrong type or an oversized picture without asking the server, and still does the others', async () => {
    const { fixture, http } = open();
    vi.spyOn(TestBed.inject(UploadService), 'send').mockResolvedValue();
    await stageFiles(fixture, ['a.gif', 'big.png', 'ok.png'], [10, 1024 * 1024 + 1, 10]);
    expect(text(fixture)).toContain('A picture must be a PNG or JPG.');
    expect(text(fixture)).toContain('A picture can be up to 1 MB.');
    answerPicture(http, 'p3');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/question-images/p3/complete`).flush({ id: 'p3', url: 'z' });
    await settle(fixture);
    http.verify();
  });

  it('shows the server\'s refusal next to the picture', async () => {
    const { fixture, http } = open();
    vi.spyOn(TestBed.inject(UploadService), 'send').mockResolvedValue();
    await stageFiles(fixture, ['fake.png']);
    answerPicture(http, 'p4');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/question-images/p4/complete`).flush(
      { detail: "That isn't a real PNG or JPG picture, so it was removed." },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain("That isn't a real PNG or JPG picture, so it was removed.");
  });

  it('removing a staged picture throws it away', async () => {
    const { fixture, http } = open();
    vi.spyOn(TestBed.inject(UploadService), 'send').mockResolvedValue();
    await stageFiles(fixture, ['a.png']);
    answerPicture(http, 'p5');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/question-images/p5/complete`).flush({ id: 'p5', url: 'x' });
    await settle(fixture);
    clickButton(fixture, 'Remove');
    const request = http.expectOne(`${API}/api/admin/question-images/p5`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    await settle(fixture);
    expect(all(fixture, '[data-staged]').length).toBe(0);
  });

  it('shows how many pictures the preview will attach', async () => {
    const { fixture, http } = open();
    await choose(fixture);
    http.expectOne(`${API}/api/admin/questions/import?confirm=false`).flush({
      confirmed: false,
      ready: [{ ...READY[0], pictures: 2 }, { ...READY[1], pictures: 1 }],
      problems: [{ row: 4, errors: { 'Image A': "The picture 'x.png' hasn't been uploaded." } }],
      duplicates: [], imported: 0,
    });
    await settle(fixture);
    expect(text(fixture)).toContain('2 ready (3 pictures)');
    expect(text(fixture)).toContain("Image A: The picture 'x.png' hasn't been uploaded.");
  });

  it('after a confirmed import, throws away the staged pictures that are left over', async () => {
    const { fixture, http } = open();
    vi.spyOn(TestBed.inject(UploadService), 'send').mockResolvedValue();
    await stageFiles(fixture, ['a.png']);
    answerPicture(http, 'p6');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/question-images/p6/complete`).flush({ id: 'p6', url: 'x' });
    await settle(fixture);
    await choose(fixture);
    http.expectOne(`${API}/api/admin/questions/import?confirm=false`).flush({ confirmed: false, ready: [{ ...READY[0], pictures: 1 }], problems: [], duplicates: [], imported: 0 });
    await settle(fixture);
    clickButton(fixture, 'Import 1 question');
    http.expectOne(`${API}/api/admin/questions/import?confirm=true`).flush({ confirmed: true, ready: [], problems: [], duplicates: [], imported: 1 });
    await settle(fixture);
    // the picture is on its question now, so the server answers 409 and nothing is lost
    const cleanup = http.expectOne(`${API}/api/admin/question-images/p6`);
    expect(cleanup.request.method).toBe('DELETE');
    cleanup.flush({ detail: 'on a question' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect(all(fixture, '[data-staged]').length).toBe(0);
  });

  it('keeps the staged pictures when the admin chooses another Excel file', async () => {
    const { fixture, http } = open();
    vi.spyOn(TestBed.inject(UploadService), 'send').mockResolvedValue();
    await stageFiles(fixture, ['a.png']);
    answerPicture(http, 'p7');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/question-images/p7/complete`).flush({ id: 'p7', url: 'x' });
    await settle(fixture);
    await choose(fixture);
    http.expectOne(`${API}/api/admin/questions/import?confirm=false`).flush({ confirmed: false, ready: READY, problems: [], duplicates: [], imported: 0 });
    await settle(fixture);
    clickButton(fixture, 'Choose another file');
    await settle(fixture);
    expect(all(fixture, '[data-staged]').length).toBe(1);
    http.verify();
  });
});

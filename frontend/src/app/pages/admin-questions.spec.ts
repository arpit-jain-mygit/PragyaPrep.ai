import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, clickButton, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminQuestions } from './admin-questions';

const PAPERS = [
  { id: 'physics', name: 'Physics', section: 'II: Domain', stream: 'Science', topics: ['Optics', 'Magnetism'] },
  { id: 'chemistry', name: 'Chemistry', section: 'II: Domain', stream: 'Science', topics: ['Solutions'] },
  { id: 'english', name: 'English', section: 'I: Language', stream: 'All', topics: ['Grammar'] },
];

const Q1 = {
  images: {},
  id: 'q1', paper: 'physics', topic: 'Optics', text: 'Which colour bends the most?',
  options: [
    { text: 'Red', why: 'Longest wavelength.' }, { text: 'Violet', why: 'Shortest wavelength.' },
    { text: 'Green', why: 'In between.' }, { text: 'Yellow', why: 'Also in between.' },
  ],
  correct: 1, difficulty: 'easy', status: 'published', created_at: '2027-01-01T00:00:00+00:00',
};

async function open(questions: object[] = [Q1]) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminQuestions);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/admin/papers`).flush(PAPERS);
  await settle(fixture);
  env.http.expectOne(`${API}/api/admin/questions`).flush(questions);
  await settle(fixture);
  return { ...env, fixture };
}

function pick(fixture: Parameters<typeof type>[0], selector: string, value: string) {
  type(fixture, selector, value);
}

async function fillForm(fixture: Parameters<typeof type>[0]) {
  pick(fixture, '#q-paper', 'physics');
  await settle(fixture);
  pick(fixture, '#q-topic', 'Magnetism');
  type(fixture, '#q-text', 'What is the SI unit of magnetic field?');
  const options = ['Tesla', 'Weber', 'Henry', 'Gauss'];
  options.forEach((name, i) => {
    type(fixture, `#q-opt-${i}`, name);
    type(fixture, `#q-why-${i}`, `Reason ${i}`);
  });
  const radio = el<HTMLInputElement>(fixture, '#q-correct-0');
  radio.click();
  await settle(fixture);
}

describe('Admin question bank page', () => {
  it('lists each question with its paper, topic, options, the correct one and the reasons', async () => {
    const { fixture } = await open();
    const card = text(fixture);
    expect(card).toContain('Which colour bends the most?');
    expect(card).toContain('Physics · Optics · easy');
    expect(card).toContain('Shortest wavelength.');
    expect(el(fixture, '.options li.correct').textContent).toContain('Violet');
    expect(card).toContain('published');
  });

  it('invites the admin to add the first question when there are none', async () => {
    const { fixture } = await open([]);
    expect(text(fixture)).toContain('No questions yet.');
  });

  it('shows papers grouped by section and topics only for the chosen paper', async () => {
    const { fixture } = await open();
    clickButton(fixture, 'Add a question');
    await settle(fixture);
    const groups = all(fixture, '#q-paper optgroup').map((g) => g.getAttribute('label'));
    expect(groups).toEqual(['II: Domain', 'I: Language']);
    expect(el<HTMLSelectElement>(fixture, '#q-topic').disabled).toBe(true);

    pick(fixture, '#q-paper', 'physics');
    await settle(fixture);
    const topics = all(fixture, '#q-topic option').map((o) => o.textContent?.trim());
    expect(topics).toEqual(['Choose a topic', 'Optics', 'Magnetism']);
  });

  it('adds a question with four options, reasons and the correct answer', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add a question');
    await settle(fixture);
    await fillForm(fixture);
    clickButton(fixture, 'Save and close');
    const request = http.expectOne(`${API}/api/admin/questions`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      paper: 'physics', topic: 'Magnetism', correct: 0, difficulty: 'medium', status: 'draft',
      text: 'What is the SI unit of magnetic field?',
    });
    expect(request.request.body.options[0]).toEqual({ text: 'Tesla', why: 'Reason 0' });
    expect(request.request.body.options.length).toBe(4);
    request.flush({ ...Q1, id: 'q2' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions`).flush([Q1]);
    await settle(fixture);
    expect(text(fixture)).toContain('Added the question.');
    expect(all(fixture, '#question-form').length).toBe(0);
  });

  it('shows the server\'s messages next to the fields and keeps what was typed', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add a question');
    await settle(fixture);
    await fillForm(fixture);
    clickButton(fixture, 'Save and close');
    http.expectOne(`${API}/api/admin/questions`).flush(
      { detail: 'Please correct the marked fields.', errors: { options: 'Two options are the same.', topic: 'Choose a topic that belongs to this paper.' } },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain('Two options are the same.');
    expect(text(fixture)).toContain('Choose a topic that belongs to this paper.');
    expect(el<HTMLTextAreaElement>(fixture, '#q-text').value).toContain('SI unit');
  });

  it('edits a question and sends it with the changes', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Edit');
    await settle(fixture);
    expect(el<HTMLTextAreaElement>(fixture, '#q-text').value).toBe(Q1.text);
    expect(el<HTMLInputElement>(fixture, '#q-correct-1').checked).toBe(true);
    type(fixture, '#q-text', 'New wording');
    clickButton(fixture, 'Save changes');
    const request = http.expectOne(`${API}/api/admin/questions/q1`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body.text).toBe('New wording');
    request.flush({ ...Q1, text: 'New wording' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions`).flush([{ ...Q1, text: 'New wording' }]);
    await settle(fixture);
    expect(text(fixture)).toContain('Saved the question.');
    expect(text(fixture)).toContain('New wording');
  });

  it('asks before deleting and then deletes', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Delete');
    await settle(fixture);
    http.expectNone(`${API}/api/admin/questions/q1`);
    clickButton(fixture, 'Yes, delete');
    const request = http.expectOne(`${API}/api/admin/questions/q1`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions`).flush([]);
    await settle(fixture);
    expect(text(fixture)).toContain('Deleted the question.');
  });

  it('keeps the question when the admin chooses Keep', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Delete');
    await settle(fixture);
    clickButton(fixture, 'Keep');
    await settle(fixture);
    http.expectNone(`${API}/api/admin/questions/q1`);
    expect(all(fixture, '[data-question]').length).toBe(1);
  });

  it('filters by paper, then topic, and asks the server', async () => {
    const { fixture, http } = await open();
    pick(fixture, '#f-paper', 'physics');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions?paper=physics`).flush([Q1]);
    await settle(fixture);
    pick(fixture, '#f-topic', 'Optics');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions?paper=physics&topic=Optics`).flush([Q1]);
    await settle(fixture);
    pick(fixture, '#f-status', 'draft');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions?paper=physics&topic=Optics&status=draft`).flush([]);
    await settle(fixture);
    expect(text(fixture)).toContain('No questions yet.');
  });

  it('cancel closes the form without saving', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Add a question');
    await settle(fixture);
    clickButton(fixture, 'Cancel');
    await settle(fixture);
    expect(all(fixture, '#question-form').length).toBe(0);
    http.verify();
  });
});

describe('Admin question bank: adding several in a row', () => {
  it('keeps the paper and topic after "Save and add another" and clears the rest', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add a question');
    await settle(fixture);
    await fillForm(fixture);
    type(fixture, '#q-difficulty', 'hard');
    type(fixture, '#q-status', 'published');
    clickButton(fixture, 'Save and add another');
    const first = http.expectOne(`${API}/api/admin/questions`);
    expect(first.request.method).toBe('POST');
    first.flush({ ...Q1, id: 'q2' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions?paper=physics&topic=Magnetism`).flush([{ ...Q1, id: 'q2', topic: 'Magnetism' }]);
    await settle(fixture);

    expect(all(fixture, '#question-form').length).toBe(1);
    expect(el<HTMLSelectElement>(fixture, '#q-paper').value).toBe('physics');
    expect(el<HTMLSelectElement>(fixture, '#q-topic').value).toBe('Magnetism');
    expect(el<HTMLSelectElement>(fixture, '#q-difficulty').value).toBe('hard');
    expect(el<HTMLSelectElement>(fixture, '#q-status').value).toBe('published');
    expect(el<HTMLTextAreaElement>(fixture, '#q-text').value).toBe('');
    expect(el<HTMLInputElement>(fixture, '#q-opt-0').value).toBe('');
    expect(el<HTMLInputElement>(fixture, '#q-correct-0').checked).toBe(false);
    expect(text(fixture)).toContain('Added question 1 in Physics · Magnetism. Add the next one.');
    expect(el(fixture, '#working-on').textContent).toContain('1 added so far');
    expect(el<HTMLSelectElement>(fixture, '#f-paper').value).toBe('physics');
    expect(el<HTMLSelectElement>(fixture, '#f-topic').value).toBe('Magnetism');
  });

  it('counts each question added in a row and then closes with Done', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add a question');
    await settle(fixture);
    for (const round of [1, 2]) {
      await fillForm(fixture);
      clickButton(fixture, 'Save and add another');
      http.expectOne(`${API}/api/admin/questions`).flush({ ...Q1, id: `n${round}` });
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions?paper=physics&topic=Magnetism`).flush([]);
      await settle(fixture);
    }
    expect(el(fixture, '#working-on').textContent).toContain('2 added so far');
    clickButton(fixture, 'Done');
    await settle(fixture);
    expect(all(fixture, '#question-form').length).toBe(0);
    http.verify();
  });

  it('keeps what was typed and stays open when the server finds a mistake', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add a question');
    await settle(fixture);
    await fillForm(fixture);
    clickButton(fixture, 'Save and add another');
    http.expectOne(`${API}/api/admin/questions`).flush(
      { detail: 'Please correct the marked fields.', errors: { text: 'The question is required.' } },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain('The question is required.');
    expect(el<HTMLInputElement>(fixture, '#q-opt-0').value).toBe('Tesla');
    expect(all(fixture, '#working-on strong').length).toBe(0);
  });

  it('"Save and close" ends the run and closes the form', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add a question');
    await settle(fixture);
    await fillForm(fixture);
    clickButton(fixture, 'Save and close');
    http.expectOne(`${API}/api/admin/questions`).flush({ ...Q1, id: 'q9' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions`).flush([Q1]);
    await settle(fixture);
    expect(all(fixture, '#question-form').length).toBe(0);
    expect(text(fixture)).toContain('Added the question.');
  });
});

describe('Admin question bank: upload from Excel', () => {
  it('shows the upload card, and a successful import says how many and reloads the list', async () => {
    const { fixture, http } = await open([]);
    expect(text(fixture)).toContain('Upload many questions');
    const upload = fixture.debugElement.query((d) => d.name === 'app-question-upload').componentInstance;
    upload.imported.emit(3);
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions`).flush([Q1]);
    await settle(fixture);
    expect(text(fixture)).toContain('Imported 3 questions.');
    expect(all(fixture, '[data-question]').length).toBe(1);
  });
});

const PIC = { id: 'p1', url: 'https://s3.example/p1' };
const PIC2 = { id: 'p2', url: 'https://s3.example/p2' };

function emitPicture(fixture: Parameters<typeof type>[0], slot: string, picture: { id: string; url: string } | null) {
  const picker = fixture.debugElement.queryAll((d) => d.name === 'app-picture-picker')
    .find((d) => d.nativeElement.querySelector(`#pic-${slot}`))!;
  picker.componentInstance.changed.emit(picture);
}

describe('Admin question bank: pictures', () => {
  it('shows a picker for the question and for each option, with an empty-text hint', async () => {
    const { fixture } = await open([]);
    clickButton(fixture, 'Add a question');
    await settle(fixture);
    const ids = all(fixture, 'app-picture-picker input[type=file]').map((i) => i.id);
    expect(ids).toEqual(['pic-question', 'pic-A', 'pic-B', 'pic-C', 'pic-D']);
    expect(text(fixture)).toContain('Leave the text empty if the option is only a picture.');
  });

  it('sends the ids of new pictures when saving, and nothing for empty slots', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add a question');
    await settle(fixture);
    await fillForm(fixture);
    emitPicture(fixture, 'question', PIC);
    emitPicture(fixture, 'B', PIC2);
    await settle(fixture);
    expect(all(fixture, 'img').length).toBe(2);
    clickButton(fixture, 'Save and close');
    const request = http.expectOne(`${API}/api/admin/questions`);
    expect(request.request.body.images).toEqual({ question: 'p1', B: 'p2' });
    expect(request.request.body.pictures).toBeUndefined();
    request.flush({ ...Q1, id: 'q2' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions`).flush([]);
  });

  it('sends no images field at all when there are no pictures', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add a question');
    await settle(fixture);
    await fillForm(fixture);
    clickButton(fixture, 'Save and close');
    expect('images' in http.expectOne(`${API}/api/admin/questions`).request.body).toBe(false);
  });

  it('sends only the changes when editing: a replaced picture, and null for a removed one', async () => {
    const withPictures = { ...Q1, images: { question: { id: 'old', url: 'https://s3.example/old' }, C: { id: 'oldc', url: 'https://s3.example/oldc' } } };
    const { fixture, http } = await open([withPictures]);
    clickButton(fixture, 'Edit');
    await settle(fixture);
    expect(all(fixture, '#question-form img').length).toBe(2);
    emitPicture(fixture, 'question', PIC);
    emitPicture(fixture, 'C', null);
    await settle(fixture);
    clickButton(fixture, 'Save changes');
    const request = http.expectOne(`${API}/api/admin/questions/q1`);
    expect(request.request.body.images).toEqual({ question: 'p1', C: null });
    request.flush({ ...Q1, id: 'q1' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions`).flush([Q1]);
  });

  it('sends no images when the pictures were not touched while editing', async () => {
    const withPictures = { ...Q1, images: { question: { id: 'old', url: 'https://s3.example/old' } } };
    const { fixture, http } = await open([withPictures]);
    clickButton(fixture, 'Edit');
    await settle(fixture);
    clickButton(fixture, 'Save changes');
    expect('images' in http.expectOne(`${API}/api/admin/questions/q1`).request.body).toBe(false);
  });

  it('throws away a picture that was uploaded and then cancelled', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add a question');
    await settle(fixture);
    emitPicture(fixture, 'question', PIC);
    await settle(fixture);
    clickButton(fixture, 'Cancel');
    const request = http.expectOne(`${API}/api/admin/question-images/p1`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });

  it('throws away a new picture that is replaced by another, but never touches a saved one', async () => {
    const saved = { ...Q1, images: { question: { id: 'old', url: 'https://s3.example/old' } } };
    const { fixture, http } = await open([saved]);
    clickButton(fixture, 'Edit');
    await settle(fixture);
    emitPicture(fixture, 'question', PIC);   // replaces the saved one: the saved one is NOT deleted from here
    http.expectNone(`${API}/api/admin/question-images/old`);
    emitPicture(fixture, 'question', PIC2);  // replaces the new one: that one is thrown away
    http.expectOne(`${API}/api/admin/question-images/p1`).flush(null);
    clickButton(fixture, 'Cancel');
    http.expectOne(`${API}/api/admin/question-images/p2`).flush(null);
    http.expectNone(`${API}/api/admin/question-images/old`);
  });

  it('shows pictures in the list, and a picture-only option', async () => {
    const q = {
      ...Q1,
      images: { question: { id: 'a', url: 'https://s3.example/a' }, B: { id: 'b', url: 'https://s3.example/b' } },
      options: [{ text: 'Red', why: 'x' }, { text: '', why: 'The second diagram.' }, { text: 'Green', why: 'z' }, { text: 'Yellow', why: 'w' }],
    };
    const { fixture } = await open([q]);
    const images = all<HTMLImageElement>(fixture, '[data-question] img').map((i) => i.getAttribute('src'));
    expect(images).toEqual(['https://s3.example/a', 'https://s3.example/b']);
    expect(text(fixture)).toContain('The second diagram.');
  });

  it('shows the server\'s picture problem and keeps the form open', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add a question');
    await settle(fixture);
    await fillForm(fixture);
    emitPicture(fixture, 'A', PIC);
    await settle(fixture);
    clickButton(fixture, 'Save and close');
    http.expectOne(`${API}/api/admin/questions`).flush(
      { detail: 'Please correct the marked fields.', errors: { images: "A picture isn't ready or is already used. Upload it again." } },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain("A picture isn't ready or is already used.");
    expect(all(fixture, '#question-form').length).toBe(1);
    expect(all(fixture, '#question-form img').length).toBe(1);
  });
});

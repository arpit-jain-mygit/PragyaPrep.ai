import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
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

const TEXT = 'The monsoon arrives in June.\n\nFarmers sow rice.';

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
  pick(fixture, '#q-subject', 'physics');
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
    expect(text(fixture)).toContain('No questions yet');
  });

  it('shows papers grouped by section and topics only for the chosen paper', async () => {
    const { fixture } = await open();
    clickButton(fixture, 'Add question');
    await settle(fixture);
    const groups = all(fixture, '#q-subject optgroup').map((g) => g.getAttribute('label'));
    expect(groups).toEqual(['II: Domain', 'I: Language']);
    expect(el<HTMLSelectElement>(fixture, '#q-topic').disabled).toBe(true);

    pick(fixture, '#q-subject', 'physics');
    await settle(fixture);
    const topics = all(fixture, '#q-topic option').map((o) => o.textContent?.trim());
    expect(topics).toEqual(['Choose a topic', 'Optics', 'Magnetism']);
  });

  it('adds a question with four options, reasons and the correct answer', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add question');
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
    clickButton(fixture, 'Add question');
    await settle(fixture);
    await fillForm(fixture);
    clickButton(fixture, 'Save and close');
    http.expectOne(`${API}/api/admin/questions`).flush(
      { detail: 'Please correct the marked fields.', errors: { options: 'Two options are the same.', topic: 'Choose a topic that belongs to this subject.' } },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain('Two options are the same.');
    expect(text(fixture)).toContain('Choose a topic that belongs to this subject.');
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
    pick(fixture, '#f-subject', 'physics');
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
    expect(text(fixture)).toContain('No questions yet');
  });

  it('cancel closes the form without saving', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Add question');
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
    clickButton(fixture, 'Add question');
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
    expect(el<HTMLSelectElement>(fixture, '#q-subject').value).toBe('physics');
    expect(el<HTMLSelectElement>(fixture, '#q-topic').value).toBe('Magnetism');
    expect(el<HTMLSelectElement>(fixture, '#q-difficulty').value).toBe('hard');
    expect(el<HTMLSelectElement>(fixture, '#q-status').value).toBe('published');
    expect(el<HTMLTextAreaElement>(fixture, '#q-text').value).toBe('');
    expect(el<HTMLInputElement>(fixture, '#q-opt-0').value).toBe('');
    expect(el<HTMLInputElement>(fixture, '#q-correct-0').checked).toBe(false);
    expect(text(fixture)).toContain('Added question 1 in Physics · Magnetism. Add the next one.');
    expect(el(fixture, '#working-on').textContent).toContain('1 added');
    expect(el<HTMLSelectElement>(fixture, '#f-subject').value).toBe('physics');
    expect(el<HTMLSelectElement>(fixture, '#f-topic').value).toBe('Magnetism');
  });

  it('counts each question added in a row and then closes with Done', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add question');
    await settle(fixture);
    for (const round of [1, 2]) {
      await fillForm(fixture);
      clickButton(fixture, 'Save and add another');
      http.expectOne(`${API}/api/admin/questions`).flush({ ...Q1, id: `n${round}` });
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions?paper=physics&topic=Magnetism`).flush([]);
      await settle(fixture);
    }
    expect(el(fixture, '#working-on').textContent).toContain('2 added');
    clickButton(fixture, 'Done');
    await settle(fixture);
    expect(all(fixture, '#question-form').length).toBe(0);
    http.verify();
  });

  it('keeps what was typed and stays open when the server finds a mistake', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add question');
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
    clickButton(fixture, 'Add question');
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
    expect(all(fixture, 'app-question-upload').length).toBe(0); // it lives in the Upload tab
    clickButton(fixture, 'Upload');
    await settle(fixture);
    expect(text(fixture)).toContain('Download template');
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
    clickButton(fixture, 'Add question');
    await settle(fixture);
    const ids = all(fixture, 'app-picture-picker input[type=file]').map((i) => i.id);
    expect(ids).toEqual(['pic-question', 'pic-A', 'pic-B', 'pic-C', 'pic-D']);
    expect(all(fixture, '[data-tip]').map((e) => e.getAttribute('data-tip')).join(' ')).toContain('Leave the text empty if the option is only a picture.');
  });

  it('sends the ids of new pictures when saving, and nothing for empty slots', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add question');
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
    clickButton(fixture, 'Add question');
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
    clickButton(fixture, 'Add question');
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
    clickButton(fixture, 'Add question');
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

describe('Admin question bank: finding questions with pictures', () => {
  it('tags questions that have a picture on the question or on any option, and only those', async () => {
    const withOne = { ...Q1, id: 'qa', images: { D: { id: 'a', url: 'https://s3.example/a' } } };
    const without = { ...Q1, id: 'qb', images: {} };
    const { fixture } = await open([withOne, without]);
    const rows = all(fixture, '[data-question]');
    expect(rows[0].querySelector('.chip.pictures')?.textContent?.trim()).toBe('pictures');
    expect(rows[1].querySelector('.chip.pictures')).toBeNull();
  });

  it('asks the server for only questions with pictures, or only without', async () => {
    const { fixture, http } = await open();
    pick(fixture, '#f-pictures', 'yes');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions?pictures=yes`).flush([]);
    await settle(fixture);
    expect(text(fixture)).toContain('No questions yet');
    pick(fixture, '#f-pictures', 'no');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions?pictures=no`).flush([Q1]);
    await settle(fixture);
    pick(fixture, '#f-pictures', '');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions`).flush([Q1]);
  });

  it('combines the pictures filter with paper and topic', async () => {
    const { fixture, http } = await open();
    pick(fixture, '#f-subject', 'physics');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions?paper=physics`).flush([Q1]);
    await settle(fixture);
    pick(fixture, '#f-pictures', 'yes');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions?paper=physics&pictures=yes`).flush([]);
  });
});

const FILL = {
  id: 'f1', kind: 'fill_in', paper: 'physics', topic: 'Optics', text: 'What is the speed of light in km/s (nearest thousand)?',
  options: [], correct: null, answer: { type: 'number', value: '300000', tolerance: '1000' },
  explanation: 'About 299,792 km/s.', difficulty: 'easy', status: 'published', created_at: '2027-01-01T00:00:00+00:00', images: {},
};

describe('Admin question bank: fill-in questions', () => {
  it('starts as multiple choice, and switching to fill-in swaps the options for an answer and an explanation', async () => {
    const { fixture } = await open([]);
    clickButton(fixture, 'Add question');
    await settle(fixture);
    expect(el<HTMLSelectElement>(fixture, '#q-kind').value).toBe('mcq');
    expect(all(fixture, '#q-opt-0').length).toBe(1);
    expect(all(fixture, '#q-answer-text').length).toBe(0);

    type(fixture, '#q-kind', 'fill_in');
    await settle(fixture);
    expect(all(fixture, '#q-opt-0').length).toBe(0);
    expect(all(fixture, 'app-picture-picker input').map((i) => i.id)).toEqual(['pic-question']);
    expect(all(fixture, '#q-answer-text').length).toBe(1);
    expect(all(fixture, '#q-explanation').length).toBe(1);
    expect(all(fixture, '[data-tip]').map((e) => e.getAttribute('data-tip')).join(' ')).toContain('separate them with |');
  });

  it('shows a number box and a tolerance when the answer is a number', async () => {
    const { fixture } = await open([]);
    clickButton(fixture, 'Add question');
    await settle(fixture);
    type(fixture, '#q-kind', 'fill_in');
    await settle(fixture);
    type(fixture, '#q-answer-type', 'number');
    await settle(fixture);
    expect(all(fixture, '#q-answer-number').length).toBe(1);
    expect(all(fixture, '#q-tolerance').length).toBe(1);
    expect(all(fixture, '#q-answer-text').length).toBe(0);
  });

  async function fillInForm(fixture: Parameters<typeof type>[0], kind: 'text' | 'number') {
    type(fixture, '#q-kind', 'fill_in');
    await settle(fixture);
    type(fixture, '#q-subject', 'physics');
    await settle(fixture);
    type(fixture, '#q-topic', 'Optics');
    type(fixture, '#q-text', 'Speed of light?');
    type(fixture, '#q-answer-type', kind);
    await settle(fixture);
    if (kind === 'text') type(fixture, '#q-answer-text', 'Mumbai | Bombay ');
    else {
      type(fixture, '#q-answer-number', '300000');
      type(fixture, '#q-tolerance', '1000');
    }
    type(fixture, '#q-explanation', 'Because.');
    await settle(fixture);
  }

  it('sends a text fill-in question with its accepted answers and no options', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add question');
    await settle(fixture);
    await fillInForm(fixture, 'text');
    clickButton(fixture, 'Save and close');
    const body = http.expectOne(`${API}/api/admin/questions`).request.body;
    expect(body).toMatchObject({ kind: 'fill_in', answer: { type: 'text', accepted: ['Mumbai ', ' Bombay '] }, explanation: 'Because.' });
    expect(body.options).toBeUndefined();
    expect(body.correct).toBeUndefined();
  });

  it('sends a number fill-in question with its tolerance', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add question');
    await settle(fixture);
    await fillInForm(fixture, 'number');
    clickButton(fixture, 'Save and close');
    expect(http.expectOne(`${API}/api/admin/questions`).request.body.answer).toEqual({ type: 'number', value: '300000', tolerance: '1000' });
  });

  it('a multiple-choice question is still sent with options and the correct number, and no answer', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add question');
    await settle(fixture);
    await fillForm(fixture);
    clickButton(fixture, 'Save and close');
    const body = http.expectOne(`${API}/api/admin/questions`).request.body;
    expect(body.kind).toBe('mcq');
    expect(body.options.length).toBe(4);
    expect(body.answer).toBeUndefined();
    expect(body.explanation).toBeUndefined();
  });

  it('shows the answer and explanation errors next to their boxes', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add question');
    await settle(fixture);
    await fillInForm(fixture, 'number');
    clickButton(fixture, 'Save and close');
    http.expectOne(`${API}/api/admin/questions`).flush(
      { detail: 'Please correct the marked fields.', errors: { answer: 'The answer must be a number.', explanation: 'The explanation is required.' } },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain('The answer must be a number.');
    expect(text(fixture)).toContain('The explanation is required.');
    expect(el<HTMLInputElement>(fixture, '#q-answer-number').value).toBe('300000');
  });

  it('lists a fill-in question with its answer, tolerance, explanation and a tag, and no options', async () => {
    const { fixture } = await open([FILL, Q1]);
    const rows = all(fixture, '[data-question]');
    expect(rows[0].textContent).toContain('fill in');
    expect(rows[0].textContent).toContain('Answer: 300000');
    expect(rows[0].textContent).toContain('within 1000');
    expect(rows[0].textContent).toContain('About 299,792 km/s.');
    expect(rows[0].querySelectorAll('.options li').length).toBe(0);
    expect(rows[1].querySelectorAll('.options li').length).toBe(4);
  });

  it('lists a text answer with all accepted spellings', async () => {
    const q = { ...FILL, id: 'f2', answer: { type: 'text', accepted: ['Mumbai', 'Bombay'] } };
    const { fixture } = await open([q]);
    expect(text(fixture)).toContain('Answer: Mumbai or Bombay');
    expect(text(fixture)).not.toContain('within');
  });

  it('opens a fill-in question for editing with its answer filled in, and sends only fill-in fields', async () => {
    const { fixture, http } = await open([FILL]);
    clickButton(fixture, 'Edit');
    await settle(fixture);
    expect(el<HTMLSelectElement>(fixture, '#q-kind').value).toBe('fill_in');
    expect(el<HTMLSelectElement>(fixture, '#q-answer-type').value).toBe('number');
    expect(el<HTMLInputElement>(fixture, '#q-answer-number').value).toBe('300000');
    expect(el<HTMLInputElement>(fixture, '#q-tolerance').value).toBe('1000');
    expect(el<HTMLTextAreaElement>(fixture, '#q-explanation').value).toBe('About 299,792 km/s.');
    clickButton(fixture, 'Save changes');
    const body = http.expectOne(`${API}/api/admin/questions/f1`).request.body;
    expect(body.kind).toBe('fill_in');
    expect(body.options).toBeUndefined();
  });

  it('filters the list by type', async () => {
    const { fixture, http } = await open();
    type(fixture, '#f-kind', 'fill_in');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions?kind=fill_in`).flush([FILL]);
    await settle(fixture);
    expect(all(fixture, '[data-question]').length).toBe(1);
  });

  it('keeps the type and answer kind for the next question after Save and add another', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add question');
    await settle(fixture);
    await fillInForm(fixture, 'number');
    clickButton(fixture, 'Save and add another');
    http.expectOne(`${API}/api/admin/questions`).flush({ ...FILL, id: 'n1' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/questions?paper=physics&topic=Optics`).flush([]);
    await settle(fixture);
    expect(el<HTMLSelectElement>(fixture, '#q-kind').value).toBe('fill_in');
    expect(el<HTMLSelectElement>(fixture, '#q-answer-type').value).toBe('number');
    expect(el<HTMLInputElement>(fixture, '#q-answer-number').value).toBe('');
    expect(el<HTMLTextAreaElement>(fixture, '#q-explanation').value).toBe('');
  });

  it('switching to fill-in drops any option pictures already chosen', async () => {
    const { fixture, http } = await open([]);
    clickButton(fixture, 'Add question');
    await settle(fixture);
    emitPicture(fixture, 'B', { id: 'pb', url: 'https://s3.example/pb' });
    await settle(fixture);
    type(fixture, '#q-kind', 'fill_in');
    await settle(fixture);
    http.expectOne(`${API}/api/admin/question-images/pb`).flush(null);
    expect(all(fixture, '#question-form img').length).toBe(0);
  });

  describe('publishing many at once', () => {
    const Q2 = { ...Q1, id: 'q2', text: 'Second question', status: 'draft' };
    const Q3 = { ...Q1, id: 'q3', text: 'Third question', status: 'draft' };

    it('shows no bulk buttons until something is ticked', async () => {
      const { fixture } = await open([Q1, Q2, Q3]);
      expect(text(fixture)).toContain('Select all 3');
      expect(text(fixture)).not.toContain('Publish selected');
    });

    it('publishes only the ticked questions and shows the fresh list', async () => {
      const { fixture, http } = await open([Q1, Q2, Q3]);
      el<HTMLInputElement>(fixture, '[data-question="q2"] .pick').click();
      el<HTMLInputElement>(fixture, '[data-question="q3"] .pick').click();
      await settle(fixture);
      expect(text(fixture)).toContain('2 selected');
      clickButton(fixture, 'Publish selected');
      const request = http.expectOne(`${API}/api/admin/questions/status`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ ids: ['q2', 'q3'], status: 'published' });
      request.flush({ changed: 2, unchanged: 0, missing: 0 });
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions`).flush([Q1, { ...Q2, status: 'published' }, { ...Q3, status: 'published' }]);
      await settle(fixture);
      expect(text(fixture)).toContain('Published 2 questions.');
      expect(text(fixture)).not.toContain('selected');
    });

    it('ticks everything shown with Select all, and mentions the ones already published', async () => {
      const { fixture, http } = await open([Q1, Q2]);
      el<HTMLInputElement>(fixture, '#select-all').click();
      await settle(fixture);
      expect(text(fixture)).toContain('2 selected');
      clickButton(fixture, 'Publish selected');
      http.expectOne(`${API}/api/admin/questions/status`).flush({ changed: 1, unchanged: 1, missing: 0 });
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions`).flush([Q1, Q2]);
      await settle(fixture);
      expect(text(fixture)).toContain('Published 1 question. 1 already published.');
    });

    it('can move the ticked questions back to draft', async () => {
      const { fixture, http } = await open([Q1]);
      el<HTMLInputElement>(fixture, '[data-question="q1"] .pick').click();
      await settle(fixture);
      clickButton(fixture, 'Move to draft');
      const request = http.expectOne(`${API}/api/admin/questions/status`);
      expect(request.request.body).toEqual({ ids: ['q1'], status: 'draft' });
      request.flush({ changed: 1, unchanged: 0, missing: 0 });
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions`).flush([{ ...Q1, status: 'draft' }]);
      await settle(fixture);
      expect(text(fixture)).toContain('Moved to draft: 1 question.');
    });

    it('Clear unticks everything and changing a filter drops the ticks', async () => {
      const { fixture, http } = await open([Q1, Q2]);
      el<HTMLInputElement>(fixture, '#select-all').click();
      await settle(fixture);
      clickButton(fixture, 'Clear');
      await settle(fixture);
      expect(text(fixture)).not.toContain('selected');

      el<HTMLInputElement>(fixture, '[data-question="q1"] .pick').click();
      await settle(fixture);
      pick(fixture, '#f-status', 'draft');
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions?status=draft`).flush([Q2]);
      await settle(fixture);
      expect(text(fixture)).not.toContain('selected');
    });

    it('shows the problem and keeps the list when the change fails', async () => {
      const { fixture, http } = await open([Q2]);
      el<HTMLInputElement>(fixture, '[data-question="q2"] .pick').click();
      await settle(fixture);
      clickButton(fixture, 'Publish selected');
      http.expectOne(`${API}/api/admin/questions/status`).flush({ detail: 'Nope.' }, { status: 422, statusText: 'x' });
      await settle(fixture);
      expect(text(fixture)).toContain('Second question');
      expect(text(fixture)).toContain('Nope.');
    });
  });

  describe('deleting many at once', () => {
    const Q2 = { ...Q1, id: 'q2', text: 'Second question', status: 'draft' };
    const Q3 = { ...Q1, id: 'q3', text: 'Third question', status: 'draft' };

    async function tick(fixture: Parameters<typeof type>[0], ...ids: string[]) {
      for (const id of ids) el<HTMLInputElement>(fixture, `[data-question="${id}"] .pick`).click();
      await settle(fixture);
    }

    it('asks for the word DELETE and keeps the button off until it is typed exactly', async () => {
      const { fixture, http } = await open([Q1, Q2, Q3]);
      await tick(fixture, 'q2', 'q3');
      clickButton(fixture, 'Delete selected');
      await settle(fixture);
      expect(text(fixture)).toContain('Delete 2 questions for good?');
      const go = () => el<HTMLButtonElement>(fixture, '#bulk-delete-go');
      expect(go().disabled).toBe(true);
      for (const wrong of ['delete', 'DELET', 'DELETE ']) {
        type(fixture, '#bulk-confirm', wrong);
        await settle(fixture);
        expect(go().disabled).toBe(true);
      }
      go().click();
      http.expectNone(`${API}/api/admin/questions/delete`);
    });

    it('deletes the ticked questions once DELETE is typed and shows the fresh list', async () => {
      const { fixture, http } = await open([Q1, Q2, Q3]);
      await tick(fixture, 'q2', 'q3');
      clickButton(fixture, 'Delete selected');
      await settle(fixture);
      type(fixture, '#bulk-confirm', 'DELETE');
      await settle(fixture);
      el<HTMLButtonElement>(fixture, '#bulk-delete-go').click();
      const request = http.expectOne(`${API}/api/admin/questions/delete`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ ids: ['q2', 'q3'], confirm: 'DELETE' });
      request.flush({ deleted: 2, missing: 0 });
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions`).flush([Q1]);
      await settle(fixture);
      expect(text(fixture)).toContain('Deleted 2 questions.');
      expect(text(fixture)).not.toContain('Second question');
      expect(all(fixture, '#bulk-delete-box').length).toBe(0);
    });

    it('Keep them closes the box and deletes nothing', async () => {
      const { fixture, http } = await open([Q1]);
      await tick(fixture, 'q1');
      clickButton(fixture, 'Delete selected');
      await settle(fixture);
      clickButton(fixture, 'Keep them');
      await settle(fixture);
      expect(all(fixture, '#bulk-delete-box').length).toBe(0);
      http.expectNone(`${API}/api/admin/questions/delete`);
    });

    it('starts with an empty box each time it is opened', async () => {
      const { fixture } = await open([Q1]);
      await tick(fixture, 'q1');
      clickButton(fixture, 'Delete selected');
      await settle(fixture);
      type(fixture, '#bulk-confirm', 'DELETE');
      await settle(fixture);
      clickButton(fixture, 'Keep them');
      await settle(fixture);
      clickButton(fixture, 'Delete selected');
      await settle(fixture);
      expect(el<HTMLInputElement>(fixture, '#bulk-confirm').value).toBe('');
      expect(el<HTMLButtonElement>(fixture, '#bulk-delete-go').disabled).toBe(true);
    });

    it('shows the problem and keeps the questions when the delete fails', async () => {
      const { fixture, http } = await open([Q2]);
      await tick(fixture, 'q2');
      clickButton(fixture, 'Delete selected');
      await settle(fixture);
      type(fixture, '#bulk-confirm', 'DELETE');
      await settle(fixture);
      el<HTMLButtonElement>(fixture, '#bulk-delete-go').click();
      http.expectOne(`${API}/api/admin/questions/delete`).flush({ detail: 'Nope.' }, { status: 422, statusText: 'x' });
      await settle(fixture);
      expect(text(fixture)).toContain('Second question');
      expect(text(fixture)).toContain('Nope.');
    });
  });

  describe('reading passages', () => {
    const A = { ...Q1, id: 'a', text: 'First about the monsoon', passage: 'p1', passage_text: TEXT };
    const B = { ...Q1, id: 'b', text: 'Plain question' };
    const C = { ...Q1, id: 'c', text: 'Second about the monsoon', passage: 'p1', passage_text: TEXT };

    it('shows a shared passage once above its questions and keeps them together', async () => {
      const { fixture } = await open([A, B, C]);
      expect(all(fixture, '.question').map((card) => card.getAttribute('data-question'))).toEqual(['a', 'c', 'b']);
      expect(all(fixture, '[data-passage-head]').length).toBe(1);
      expect(el(fixture, '[data-passage-head]').textContent).toContain('Farmers sow rice.');
    });

    it('has a passage box in the form and sends the pasted text', async () => {
      const { fixture, http } = await open([]);
      clickButton(fixture, 'Add question');
      await settle(fixture);
      expect(el(fixture, '#q-passage').tagName).toBe('TEXTAREA');
      await fillForm(fixture);
      type(fixture, '#q-passage', TEXT);
      await settle(fixture);
      clickButton(fixture, 'Save and close');
      const request = http.expectOne(`${API}/api/admin/questions`);
      expect(request.request.body.passage_text).toBe(TEXT);
      request.flush({ ...Q1, id: 'n', passage: 'p1', passage_text: TEXT });
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions`).flush([]);
    });

    it('sends no passage field when the box is empty', async () => {
      const { fixture, http } = await open([]);
      clickButton(fixture, 'Add question');
      await settle(fixture);
      await fillForm(fixture);
      clickButton(fixture, 'Save and close');
      const request = http.expectOne(`${API}/api/admin/questions`);
      expect('passage_text' in request.request.body).toBe(false);
      request.flush({ ...Q1, id: 'n' });
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions`).flush([]);
    });

    it('keeps the passage filled after Save and add another, so the next question needs no pasting', async () => {
      const { fixture, http } = await open([]);
      clickButton(fixture, 'Add question');
      await settle(fixture);
      await fillForm(fixture);
      type(fixture, '#q-passage', TEXT);
      await settle(fixture);
      clickButton(fixture, 'Save and add another');
      http.expectOne(`${API}/api/admin/questions`).flush({ ...Q1, id: 'n', passage: 'p1', passage_text: TEXT });
      await settle(fixture);
      http.expectOne((r) => r.url.startsWith(`${API}/api/admin/questions`)).flush([]);
      await settle(fixture);
      expect(el<HTMLTextAreaElement>(fixture, '#q-passage').value).toBe(TEXT);
      expect(el<HTMLTextAreaElement>(fixture, '#q-text').value).toBe('');
    });

    it('fills the passage box when editing, and sends only a change (an empty box removes the passage)', async () => {
      const { fixture, http } = await open([A]);
      Array.from(el(fixture, '[data-question="a"]').querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Edit')!.click();
      await settle(fixture);
      expect(el<HTMLTextAreaElement>(fixture, '#q-passage').value).toBe(TEXT);
      type(fixture, '#q-text', 'Reworded?');
      clickButton(fixture, 'Save changes');
      let request = http.expectOne(`${API}/api/admin/questions/a`);
      expect('passage_text' in request.request.body).toBe(false); // the passage was not touched
      request.flush(A);
      await settle(fixture);
      http.expectOne((r) => r.url.startsWith(`${API}/api/admin/questions`)).flush([A]);
      await settle(fixture);

      Array.from(el(fixture, '[data-question="a"]').querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Edit')!.click();
      await settle(fixture);
      type(fixture, '#q-passage', '');
      await settle(fixture);
      clickButton(fixture, 'Save changes');
      request = http.expectOne(`${API}/api/admin/questions/a`);
      expect(request.request.body.passage_text).toBe('');
      request.flush({ ...A, passage: null, passage_text: null });
    });

    it('filters by having a passage or not', async () => {
      const { fixture, http } = await open([A, B]);
      pick(fixture, '#f-passage', 'any');
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions?passage=any`).flush([A]);
      await settle(fixture);
      expect(all(fixture, '.question').length).toBe(1);
      pick(fixture, '#f-passage', 'none');
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions?passage=none`).flush([B]);
    });

    it('edits the passage for the whole group from its header', async () => {
      const { fixture, http } = await open([A, C]);
      Array.from(el(fixture, '[data-passage-head]').querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Edit passage')!.click();
      await settle(fixture);
      expect(el<HTMLTextAreaElement>(fixture, '#passage-edit').value).toBe(TEXT);
      type(fixture, '#passage-edit', 'Fixed text.');
      await settle(fixture);
      el<HTMLButtonElement>(fixture, '#save-passage-edit').click();
      const request = http.expectOne(`${API}/api/admin/passages/p1`);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ text: 'Fixed text.' });
      request.flush({ id: 'p1', title: 't', text: 'Fixed text.', questions: 2 });
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions`).flush([{ ...A, passage_text: 'Fixed text.' }, { ...C, passage_text: 'Fixed text.' }]);
      await settle(fixture);
      expect(text(fixture)).toContain('Saved the passage.');
      expect(el(fixture, '[data-passage-head]').textContent).toContain('Fixed text.');
      expect(all(fixture, '#passage-edit').length).toBe(0);
    });

    it('shows the server\'s message and stays in edit mode when the passage cannot be saved', async () => {
      const { fixture, http } = await open([A]);
      Array.from(el(fixture, '[data-passage-head]').querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Edit passage')!.click();
      await settle(fixture);
      type(fixture, '#passage-edit', '');
      await settle(fixture);
      el<HTMLButtonElement>(fixture, '#save-passage-edit').click();
      http.expectOne(`${API}/api/admin/passages/p1`).flush(
        { detail: 'Please correct the marked fields.', errors: { text: 'The passage text is required.' } },
        { status: 422, statusText: 'x' },
      );
      await settle(fixture);
      expect(text(fixture)).toContain('The passage text is required.');
      expect(all(fixture, '#passage-edit').length).toBe(1);
    });

    it('Cancel closes the passage editor without a request', async () => {
      const { fixture, http } = await open([A]);
      Array.from(el(fixture, '[data-passage-head]').querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Edit passage')!.click();
      await settle(fixture);
      Array.from(el(fixture, '[data-passage-head]').querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancel passage edit')!.click();
      await settle(fixture);
      expect(all(fixture, '#passage-edit').length).toBe(0);
      http.expectNone(`${API}/api/admin/passages/p1`);
    });
  });

  describe('tabs', () => {
    it('has Questions and Upload tabs, starting on Questions', async () => {
      const { fixture } = await open();
      const tabs = all(fixture, '[role=tab]');
      expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Questions', 'Upload']);
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
      expect(all(fixture, '[data-question]').length).toBe(1);
      expect(all(fixture, '#question-upload').length).toBe(0);
    });

    it('shows only the chosen tab and goes back to Questions after an import', async () => {
      const { fixture, http } = await open();
      clickButton(fixture, 'Upload');
      await settle(fixture);
      expect(all(fixture, '#question-upload').length).toBe(1);
      fixture.debugElement.query((d) => d.name === 'app-question-upload').componentInstance.imported.emit(2);
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions`).flush([Q1]);
      await settle(fixture);
      expect(all(fixture, '[role=tab]')[0].getAttribute('aria-selected')).toBe('true');
      expect(all(fixture, '[data-question]').length).toBe(1);
    });
  });

  describe('very large selections', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...Q1, id: `m${i}`, text: `Many ${i}`, status: 'draft' }));

    it('publishes any number in groups of 200 and adds the results up', async () => {
      const { fixture, http } = await open(many(450));
      el<HTMLInputElement>(fixture, '#select-all').click();
      await settle(fixture);
      expect(text(fixture)).toContain('450 selected');
      clickButton(fixture, 'Publish selected');
      for (const size of [200, 200, 50]) {
        const request = http.expectOne(`${API}/api/admin/questions/status`);
        expect(request.request.body.ids.length).toBe(size);
        expect(request.request.body.status).toBe('published');
        request.flush({ changed: size - (size === 50 ? 5 : 0), unchanged: size === 50 ? 5 : 0, missing: 0 });
        await settle(fixture);
      }
      http.expectOne(`${API}/api/admin/questions`).flush(many(450));
      await settle(fixture);
      expect(text(fixture)).toContain('Published 445 questions. 5 already published.');
    });

    it('shows how far it got, and says what was done if a group fails', async () => {
      const { fixture, http } = await open(many(450));
      el<HTMLInputElement>(fixture, '#select-all').click();
      await settle(fixture);
      clickButton(fixture, 'Publish selected');
      http.expectOne(`${API}/api/admin/questions/status`).flush({ changed: 200, unchanged: 0, missing: 0 });
      await settle(fixture);
      expect(text(fixture)).toContain('Publishing… 200 of 450');
      http.expectOne(`${API}/api/admin/questions/status`).flush({ detail: 'Server trouble.' }, { status: 500, statusText: 'x' });
      await settle(fixture);
      http.expectOne(`${API}/api/admin/questions`).flush(many(450));
      await settle(fixture);
      expect(text(fixture)).toContain('Server trouble.');
      expect(text(fixture)).toContain('Published 200 before the problem. Run it again to finish.');
    });

    it('deletes a big selection in groups of 100, after DELETE is typed', async () => {
      const { fixture, http } = await open(many(250));
      el<HTMLInputElement>(fixture, '#select-all').click();
      await settle(fixture);
      clickButton(fixture, 'Delete selected');
      await settle(fixture);
      type(fixture, '#bulk-confirm', 'DELETE');
      await settle(fixture);
      el<HTMLButtonElement>(fixture, '#bulk-delete-go').click();
      for (const size of [100, 100, 50]) {
        const request = http.expectOne(`${API}/api/admin/questions/delete`);
        expect(request.request.body.ids.length).toBe(size);
        expect(request.request.body.confirm).toBe('DELETE');
        request.flush({ deleted: size - (size === 50 ? 2 : 0), missing: 0, blocked: size === 50 ? 2 : 0 });
        await settle(fixture);
      }
      http.expectOne(`${API}/api/admin/questions`).flush([]);
      await settle(fixture);
      expect(text(fixture)).toContain('Deleted 248 questions. 2 stayed because a published test uses them.');
    });
  });

  it('has a Template button next to Add question that saves the Excel template', async () => {
    const { fixture, http } = await open();
    expect(el(fixture, '#template').textContent).toContain('Template');
    const link = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValueOnce(link);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    el(fixture, '#template').click();
    const request = http.expectOne(`${API}/api/admin/questions/template`);
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['x']));
    await settle(fixture);
    expect(link.download).toBe('question-bank-template.xlsx');
    expect(link.click).toHaveBeenCalled();
  });

  it('shows why the template could not be downloaded', async () => {
    const { fixture, http } = await open();
    el(fixture, '#template').click();
    http.expectOne(`${API}/api/admin/questions/template`).flush(new Blob(['{}']), { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(all(fixture, '.alert.error').length).toBe(1);
  });
});

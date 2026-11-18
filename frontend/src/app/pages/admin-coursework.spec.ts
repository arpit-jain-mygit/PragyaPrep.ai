import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { AdminCoursework, shortDate } from './admin-coursework';

const BASE = `${API}/api/admin/courses/c1/coursework`;
const FILE = { id: 'f1', course_id: 'c1', title: 'Percent notes', kind: 'pdf', content_type: 'application/pdf', size: 2048, status: 'ready', created_at: '2027-01-01' };
const VIDEO = { ...FILE, id: 'f2', title: 'Lecture', kind: 'mp4' };
const PENDING = { ...FILE, id: 'f3', title: 'Half', status: 'uploading' };

function sub(overrides: object = {}) {
  return { id: 's1', title: 'Basics', note: 'Read first', due: null, effective_due: null, due_from: null, status: 'draft', materials: [], ...overrides };
}

function plan(overrides: { subjects?: object[]; counts?: object } = {}) {
  return {
    course: { id: 'c1', name: 'CAT' },
    counts: { topics: 1, subtopics: 1, published: 0, with_dates: 0, ...overrides.counts },
    subjects: overrides.subjects ?? [
      {
        paper_id: 'quantitative-ability', name: 'Quantitative Ability', due: null, in_course: true, topic_options: ['Algebra', 'Geometry'],
        topics: [{ id: 't1', title: 'Percentages', due: null, subtopics: [sub()] }],
      },
      { paper_id: 'logical-reasoning', name: 'Logical Reasoning', due: null, in_course: true, topic_options: ['Puzzles'], topics: [] },
    ],
  };
}

async function open(data: object = plan(), files: object[] = [FILE, VIDEO, PENDING]) {
  const env = setupTestBed({ params: { id: 'c1' } });
  env.sessions.save(sessionFor('tenant_admin'));
  const fixture = TestBed.createComponent(AdminCoursework);
  fixture.detectChanges();
  env.http.expectOne(BASE).flush(data);
  env.http.expectOne(`${API}/api/admin/courses/c1/files`).flush(files);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Admin coursework page', () => {
  it('shows the counts and the course subjects with their topics and sub-topics', async () => {
    const { fixture } = await open(plan({ counts: { topics: 1, subtopics: 1, published: 1, with_dates: 1 } }));
    expect(text(fixture)).toContain('Coursework: CAT');
    expect(['#c-topics', '#c-subtopics', '#c-published', '#c-dated'].map((s) => el(fixture, s).textContent!.trim())).toEqual(['1', '1', '1', '1']);
    expect(all(fixture, '[data-subject]').map((s) => s.getAttribute('data-subject'))).toEqual(['quantitative-ability', 'logical-reasoning']);
    expect(el(fixture, '[data-topic="Percentages"]').textContent).toContain('Basics');
    expect(el(fixture, '#editor').textContent).toContain('Pick a sub-topic to edit it');
  });

  it('says so when the course has no subjects', async () => {
    const { fixture } = await open(plan({ subjects: [] }));
    expect(text(fixture)).toContain('This course has no subjects yet');
  });

  it('explains a failure to load', async () => {
    const env = setupTestBed({ params: { id: 'c1' } });
    env.sessions.save(sessionFor('tenant_admin'));
    const fixture = TestBed.createComponent(AdminCoursework);
    fixture.detectChanges();
    env.http.expectOne(BASE).flush({ detail: 'We couldn\'t find that course.' }, { status: 404, statusText: 'x' });
    env.http.expectOne(`${API}/api/admin/courses/c1/files`).flush([]);
    await settle(fixture);
    expect(text(fixture)).toContain("We couldn't find that course.");
  });

  it('offers the usual topics of a subject and adds the one typed', async () => {
    const { fixture, http } = await open();
    expect(all(fixture, '#options-quantitative-ability option').map((o) => o.getAttribute('value'))).toEqual(['Algebra', 'Geometry']);
    type(fixture, '[aria-label="New topic in Quantitative Ability"]', 'Algebra');
    await settle(fixture);
    all(fixture, '[data-subject="quantitative-ability"] form.cw-add button[type="submit"]').at(-1)!.click();
    const request = http.expectOne(`${BASE}/topics`);
    expect(request.request.body).toEqual({ paper_id: 'quantitative-ability', title: 'Algebra' });
    request.flush(plan({ counts: { topics: 2 } }));
    await settle(fixture);
    expect(text(fixture)).toContain('2');
  });

  it('keeps the Add topic button off until something is typed', async () => {
    const { fixture } = await open();
    const button = all<HTMLButtonElement>(fixture, '[data-subject="logical-reasoning"] form.cw-add button[type="submit"]').at(-1)!;
    expect(button.disabled).toBe(true);
    type(fixture, '[aria-label="New topic in Logical Reasoning"]', 'Puzzles');
    await settle(fixture);
    expect(button.disabled).toBe(false);
  });

  it('adds a sub-topic and opens it for editing', async () => {
    const { fixture, http } = await open();
    type(fixture, '[aria-label="New sub-topic in Percentages"]', 'Profit and loss');
    await settle(fixture);
    all(fixture, '[data-topic="Percentages"] form.cw-add button[type="submit"]')[0].click();
    const request = http.expectOne(`${BASE}/topics/t1/subtopics`);
    expect(request.request.body).toEqual({ title: 'Profit and loss' });
    request.flush(plan({ subjects: [{ paper_id: 'quantitative-ability', name: 'Quantitative Ability', due: null, in_course: true, topic_options: [],
      topics: [{ id: 't1', title: 'Percentages', due: null, subtopics: [sub(), sub({ id: 's2', title: 'Profit and loss', note: '' })] }] }] }));
    await settle(fixture);
    expect(el<HTMLInputElement>(fixture, '#sub-title').value).toBe('Profit and loss');
  });

  it('shows a refusal from the server and keeps the page', async () => {
    const { fixture, http } = await open();
    type(fixture, '[aria-label="New topic in Quantitative Ability"]', 'Percentages');
    await settle(fixture);
    all(fixture, '[data-subject="quantitative-ability"] form.cw-add button[type="submit"]').at(-1)!.click();
    http.expectOne(`${BASE}/topics`).flush({ detail: "There is already a topic called 'Percentages' in this subject." }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('There is already a topic');
    expect(all(fixture, '[data-topic]').length).toBe(1);
  });

  it('opens a sub-topic in the editor with its note, date, status and material', async () => {
    const data = plan({ subjects: [{ paper_id: 'quantitative-ability', name: 'Quantitative Ability', due: null, in_course: true, topic_options: [],
      topics: [{ id: 't1', title: 'Percentages', due: '2027-04-15', subtopics: [
        sub({ due: '2027-03-01', effective_due: '2027-03-01', due_from: 'subtopic', status: 'published', materials: [
          { type: 'file', file_id: 'f1', title: 'Percent notes', kind: 'pdf', size: 2048 }, { type: 'link', url: 'https://youtu.be/x', title: 'Video' }] }),
        sub({ id: 's2', title: 'Follows', note: '', effective_due: '2027-04-15', due_from: 'topic' }),
      ] }] }] });
    const { fixture } = await open(data);
    el(fixture, '[data-sub="Basics"] button.cw-sub').click();
    await settle(fixture);
    expect(el<HTMLInputElement>(fixture, '#sub-title').value).toBe('Basics');
    expect(el<HTMLTextAreaElement>(fixture, '#sub-note').value).toBe('Read first');
    expect(el<HTMLInputElement>(fixture, '#sub-due').value).toBe('2027-03-01');
    expect(all<HTMLInputElement>(fixture, 'input[name="status"]').find((r) => r.checked)?.value).toBe('published');
    expect(el(fixture, '#material').textContent).toContain('Percent notes (PDF)');
    expect(el(fixture, '#material').textContent).toContain('Video');
    el(fixture, '[data-sub="Follows"] button.cw-sub').click();
    await settle(fixture);
    expect(el(fixture, '#editor').textContent).toContain("Follows the topic's date: 15 Apr 2027");
    expect(el(fixture, '#editor').textContent).toContain('Nothing attached yet');
  });

  it('saves the edited sub-topic with its files and links', async () => {
    const { fixture, http } = await open();
    el(fixture, '[data-sub="Basics"] button.cw-sub').click();
    await settle(fixture);
    type(fixture, '#sub-title', 'Fundamentals');
    type(fixture, '#sub-note', 'Watch then read');
    type(fixture, '#sub-due', '2027-02-10');
    const picker = el<HTMLSelectElement>(fixture, 'select[name="pick"]');
    expect(Array.from(picker.options).map((o) => o.textContent!.trim())).toEqual(['Add a file…', 'Percent notes (PDF)', 'Lecture (Video)']);
    type(fixture, 'select[name="pick"]', 'f2');
    await settle(fixture);
    type(fixture, 'input[name="link-url"]', 'https://youtu.be/abc');
    type(fixture, 'input[name="link-title"]', 'Intro');
    await settle(fixture);
    el(fixture, 'button[title="Add link"]').click();
    await settle(fixture);
    expect(Array.from(el<HTMLSelectElement>(fixture, 'select[name="pick"]').options).map((o) => o.textContent!.trim())).toEqual(['Add a file…', 'Percent notes (PDF)']);
    all<HTMLInputElement>(fixture, 'input[name="status"]')[1].click();
    await settle(fixture);
    el(fixture, '#editor form').dispatchEvent(new Event('submit'));
    const request = http.expectOne(`${BASE}/s1`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      title: 'Fundamentals', note: 'Watch then read', due: '2027-02-10', status: 'published',
      materials: [{ type: 'file', file_id: 'f2' }, { type: 'link', url: 'https://youtu.be/abc', title: 'Intro' }],
    });
    request.flush(plan({ subjects: [{ paper_id: 'quantitative-ability', name: 'Quantitative Ability', due: null, in_course: true, topic_options: [],
      topics: [{ id: 't1', title: 'Percentages', due: null, subtopics: [sub({ title: 'Fundamentals', status: 'published', due: '2027-02-10', effective_due: '2027-02-10', due_from: 'subtopic' })] }] }] }));
    await settle(fixture);
    expect(text(fixture)).toContain('Saved');
    expect(el<HTMLInputElement>(fixture, '#sub-title').value).toBe('Fundamentals');
  });

  it('removes a piece of material before saving', async () => {
    const data = plan({ subjects: [{ paper_id: 'quantitative-ability', name: 'Quantitative Ability', due: null, in_course: true, topic_options: [],
      topics: [{ id: 't1', title: 'Percentages', due: null, subtopics: [sub({ materials: [{ type: 'file', file_id: 'f1', title: 'Percent notes', kind: 'pdf', size: 1 }] })] }] }] });
    const { fixture } = await open(data);
    el(fixture, '[data-sub="Basics"] button.cw-sub').click();
    await settle(fixture);
    el(fixture, '#material button[title="Remove"]').click();
    await settle(fixture);
    expect(el(fixture, '#material').textContent).toContain('Nothing attached yet');
    expect(Array.from(el<HTMLSelectElement>(fixture, 'select[name="pick"]').options).length).toBe(3);
  });

  it('shows why a sub-topic could not be published', async () => {
    const { fixture, http } = await open();
    el(fixture, '[data-sub="Basics"] button.cw-sub').click();
    await settle(fixture);
    el(fixture, '#editor form').dispatchEvent(new Event('submit'));
    http.expectOne(`${BASE}/s1`).flush({ detail: 'Add a note or some material before publishing.' }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('Add a note or some material before publishing.');
    expect(text(fixture)).not.toContain('Saved');
  });

  it('sets and clears the date of a subject and of a topic', async () => {
    const { fixture, http } = await open();
    type(fixture, '[aria-label="Finish-by date for Quantitative Ability"]', '2027-06-30');
    const subject = http.expectOne(`${BASE}/subjects/quantitative-ability`);
    expect(subject.request.method).toBe('PATCH');
    expect(subject.request.body).toEqual({ due: '2027-06-30' });
    subject.flush(plan());
    await settle(fixture);
    type(fixture, '[aria-label="Finish-by date for Percentages"]', '2027-04-15');
    const topic = http.expectOne(`${BASE}/t1`);
    expect(topic.request.body).toEqual({ due: '2027-04-15' });
    topic.flush(plan());
    await settle(fixture);
    type(fixture, '[aria-label="Finish-by date for Percentages"]', '');
    expect(http.expectOne(`${BASE}/t1`).request.body).toEqual({ due: null });
  });

  it('moves a sub-topic up or down', async () => {
    const { fixture, http } = await open();
    el(fixture, '[data-sub="Basics"] button[title="Move down"]').click();
    const request = http.expectOne(`${BASE}/s1/move`);
    expect(request.request.body).toEqual({ direction: 'down' });
    request.flush(plan());
  });

  it('asks before deleting a topic, saying how many sub-topics go with it', async () => {
    const { fixture, http } = await open();
    el(fixture, '[data-topic="Percentages"] button[title="Delete topic"]').click();
    await settle(fixture);
    expect(text(fixture)).toContain('Delete with 1');
    el(fixture, '[data-topic="Percentages"] button[title="Keep"]').click();
    await settle(fixture);
    expect(text(fixture)).not.toContain('Delete with');
    el(fixture, '[data-topic="Percentages"] button[title="Delete topic"]').click();
    await settle(fixture);
    all(fixture, 'button').find((b) => b.textContent?.includes('Delete with'))!.click();
    const request = http.expectOne(`${BASE}/t1`);
    expect(request.request.method).toBe('DELETE');
    request.flush({ removed: 2, ...plan({ subjects: [], counts: { topics: 0, subtopics: 0 } }) });
    await settle(fixture);
    expect(all(fixture, '[data-topic]').length).toBe(0);
  });

  it('deletes the sub-topic being edited after asking, and clears the editor', async () => {
    const { fixture, http } = await open();
    el(fixture, '[data-sub="Basics"] button.cw-sub').click();
    await settle(fixture);
    el(fixture, 'button[title="Delete sub-topic"]').click();
    await settle(fixture);
    all(fixture, 'button').find((b) => b.textContent?.trim() === 'Yes, delete')!.click();
    http.expectOne(`${BASE}/s1`).flush({ removed: 1, ...plan({ subjects: [{ paper_id: 'quantitative-ability', name: 'Quantitative Ability', due: null, in_course: true, topic_options: [],
      topics: [{ id: 't1', title: 'Percentages', due: null, subtopics: [] }] }] }) });
    await settle(fixture);
    expect(el(fixture, '#editor').textContent).toContain('Pick a sub-topic to edit it');
  });

  it('marks a published sub-topic and shows its date and material count in the tree', async () => {
    const data = plan({ subjects: [{ paper_id: 'quantitative-ability', name: 'Quantitative Ability', due: null, in_course: true, topic_options: [],
      topics: [{ id: 't1', title: 'Percentages', due: null, subtopics: [
        sub({ status: 'published', effective_due: '2027-02-10', due: '2027-02-10', due_from: 'subtopic', materials: [{ type: 'link', url: 'https://a.com', title: '' }] })] }] }] });
    const { fixture } = await open(data);
    const row = el(fixture, '[data-sub="Basics"]');
    expect(row.querySelector('.status.ok')).not.toBeNull();
    expect(row.textContent).toContain('10 Feb 2027');
    expect(row.textContent!.replace(/\s+/g, ' ')).toContain(' 1 ');
  });

  it('flags a subject that was taken off the course', async () => {
    const { fixture } = await open(plan({ subjects: [{ paper_id: 'quantitative-ability', name: 'Quantitative Ability', due: null, in_course: false, topic_options: [], topics: [] }] }));
    expect(text(fixture)).toContain('off course');
  });

  // ---- Copying from another course ----

  const SOURCE = {
    course: { id: 'c2', name: 'CLAT' },
    counts: { topics: 3, subtopics: 3, published: 0, with_dates: 0 },
    subjects: [
      {
        paper_id: 'quantitative-ability', name: 'Quantitative Ability', due: null, in_course: true, topic_options: [],
        topics: [
          { id: 'p1', title: 'Percentages', due: null, subtopics: [sub({ id: 'a', title: 'Concepts' }), sub({ id: 'b', title: 'Examples' })] },
          { id: 'p2', title: 'Ratios', due: null, subtopics: [] },
        ],
      },
      { paper_id: 'data-interpretation', name: 'Data Interpretation', due: null, in_course: true, topic_options: [], topics: [{ id: 'd1', title: 'Charts', due: null, subtopics: [sub({ id: 'c', title: 'Bars' })] }] },
      { paper_id: 'logical-reasoning', name: 'Logical Reasoning', due: null, in_course: true, topic_options: [], topics: [] },
    ],
  };

  async function openCopy(source: object = SOURCE) {
    const env = await open();
    el(env.fixture, '#open-copy').click();
    env.http.expectOne(`${API}/api/admin/courses`).flush([{ id: 'c1', name: 'CAT' }, { id: 'c2', name: 'CLAT' }, { id: 'c3', name: 'IPMAT' }]);
    await settle(env.fixture);
    type(env.fixture, '#copy-source', 'c2');
    env.http.expectOne(`${BASE.replace('/c1/', '/c2/')}`).flush(source);
    await settle(env.fixture);
    return env;
  }

  const tick = (fixture: Parameters<typeof el>[0], selector: string) => {
    const box = el<HTMLInputElement>(fixture, selector);
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
  };

  it('opens a copy panel that lists the other courses, not this one', async () => {
    const env = await open();
    expect(all(env.fixture, '#copy-panel').length).toBe(0);
    el(env.fixture, '#open-copy').click();
    env.http.expectOne(`${API}/api/admin/courses`).flush([{ id: 'c1', name: 'CAT' }, { id: 'c2', name: 'CLAT' }]);
    await settle(env.fixture);
    expect(Array.from(el<HTMLSelectElement>(env.fixture, '#copy-source').options).map((o) => o.textContent!.trim())).toEqual(['Choose a course…', 'CLAT']);
    el(env.fixture, '#open-copy').click();
    await settle(env.fixture);
    expect(all(env.fixture, '#copy-panel').length).toBe(0);
  });

  it('offers only the subjects this course also has, and says how many were left out', async () => {
    const { fixture } = await openCopy();
    expect(all(fixture, '[data-pick-subject]').map((s) => s.getAttribute('data-pick-subject'))).toEqual(['quantitative-ability']);
    expect(all(fixture, '[data-pick-topic]').map((t) => t.getAttribute('data-pick-topic'))).toEqual(['Percentages', 'Ratios']);
    expect(el(fixture, '#left-out').textContent).toContain('1 subject this course doesn\'t have is left out');
    expect((el(fixture, '#do-copy') as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so when the other course has nothing in this course\'s subjects', async () => {
    const { fixture } = await openCopy({ ...SOURCE, subjects: [SOURCE.subjects[1]] });
    expect(el(fixture, '#copy-panel').textContent).toContain('Nothing to copy');
    expect(all(fixture, '#do-copy').length).toBe(0);
  });

  it('ticking a subject ticks everything under it and counts the choice', async () => {
    const { fixture } = await openCopy();
    tick(fixture, '[data-pick-subject] > label input');
    await settle(fixture);
    expect(all<HTMLInputElement>(fixture, '#copy-panel input[type="checkbox"]').slice(0, 5).map((b) => b.checked)).toEqual([true, true, true, true, true]);
    expect(el(fixture, '#do-copy').textContent).toContain('Copy 3');
    tick(fixture, '[data-pick-sub="Examples"] input');
    await settle(fixture);
    expect(el(fixture, '#do-copy').textContent).toContain('Copy 2');
    expect(el<HTMLInputElement>(fixture, '[data-pick-topic="Percentages"] > label input').indeterminate).toBe(true);
    expect(el<HTMLInputElement>(fixture, '[data-pick-subject] > label input').indeterminate).toBe(true);
  });

  it('sends whole topics as topics and part-ticked topics as sub-topics, then shows what was copied', async () => {
    const { fixture, http } = await openCopy();
    tick(fixture, '[data-pick-topic="Ratios"] > label input');
    tick(fixture, '[data-pick-sub="Concepts"] input');
    await settle(fixture);
    el(fixture, '#do-copy').click();
    const request = http.expectOne(`${BASE}/copy`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ source_course_id: 'c2', topic_ids: ['p2'], subtopic_ids: ['a'], keep_dates: false, keep_status: false });
    request.flush({ ...plan({ counts: { topics: 2, subtopics: 1 } }), copied: { topics_added: 2, subtopics_added: 1, subtopics_skipped: 0, files_linked: 1, subjects_skipped: [] } });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush([FILE]);
    await settle(fixture);
    const note = el(fixture, '#copy-result').textContent!.replace(/\s+/g, ' ');
    expect(note).toContain('Copied 1 sub-topic in 2 new topics');
    expect(note).toContain('1 file added to Files');
    expect(el(fixture, '#c-topics').textContent!.trim()).toBe('2');
    expect((el(fixture, '#do-copy') as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends the keep dates and keep status choices, and reports skipped sub-topics and subjects', async () => {
    const { fixture, http } = await openCopy();
    tick(fixture, '[data-pick-subject] > label input');
    tick(fixture, 'input[name="keep-dates"]');
    tick(fixture, 'input[name="keep-status"]');
    await settle(fixture);
    el(fixture, '#do-copy').click();
    const request = http.expectOne(`${BASE}/copy`);
    expect(request.request.body).toEqual({ source_course_id: 'c2', topic_ids: ['p1', 'p2'], subtopic_ids: [], keep_dates: true, keep_status: true });
    request.flush({ ...plan(), copied: { topics_added: 0, subtopics_added: 1, subtopics_skipped: 2, files_linked: 0, subjects_skipped: ['Data Interpretation'] } });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush([]);
    await settle(fixture);
    const note = el(fixture, '#copy-result').textContent!.replace(/\s+/g, ' ');
    expect(note).toContain('Copied 1 sub-topic');
    expect(note).toContain('2 skipped, already here');
    expect(note).toContain('left out: Data Interpretation');
  });

  it('shows the reason when a copy is refused and keeps the choice', async () => {
    const { fixture, http } = await openCopy();
    tick(fixture, '[data-pick-subject] > label input');
    await settle(fixture);
    el(fixture, '#do-copy').click();
    http.expectOne(`${BASE}/copy`).flush({ detail: 'A course plan can hold up to 1500 topics and sub-topics.' }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('up to 1500');
    expect(all(fixture, '#copy-result').length).toBe(0);
    expect(el(fixture, '#do-copy').textContent).toContain('Copy 3');
  });

  it('forgets the choice when another course is picked', async () => {
    const { fixture, http } = await openCopy();
    tick(fixture, '[data-pick-subject] > label input');
    await settle(fixture);
    type(fixture, '#copy-source', '');
    await settle(fixture);
    expect(all(fixture, '[data-pick-subject]').length).toBe(0);
    type(fixture, '#copy-source', 'c3');
    http.expectOne(`${API}/api/admin/courses/c3/coursework`).flush({ ...SOURCE, course: { id: 'c3', name: 'IPMAT' } });
    await settle(fixture);
    expect(el(fixture, '#do-copy').textContent).toContain('Copy 0');
  });

  it('switches between the plan and the live classes of the course', async () => {
    const { fixture, http } = await open();
    expect(all(fixture, 'app-admin-live-classes').length).toBe(0);
    el(fixture, '#tab-live').click();
    await settle(fixture);
    http.expectOne(`${API}/api/admin/courses/c1/live-classes`).flush([]);
    http.expectOne(`${API}/api/admin/courses/c1/files`).flush([]);
    await settle(fixture);
    expect(all(fixture, 'app-admin-live-classes').length).toBe(1);
    expect(all(fixture, '#tree').length).toBe(0);
    expect(el(fixture, '#tab-live').className).toContain('active');
    el(fixture, '#tab-plan').click();
    await settle(fixture);
    expect(all(fixture, '#tree').length).toBe(1);
  });

  it('formats dates without a time-zone shift', () => {
    expect(shortDate('2027-02-10')).toBe('10 Feb 2027');
    expect(shortDate(null)).toBe('');
    expect(shortDate('garbage')).toBe('garbage');
  });
});

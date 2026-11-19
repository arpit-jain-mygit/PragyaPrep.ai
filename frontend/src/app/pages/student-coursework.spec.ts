import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { StudentCourseworkPage } from './student-coursework';

function sub(overrides: object = {}) {
  return { id: 's1', title: 'Concepts', note: 'Read first', due: '2027-01-20', due_from: 'subtopic', days_left: 5, overdue: false, done: false, done_at: null, materials: [], ...overrides };
}

const FILE = { type: 'file', file_id: 'f1', title: 'Percent notes', kind: 'pdf', size: 2048 };
const VIDEO = { type: 'file', file_id: 'f2', title: 'Lecture', kind: 'mp4', size: 5000000 };
const LINK = { type: 'link', url: 'https://youtu.be/abc', title: 'Intro' };

function data(overrides: { subs?: object[]; extra?: object[]; summary?: object } = {}) {
  const subs = overrides.subs ?? [
    sub({ id: 's1', title: 'Concepts', done: true, done_at: '2027-01-14T10:00:00+05:30', materials: [FILE, VIDEO, LINK] }),
    sub({ id: 's2', title: 'Examples', due: '2027-01-10', due_from: 'topic', days_left: -5, overdue: true, note: '' }),
  ];
  const done = subs.filter((s) => (s as { done: boolean }).done).length;
  return {
    summary: { total: subs.length, done, left: subs.length - done, overdue: 1, this_week: 0, ...overrides.summary },
    courses: [
      {
        id: 'c1', name: 'CAT', progress: { total: subs.length, done }, overdue: 1,
        subjects: [{
          paper_id: 'quantitative-ability', name: 'Quantitative Ability', due: null, progress: { total: subs.length, done },
          topics: [{ id: 't1', title: 'Percentages', due: null, progress: { total: subs.length, done }, subtopics: subs }],
        }],
      },
      ...(overrides.extra ?? []),
    ],
  };
}

async function open(reply: object = data(), queryParams: Record<string, string> = {}) {
  const env = setupTestBed({ queryParams });
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(StudentCourseworkPage);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/my/coursework`).flush(reply);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Student coursework page', () => {
  it('shows the tree with progress at every level and the overall count', async () => {
    const { fixture } = await open();
    expect(el(fixture, '#overall').textContent!.replace(/\s+/g, ' ')).toContain('1 of 2 done');
    expect(el(fixture, '[data-course="CAT"]').textContent).toContain('1/2');
    expect(el(fixture, '[data-subject="Quantitative Ability"]').textContent).toContain('1/2');
    expect(el(fixture, '[data-topic="Percentages"]').textContent).toContain('1/2');
    expect(all(fixture, '[data-sub]').map((b) => b.getAttribute('data-sub'))).toEqual(['Concepts', 'Examples']);
  });

  it('starts on the first sub-topic that is not done, with its path open', async () => {
    const { fixture } = await open();
    expect(el(fixture, '#sub-name').textContent).toBe('Examples');
    expect(el(fixture, '#crumb').textContent).toContain('CAT › Quantitative Ability › Percentages');
    expect(el(fixture, '[data-sub="Examples"]').getAttribute('aria-current')).toBe('true');
  });

  it('shows a done sub-topic with its note, material and the time it was done', async () => {
    const { fixture } = await open();
    el(fixture, '[data-sub="Concepts"]').click();
    await settle(fixture);
    expect(el(fixture, '#note').textContent).toBe('Read first');
    expect(el(fixture, '#due').textContent).toContain('Done 14 Jan 2027');
    const items = all(fixture, '#material li').map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(items[0]).toContain('Percent notes PDF · 2 KB');
    expect(items[1]).toContain('Lecture Video');
    expect(items[2]).toContain('Intro');
    expect(el<HTMLAnchorElement>(fixture, '#material a').getAttribute('href')).toBe('https://youtu.be/abc');
    expect(el<HTMLAnchorElement>(fixture, '#material a').getAttribute('rel')).toContain('noopener');
    expect(el(fixture, '#toggle-done').textContent).toContain('Mark not complete');
  });

  it('says how late an overdue sub-topic is, in red, and how long is left for others', async () => {
    const { fixture } = await open();
    expect(el(fixture, '#due').textContent).toContain('Overdue by 5 days · 10 Jan 2027');
    expect(el(fixture, '#due').className).toContain('late');
    el(fixture, '[data-sub="Concepts"]').click();
    await settle(fixture);
  });

  it.each([
    [{ days_left: 0, due: '2027-01-15' }, 'Due today'],
    [{ days_left: 1, due: '2027-01-16' }, 'Due tomorrow'],
    [{ days_left: 12, due: '2027-01-27' }, 'Due in 12 days'],
    [{ days_left: -1, due: '2027-01-14', overdue: true }, 'Overdue by 1 day'],
    [{ days_left: null, due: null, due_from: null }, 'No finish-by date'],
  ])('writes the date line for %j', async (fields, expected) => {
    const { fixture } = await open(data({ subs: [sub(fields)] }));
    expect(el(fixture, '#due').textContent).toContain(expected);
  });

  it('marks the sub-topic complete and shows the new progress', async () => {
    const { fixture, http } = await open();
    el(fixture, '#toggle-done').click();
    const request = http.expectOne(`${API}/api/my/coursework/c1/s2/done`);
    expect(request.request.method).toBe('PUT');
    request.flush(data({ subs: [sub({ id: 's1', title: 'Concepts', done: true, done_at: '2027-01-14T10:00:00+05:30' }), sub({ id: 's2', title: 'Examples', done: true, done_at: '2027-01-15T10:00:00+05:30', note: '' })] }));
    await settle(fixture);
    expect(el(fixture, '#overall').textContent!.replace(/\s+/g, ' ')).toContain('2 of 2 done');
    expect(el(fixture, '#sub-name').textContent).toBe('Examples');
    expect(el(fixture, '#toggle-done').textContent).toContain('Mark not complete');
    expect(el(fixture, '[data-course="CAT"]').textContent).toContain('2/2');
  });

  it('marks a done sub-topic not complete again', async () => {
    const { fixture, http } = await open();
    el(fixture, '[data-sub="Concepts"]').click();
    await settle(fixture);
    el(fixture, '#toggle-done').click();
    const request = http.expectOne(`${API}/api/my/coursework/c1/s1/done`);
    expect(request.request.method).toBe('DELETE');
    request.flush(data({ subs: [sub({ id: 's1', title: 'Concepts', materials: [FILE] }), sub({ id: 's2', title: 'Examples', due: '2027-01-10', days_left: -5, overdue: true, note: '' })] }));
    await settle(fixture);
    expect(el(fixture, '#toggle-done').textContent).toContain('Mark complete');
    expect(el(fixture, '#overall').textContent!.replace(/\s+/g, ' ')).toContain('0 of 2 done');
  });

  it('shows why a mark failed and keeps the page', async () => {
    const { fixture, http } = await open();
    el(fixture, '#toggle-done').click();
    http.expectOne(`${API}/api/my/coursework/c1/s2/done`).flush({ detail: "We couldn't find that sub-topic." }, { status: 404, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain("We couldn't find that sub-topic.");
    expect(el(fixture, '#toggle-done').textContent).toContain('Mark complete');
  });

  it('collapses and expands the tree', async () => {
    const { fixture } = await open();
    el(fixture, '[data-topic="Percentages"] > button').click();
    await settle(fixture);
    expect(all(fixture, '[data-sub]').length).toBe(0);
    el(fixture, '[data-topic="Percentages"] > button').click();
    await settle(fixture);
    expect(all(fixture, '[data-sub]').length).toBe(2);
    el(fixture, '[data-course="CAT"] > button').click();
    await settle(fixture);
    expect(all(fixture, '[data-subject]').length).toBe(0);
  });

  it('lists several courses, each with its own progress', async () => {
    const extra = [{
      id: 'c2', name: 'CLAT', progress: { total: 1, done: 0 }, overdue: 0,
      subjects: [{ paper_id: 'quantitative-ability', name: 'Quantitative Ability', due: null, progress: { total: 1, done: 0 }, topics: [{ id: 't9', title: 'Percentages', due: null, progress: { total: 1, done: 0 }, subtopics: [sub({ id: 'x1', title: 'CLAT version' })] }] }],
    }];
    const { fixture } = await open(data({ extra }));
    expect(all(fixture, '[data-course]').map((c) => c.getAttribute('data-course'))).toEqual(['CAT', 'CLAT']);
    el(fixture, '[data-course="CLAT"] [data-subject] > button').click();
    await settle(fixture);
    el(fixture, '[data-course="CLAT"] [data-topic] > button').click();
    await settle(fixture);
    el(fixture, '[data-course="CLAT"] [data-sub="CLAT version"]').click();
    await settle(fixture);
    expect(el(fixture, '#crumb').textContent).toContain('CLAT');
  });

  it('opens a PDF in a new tab through an expiring link', async () => {
    const { fixture, http } = await open();
    const tab = { opener: 'x', location: { href: '' }, close: vi.fn() } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(tab);
    el(fixture, '[data-sub="Concepts"]').click();
    await settle(fixture);
    all(fixture, '#material button')[0].click();
    http.expectOne(`${API}/api/my/courses/c1/files/f1/link`).flush({ url: 'https://files.example/a.pdf', expires_in: 300, content_type: 'application/pdf', title: 'Percent notes' });
    await settle(fixture);
    expect(tab.location.href).toBe('https://files.example/a.pdf');
    expect(tab.opener).toBeNull();
  });

  it('plays a video in the page and closes the blank tab on a failed link', async () => {
    const { fixture, http } = await open();
    el(fixture, '[data-sub="Concepts"]').click();
    await settle(fixture);
    all(fixture, '#material button')[1].click();
    http.expectOne(`${API}/api/my/courses/c1/files/f2/link`).flush({ url: 'https://files.example/v.mp4', expires_in: 300, content_type: 'video/mp4', title: 'Lecture' });
    await settle(fixture);
    expect(el<HTMLVideoElement>(fixture, '#player').getAttribute('src')).toBe('https://files.example/v.mp4');
    const tab = { opener: 'x', location: { href: '' }, close: vi.fn() } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(tab);
    all(fixture, '#material button')[0].click();
    http.expectOne(`${API}/api/my/courses/c1/files/f1/link`).flush({ detail: 'This course is no longer available to you.' }, { status: 404, statusText: 'x' });
    await settle(fixture);
    expect(tab.close).toHaveBeenCalled();
    expect(text(fixture)).toContain('no longer available');
  });

  it('gets a new video link when the old one runs out, then gives up after two tries', async () => {
    const { fixture, http } = await open();
    el(fixture, '[data-sub="Concepts"]').click();
    await settle(fixture);
    all(fixture, '#material button')[1].click();
    http.expectOne(`${API}/api/my/courses/c1/files/f2/link`).flush({ url: 'https://files.example/v1.mp4', expires_in: 300, content_type: 'video/mp4', title: 'Lecture' });
    await settle(fixture);
    for (const n of [2, 3]) {
      el(fixture, '#player').dispatchEvent(new Event('error'));
      http.expectOne(`${API}/api/my/courses/c1/files/f2/link`).flush({ url: `https://files.example/v${n}.mp4`, expires_in: 300, content_type: 'video/mp4', title: 'Lecture' });
      await settle(fixture);
    }
    el(fixture, '#player').dispatchEvent(new Event('error'));
    await settle(fixture);
    expect(all(fixture, '#player').length).toBe(0);
    expect(text(fixture)).toContain("This video couldn't be played");
  });

  const LOCKED = (title: string) => sub({ id: `x-${title}`, title, locked: true, note: '', due: null, due_from: null, days_left: null, materials: [] });

  function freeMode() {
    const free = sub({ id: 'free1', title: 'Free one', free: true, materials: [FILE] });
    return {
      summary: { total: 1, done: 0, left: 1, overdue: 0, this_week: 0 },
      courses: [
        { id: 'c1', name: 'CAT', locked: true, progress: { total: 2, done: 0 }, overdue: 0, subjects: [{ paper_id: 'qa', name: 'Quant', due: null, progress: { total: 2, done: 0 }, topics: [{ id: 't1', title: 'Percentages', due: null, progress: { total: 2, done: 0 }, subtopics: [free, LOCKED('Paid one')] }] }] },
        { id: 'c2', name: 'CLAT', locked: true, progress: { total: 1, done: 0 }, overdue: 0, subjects: [{ paper_id: 'lr', name: 'Logic', due: null, progress: { total: 1, done: 0 }, topics: [{ id: 't2', title: 'Puzzles', due: null, progress: { total: 1, done: 0 }, subtopics: [LOCKED('Other')] }] }] },
      ],
    };
  }

  it('in free mode opens the free sample, with lock icons on everything else and no progress numbers', async () => {
    const { fixture } = await open(freeMode());
    expect(el(fixture, '#sub-name').textContent).toBe('Free one');
    expect(el(fixture, '#free-note').textContent).toContain('Free sample');
    expect(el(fixture, '[data-sub="Free one"]').textContent).toContain('Free');
    expect(all(fixture, '[data-sub="Paid one"] app-icon').length).toBe(1);
    expect(el(fixture, '[data-course="CAT"]').querySelector('.cw-count')).toBeNull();
    expect(all(fixture, '[data-course] .cw-bar').length).toBe(0);
    expect(all(fixture, '[data-sub="Other"]').length).toBe(0);
    expect(el(fixture, '#material').textContent).toContain('Percent notes');
  });

  it('shows a locked sub-topic as locked, with no material and no Mark complete', async () => {
    const { fixture } = await open(freeMode());
    el(fixture, '[data-sub="Paid one"]').click();
    await settle(fixture);
    expect(el(fixture, '#locked-note').textContent).toContain('This is locked');
    expect(all(fixture, '#toggle-done').length).toBe(0);
    expect(all(fixture, '#material').length).toBe(0);
    el(fixture, '[data-course="CLAT"] .cw-course').click();
    await settle(fixture);
    el(fixture, '[data-subject="Logic"] .cw-row').click();
    await settle(fixture);
    el(fixture, '[data-topic="Puzzles"] .cw-row').click();
    await settle(fixture);
    el(fixture, '[data-sub="Other"]').click();
    await settle(fixture);
    expect(el(fixture, '#locked-note').textContent).toContain('not enrolled');
  });

  it('shows the live classes of a sub-topic, plays a recording and opens slides', async () => {
    const live = [{ id: 'l1', title: 'Algebra live', held_on: '2027-01-10', held_time: '18:00', description: 'Chapter 1', materials: [{ type: 'file', file_id: 'v9', title: 'Recording', kind: 'mp4', size: 100 }, LINK] }];
    const { fixture, http } = await open(data({ subs: [sub({ id: 's1', title: 'Concepts', live_classes: live })] }));
    const box = el(fixture, '[data-live="Algebra live"]').textContent!.replace(/\s+/g, ' ');
    expect(box).toContain('18:00');
    expect(box).toContain('Chapter 1');
    expect(box).toContain('Intro');
    all(fixture, '[data-live="Algebra live"] button')[0].click();
    http.expectOne(`${API}/api/my/courses/c1/files/v9/link`).flush({ url: 'https://files.example/v9.mp4', expires_in: 300, content_type: 'video/mp4', title: 'Recording' });
    await settle(fixture);
    expect(el(fixture, '#player').getAttribute('src')).toBe('https://files.example/v9.mp4');
  });

  it('has no live classes section when a sub-topic has none', async () => {
    const { fixture } = await open();
    expect(all(fixture, '#live-classes').length).toBe(0);
  });

  it('says so when there is no coursework yet', async () => {
    const { fixture } = await open({ summary: { total: 0, done: 0, left: 0, overdue: 0, this_week: 0 }, courses: [] });
    expect(text(fixture)).toContain('No coursework yet');
    expect(all(fixture, '#overall').length).toBe(0);
  });

  it('explains a failure to load', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentCourseworkPage);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/coursework`).flush({ detail: 'Nope.' }, { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('Nope.');
  });
});


describe('Student coursework page: opened from the Today card', () => {
  const MIXED = data({
    subs: [
      sub({ id: 'a', title: 'Done already', done: true, done_at: '2027-01-14T10:00:00+05:30', days_left: 3 }),
      sub({ id: 'b', title: 'Due this week', days_left: 3 }),
      sub({ id: 'c', title: 'Due later', days_left: 20, due: '2027-02-04' }),
      sub({ id: 'd', title: 'Late one', days_left: -4, overdue: true, due: '2027-01-11' }),
      sub({ id: 'e', title: 'No date', due: null, due_from: null, days_left: null }),
    ],
  });
  const titles = (fixture: Parameters<typeof all>[0]) => all(fixture, '[data-sub]').map((b) => b.getAttribute('data-sub'));

  it('shows everything when opened normally', async () => {
    const { fixture } = await open(MIXED);
    expect(all(fixture, '#cw-filter').length).toBe(0);
    expect(titles(fixture)).toEqual(['Done already', 'Due this week', 'Due later', 'Late one', 'No date']);
  });

  it('shows only the sub-topics due this week, with a note and a way back', async () => {
    const { fixture } = await open(MIXED, { show: 'week' });
    expect(titles(fixture)).toEqual(['Due this week']);
    expect(el(fixture, '#cw-filter-count').textContent).toBe('1 item');
    expect(el(fixture, '#cw-filter').textContent).toContain('due this week');
    expect(el(fixture, '#sub-name').textContent).toBe('Due this week');
  });

  it('switches both ways between the filtered list and everything, showing which is on', async () => {
    const { fixture } = await open(MIXED, { show: 'week' });
    const pressed = () => [el(fixture, '#cw-scope').getAttribute('aria-pressed'), el(fixture, '#cw-show-all').getAttribute('aria-pressed')];
    expect(pressed()).toEqual(['true', 'false']);
    el<HTMLButtonElement>(fixture, '#cw-show-all').click();
    await settle(fixture);
    expect(pressed()).toEqual(['false', 'true']);
    expect(titles(fixture).length).toBe(5);
    expect(all(fixture, '#cw-filter').length).toBe(1); // the switch stays, so the student can go back
    expect(el(fixture, '#cw-filter-count').textContent).toBe('1 item'); // and its count is still the filtered one
    el<HTMLButtonElement>(fixture, '#cw-scope').click();
    await settle(fixture);
    expect(pressed()).toEqual(['true', 'false']);
    expect(titles(fixture)).toEqual(['Due this week']);
  });

  it('keeps the item on the right when it is also in the filtered list, and opens the first match when it is not', async () => {
    const { fixture } = await open(MIXED, { show: 'pending' });
    el<HTMLButtonElement>(fixture, '#cw-show-all').click();
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '[data-sub="Done already"]').click();
    await settle(fixture);
    expect(el(fixture, '#sub-name').textContent).toBe('Done already');
    el<HTMLButtonElement>(fixture, '#cw-scope').click();
    await settle(fixture);
    expect(el(fixture, '#sub-name').textContent).toBe('Due this week'); // "Done already" is not pending, so the first pending one opens
  });

  it('shows only the overdue ones', async () => {
    const { fixture } = await open(MIXED, { show: 'overdue' });
    expect(titles(fixture)).toEqual(['Late one']);
    expect(el(fixture, '#cw-filter').textContent!.replace(/\s+/g, ' ')).toContain('1 item overdue');
  });

  it('shows everything not done when asked for the pending ones', async () => {
    const { fixture } = await open(MIXED, { show: 'pending' });
    expect(titles(fixture)).toEqual(['Due this week', 'Due later', 'Late one', 'No date']);
    expect(el(fixture, '#cw-filter-count').textContent).toBe('4 items');
  });

  it('says so when nothing matches', async () => {
    const { fixture } = await open(data({ subs: [sub({ id: 'x', title: 'Far away', days_left: 30, due: '2027-02-14' })] }), { show: 'week' });
    expect(el(fixture, '#cw-filter-empty').textContent).toContain('all caught up');
  });

  it('ignores an unknown filter word', async () => {
    const { fixture } = await open(MIXED, { show: 'nonsense' });
    expect(all(fixture, '#cw-filter').length).toBe(0);
    expect(titles(fixture).length).toBe(5);
  });

  describe('search over the coursework', () => {
    const HIT = {
      course_id: 'c1', course: 'CAT', subject: 'Quantitative Ability', topic: 'Percentages', subtopic: 'Concepts',
      file_id: 'f1', file: 'Percent notes', page: 2, snippet: 'Kochi is a natural harbour at the head of the Vembanad lagoon.', score: 9.5,
    };

    async function searchFor(env: Awaited<ReturnType<typeof open>>, q: string) {
      const input = el<HTMLInputElement>(env.fixture, '#study-q');
      input.value = q;
      input.dispatchEvent(new Event('input'));
      el(env.fixture, '#study-go').click();
      env.http.expectOne((r) => r.url.startsWith(`${API}/api/my/study/search`)).flush({ query: q, hits: q.includes('lagoon') ? [HIT] : [] });
      await settle(env.fixture);
    }

    it('shows the best passage with its place in the plan and its page', async () => {
      const env = await open();
      await searchFor(env, 'Vembanad lagoon');
      expect(el(env.fixture, '#study-count').textContent).toContain('1 match');
      const hit = el(env.fixture, '.study-hit');
      expect(hit.textContent).toContain('CAT › Quantitative Ability › Percentages › Concepts');
      expect(hit.textContent).toContain('Kochi is a natural harbour');
      expect(hit.textContent).toContain('Percent notes, page 2');
    });

    it('says so when nothing in the coursework matches', async () => {
      const env = await open();
      await searchFor(env, 'photosynthesis');
      expect(el(env.fixture, '#study-none').textContent).toContain('No match in your coursework.');
      expect(all(env.fixture, '.study-hit').length).toBe(0);
    });

    it('does not call the server for a single letter, and asks for a word or two', async () => {
      const env = await open();
      const input = el<HTMLInputElement>(env.fixture, '#study-q');
      input.value = 'a';
      input.dispatchEvent(new Event('input'));
      el(env.fixture, '#study-go').click();
      await settle(env.fixture);
      env.http.expectNone((r) => r.url.includes('/api/my/study/search'));
      expect(el(env.fixture, '#study-error').textContent).toContain('Type a word or two from your question.');
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { StudentLiveClasses } from './student-live-classes';

const PDF = { type: 'file', file_id: 'p1', title: 'Slides', kind: 'pdf', size: 2048 };
const VIDEO = { type: 'file', file_id: 'v1', title: 'Recording', kind: 'mp4', size: 5000000 };
const LINK = { type: 'link', url: 'https://a.com/x', title: 'Notes' };

const DATA = [
  { course_id: 'c1', course_name: 'CAT', classes: [
    { id: 'l2', title: 'Geometry', held_on: '2027-01-12', held_time: '', description: '', materials: [] },
    { id: 'l1', title: 'Algebra', held_on: '2027-01-10', held_time: '18:00', description: 'Chapter 1', materials: [VIDEO, PDF, LINK] },
  ] },
  { course_id: 'c2', course_name: 'CLAT', classes: [{ id: 'l3', title: 'Legal', held_on: '2027-01-11', held_time: '', description: 'x', materials: [] }] },
];

async function open(reply: object = DATA) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(StudentLiveClasses);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/my/live-classes`).flush(reply);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Student live classes', () => {
  it('lists each course with its classes, newest first, with date and time', async () => {
    const { fixture } = await open();
    expect(all(fixture, '[data-course]').map((h) => h.getAttribute('data-course'))).toEqual(['CAT', 'CLAT']);
    expect(all(fixture, '[data-class]').map((c) => c.getAttribute('data-class'))).toEqual(['Geometry', 'Algebra', 'Legal']);
    const algebra = el(fixture, '[data-class="Algebra"]').textContent!.replace(/\s+/g, ' ');
    expect(algebra).toContain('18:00');
    expect(algebra).toContain('Chapter 1');
    expect(algebra).toContain('Recording');
    expect(algebra).toContain('Slides');
    expect(algebra).toContain('Notes');
  });

  it('says so when there are no live classes', async () => {
    const { fixture } = await open([]);
    expect(text(fixture)).toContain('No live classes yet');
  });

  it('plays a recording in the page and opens slides in a new tab', async () => {
    const { fixture, http } = await open();
    const buttons = all(fixture, '[data-class="Algebra"] button');
    buttons[0].click();
    http.expectOne(`${API}/api/my/courses/c1/files/v1/link`).flush({ url: 'https://files.example/v.mp4', expires_in: 300, content_type: 'video/mp4', title: 'Recording' });
    await settle(fixture);
    expect(el(fixture, '[data-class="Algebra"] #player').getAttribute('src')).toBe('https://files.example/v.mp4');
    expect(all(fixture, '[data-class="Geometry"] #player').length).toBe(0);
    const tab = { opener: 'x', location: { href: '' }, close: vi.fn() } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(tab);
    buttons[1].click();
    http.expectOne(`${API}/api/my/courses/c1/files/p1/link`).flush({ url: 'https://files.example/s.pdf', expires_in: 300, content_type: 'application/pdf', title: 'Slides' });
    await settle(fixture);
    expect(tab.location.href).toBe('https://files.example/s.pdf');
    expect(tab.opener).toBeNull();
  });

  it('closes the blank tab and explains when a file will not open', async () => {
    const { fixture, http } = await open();
    const tab = { opener: 'x', location: { href: '' }, close: vi.fn() } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(tab);
    all(fixture, '[data-class="Algebra"] button')[1].click();
    http.expectOne(`${API}/api/my/courses/c1/files/p1/link`).flush({ detail: 'This course is no longer available to you.' }, { status: 404, statusText: 'x' });
    await settle(fixture);
    expect(tab.close).toHaveBeenCalled();
    expect(text(fixture)).toContain('no longer available');
  });

  it('gets a new video link when one runs out, then gives up after two tries', async () => {
    const { fixture, http } = await open();
    all(fixture, '[data-class="Algebra"] button')[0].click();
    http.expectOne(`${API}/api/my/courses/c1/files/v1/link`).flush({ url: 'https://files.example/1.mp4', expires_in: 300, content_type: 'video/mp4', title: 'R' });
    await settle(fixture);
    for (const n of [2, 3]) {
      el(fixture, '#player').dispatchEvent(new Event('error'));
      http.expectOne(`${API}/api/my/courses/c1/files/v1/link`).flush({ url: `https://files.example/${n}.mp4`, expires_in: 300, content_type: 'video/mp4', title: 'R' });
      await settle(fixture);
    }
    el(fixture, '#player').dispatchEvent(new Event('error'));
    await settle(fixture);
    expect(all(fixture, '#player').length).toBe(0);
    expect(text(fixture)).toContain("This video couldn't be played");
  });

  it('explains a failure to load', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentLiveClasses);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/live-classes`).flush({ detail: 'Something went wrong.' }, { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('Something went wrong.');
  });
});

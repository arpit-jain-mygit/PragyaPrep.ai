import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API, all, clickButton, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { MyCourses } from './my-courses';

const PDF = { id: 'f1', course_id: 'c1', title: 'Notes', kind: 'pdf', content_type: 'application/pdf', size: 2048, status: 'ready', created_at: '' };
const MP4 = { id: 'f2', course_id: 'c1', title: 'Lecture 1', kind: 'mp4', content_type: 'video/mp4', size: 5 * 1024 * 1024, status: 'ready', created_at: '' };
const COURSE = { id: 'c1', name: 'CLAT', expires_at: null, files: [PDF, MP4] };

async function open(courses: unknown[] = [COURSE]) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(MyCourses);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/my/courses`).flush(courses as object[]);
  await settle(fixture);
  return { ...env, fixture };
}

afterEach(() => vi.restoreAllMocks());

describe('My courses page', () => {
  it('lists each course with its files, type and size', async () => {
    const { fixture } = await open();
    const content = text(fixture);
    expect(content).toContain('CLAT');
    expect(content).toContain('Notes');
    expect(content).toContain('PDF');
    expect(content).toContain('Lecture 1');
    expect(content).toContain('Video');
    expect(content).toContain('5 MB');
    expect(content).toContain('Your access has no end date.');
  });

  it('shows when access ends', async () => {
    const { fixture } = await open([{ ...COURSE, expires_at: '2027-06-30T23:59:59+05:30' }]);
    expect(text(fixture)).toContain('Your access ends on 30 Jun 2027.');
  });

  it('explains what to expect when there are no courses', async () => {
    const { fixture } = await open([]);
    expect(text(fixture)).toContain("You don't have any courses yet.");
  });

  it('says so when a course has no files', async () => {
    const { fixture } = await open([{ ...COURSE, files: [] }]);
    expect(text(fixture)).toContain('No files have been added to this course yet.');
  });

  it('opens a PDF in a new tab through a fresh link', async () => {
    const tab = { opener: 'x', location: { href: '' }, close: vi.fn() };
    const opened = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const { fixture, http } = await open();
    clickButton(fixture, 'Open PDF');

    expect(opened).toHaveBeenCalledWith('', '_blank'); // opened at once, while the click is fresh
    expect(tab.opener).toBeNull(); // the new tab can't reach back into this page
    http.expectOne(`${API}/api/my/courses/c1/files/f1/link`).flush({ url: 'https://s3.example/notes.pdf', expires_in: 300, content_type: 'application/pdf', title: 'Notes' });
    await settle(fixture);
    expect(tab.location.href).toBe('https://s3.example/notes.pdf');
  });

  it('plays a video on the page', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Play');
    http.expectOne(`${API}/api/my/courses/c1/files/f2/link`).flush({ url: 'https://s3.example/lecture.mp4', expires_in: 300, content_type: 'video/mp4', title: 'Lecture 1' });
    await settle(fixture);
    const video = el<HTMLVideoElement>(fixture, 'video');
    expect(video.getAttribute('src')).toBe('https://s3.example/lecture.mp4');
    expect(video.hasAttribute('controls')).toBe(true);
    expect(all(fixture, 'video').length).toBe(1);
  });

  it('gets a new link and carries on when a video link runs out', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Play');
    http.expectOne(`${API}/api/my/courses/c1/files/f2/link`).flush({ url: 'https://s3.example/old', expires_in: 300, content_type: 'video/mp4', title: 'Lecture 1' });
    await settle(fixture);

    el<HTMLVideoElement>(fixture, 'video').dispatchEvent(new Event('error'));
    http.expectOne(`${API}/api/my/courses/c1/files/f2/link`).flush({ url: 'https://s3.example/new', expires_in: 300, content_type: 'video/mp4', title: 'Lecture 1' });
    await settle(fixture);
    expect(el<HTMLVideoElement>(fixture, 'video').getAttribute('src')).toBe('https://s3.example/new');
  });

  it('gives up with a message when a video still fails after new links', async () => {
    const { fixture, http } = await open();
    clickButton(fixture, 'Play');
    const link = { expires_in: 300, content_type: 'video/mp4', title: 'Lecture 1' };
    http.expectOne(`${API}/api/my/courses/c1/files/f2/link`).flush({ ...link, url: 'https://s3.example/a' });
    await settle(fixture);
    for (const url of ['b', 'c']) {
      el<HTMLVideoElement>(fixture, 'video').dispatchEvent(new Event('error'));
      http.expectOne(`${API}/api/my/courses/c1/files/f2/link`).flush({ ...link, url: `https://s3.example/${url}` });
      await settle(fixture);
    }
    el<HTMLVideoElement>(fixture, 'video').dispatchEvent(new Event('error'));
    await settle(fixture);
    http.expectNone(`${API}/api/my/courses/c1/files/f2/link`); // no endless asking
    expect(all(fixture, 'video').length).toBe(0);
    expect(text(fixture)).toContain("This video couldn't be played.");
  });

  it('closes the new tab and explains when access has ended', async () => {
    const tab = { opener: 'x', location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const { fixture, http } = await open();
    clickButton(fixture, 'Open PDF');
    http.expectOne(`${API}/api/my/courses/c1/files/f1/link`).flush({ detail: "We couldn't find that file." }, { status: 404, statusText: 'Not Found' });
    await settle(fixture);
    http.expectOne(`${API}/api/my/courses`).flush([]); // the list is refreshed, and the course is gone

    await settle(fixture);
    expect(tab.close).toHaveBeenCalled();
    expect(text(fixture)).toContain("You can't open that any more.");
    expect(text(fixture)).toContain("You don't have any courses yet.");
  });

  it('shows other problems as they are', async () => {
    vi.spyOn(window, 'open').mockReturnValue({ opener: null, location: { href: '' }, close: vi.fn() } as unknown as Window);
    const { fixture, http } = await open();
    clickButton(fixture, 'Open PDF');
    http.expectOne(`${API}/api/my/courses/c1/files/f1/link`).flush({ detail: 'Something went wrong.' }, { status: 500, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('Something went wrong');
  });
});

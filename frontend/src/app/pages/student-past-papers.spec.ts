import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { StudentFilterTopics } from './student-filter-topics';
import { StudentPastPapers } from './student-past-papers';
import { StudentSyllabus } from './student-syllabus';

describe('Past papers, Syllabus and Filter topics', () => {
  it('groups the past papers by year, newest first', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentPastPapers);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/past-papers`).flush([
      { id: 'p26', title: 'Paper 2026', year: 2026, question_count: 3 },
      { id: 'p25', title: 'Paper 2025', year: 2025, question_count: 4 },
    ]);
    await settle(fixture);
    expect(all(fixture, '.past-year').map((node) => node.getAttribute('data-year'))).toEqual(['2026', '2025']);
    expect(el(fixture, '[data-paper="p25"]').textContent).toContain('4 questions');
  });

  it('shows topics by year in a table, with the total', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentSyllabus);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/syllabus`).flush({
      years: [2025, 2026],
      rows: [{ paper: 'physics', topic: 'Magnetism', counts: { '2025': 1, '2026': 2 }, total: 3 }],
    });
    await settle(fixture);
    const row = el(fixture, '[data-topic="Magnetism"]');
    expect(row.textContent).toContain('3');
    expect(Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim())).toEqual(['physics', 'Magnetism', '1', '2', '3']);
  });

  it('practises a topic from the past papers as a practice test', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentFilterTopics);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/filter-topics`).flush([{ paper: 'physics', topics: [{ name: 'Magnetism', count: 3 }] }]);
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '[data-topic="Magnetism"] button').click();
    const request = env.http.expectOne(`${API}/api/my/practice`);
    expect(request.request.body).toEqual({ paper: 'physics', topic: 'Magnetism', count: 10 });
    request.flush({ id: 'pr1', title: 'Practice: Magnetism', question_count: 3 }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    expect(env.navigate).toHaveBeenCalledWith(['/', 'demo', 'tests', 'pr1']);
  });
});

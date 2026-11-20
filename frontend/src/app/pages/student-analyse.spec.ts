import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { StudentAnalyse } from './student-analyse';
import { StudentSwot } from './student-swot';

const VIEW = {
  summary: { attempts: 2, average: '60', best: '70' },
  trend: [{ title: 'Mock 1', percentage: '70', started_at: '2026-11-10T10:00:00Z' }],
  subjects: [{
    id: 'physics', name: 'Physics', correct: 7, questions: 10, accuracy: '70',
    topics: [{ topic: 'Optics', correct: 3, wrong: 1, unanswered: 0, questions: 4, accuracy: '75' }],
  }],
};

async function open(view: 'topic' | 'sectional' | 'mock', flush: object) {
  const env = setupTestBed({ data: { view } });
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(StudentAnalyse);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/my/analyse/${view}`).flush(flush);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Analyse', () => {
  it('shows the summary, the trend and the accuracy by subject and topic', async () => {
    const { fixture } = await open('mock', VIEW);
    expect(el(fixture, '#analyse-summary').textContent).toContain('2');
    expect(el(fixture, '#analyse-trend').textContent).toContain('Mock 1');
    expect(el(fixture, '[data-subject="physics"]').textContent).toContain('Physics');
    expect(el(fixture, '[data-topic="Optics"]').textContent).toContain('75%');
  });

  it('says there are no attempts yet when the student has taken none', async () => {
    const { fixture } = await open('sectional', { summary: { attempts: 0, average: null, best: null }, trend: [], subjects: [] });
    expect(el(fixture, '#analyse-empty').textContent).toContain('No attempts yet');
    expect(all(fixture, '#analyse-trend').length).toBe(0);
  });

  it('shows a refused request as a plain message', async () => {
    const env = setupTestBed({ data: { view: 'topic' } });
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentAnalyse);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/analyse/topic`).flush({ detail: 'Not found' }, { status: 404, statusText: 'Not Found' });
    await settle(fixture);
    expect(el(fixture, '#analyse-error').textContent).toContain('Not found');
  });
});

describe('SWOT', () => {
  async function openSwot(flush: object) {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentSwot);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/swot`).flush(flush);
    await settle(fixture);
    return fixture;
  }

  it('waits for more attempts before judging', async () => {
    const fixture = await openSwot({ attempts: 1, enough: false, strengths: [], weaknesses: [] });
    expect(el(fixture, '#swot-insufficient').textContent).toContain('1 so far, at least 3 needed');
    expect(all(fixture, '#swot-strengths').length).toBe(0);
  });

  it('lists strengths and weaknesses once there are enough attempts', async () => {
    const fixture = await openSwot({
      attempts: 3, enough: true,
      strengths: [{ subject: 'Physics', topic: 'Optics', accuracy: '90', questions: 6 }],
      weaknesses: [{ subject: 'Maths', topic: 'Algebra', accuracy: '30', questions: 5 }],
    });
    expect(el(fixture, '#swot-strengths [data-topic="Optics"]').textContent).toContain('90%');
    expect(el(fixture, '#swot-weaknesses [data-topic="Algebra"]').textContent).toContain('30%');
  });
});

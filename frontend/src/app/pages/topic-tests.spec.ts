import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { TopicTests } from './topic-tests';

const LIST = {
  topic_tests: {
    enrolled: true,
    subjects: [{ id: 'physics', name: 'Physics', section: 'I', topics: [{ name: 'Optics', count: 4 }, { name: 'Mechanics', count: 1 }] }],
  },
};

async function open(answer: object = LIST) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const fixture = TestBed.createComponent(TopicTests);
  fixture.detectChanges();
  env.http.expectOne(`${API}/api/my/topic-tests`).flush(answer);
  await settle(fixture);
  return { ...env, fixture };
}

describe('Topic tests page', () => {
  it('lists each subject\'s topics with how many questions each has', async () => {
    const { fixture } = await open();
    expect(el(fixture, '[data-subject="physics"] h2').textContent).toContain('Physics');
    expect(el(fixture, '[data-topic="Optics"]').textContent).toContain('4 questions');
    expect(el(fixture, '[data-topic="Mechanics"]').textContent).toContain('1 question');
  });

  it('starts a topic as a practice test and opens it', async () => {
    const { fixture, http, navigate } = await open();
    const start = all<HTMLButtonElement>(fixture, '[data-topic="Optics"] button')[0];
    start.click();
    const request = http.expectOne(`${API}/api/my/practice`);
    expect(request.request.body).toEqual({ paper: 'physics', topic: 'Optics', count: 10 });
    request.flush({ id: 'p9', title: 'Practice: Optics', question_count: 4 }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    expect(navigate).toHaveBeenCalledWith(['/', 'demo', 'tests', 'p9']);
  });

  it('says so and disables Start for a student who is not enrolled', async () => {
    const { fixture } = await open({ topic_tests: { enrolled: false, subjects: LIST.topic_tests.subjects } });
    expect(el(fixture, '#not-enrolled').textContent).toContain('once you are enrolled');
    expect(all<HTMLButtonElement>(fixture, '[data-topic] button').every((button) => button.disabled)).toBe(true);
  });

  it('says so when no topic has published questions yet', async () => {
    const { fixture } = await open({ topic_tests: { enrolled: true, subjects: [] } });
    expect(el(fixture, '#no-topics').textContent).toContain('No topics have published questions yet');
  });
});

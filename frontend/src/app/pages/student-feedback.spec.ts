import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { StudentFeedback } from './student-feedback';

describe('Feedback page', () => {
  it('sends the rating and the message as feedback, then thanks the student', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentFeedback);
    fixture.detectChanges();
    el<HTMLButtonElement>(fixture, '[data-star="4"]').click();
    fixture.componentInstance.message = 'Clear and quick.';
    fixture.detectChanges();
    el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    const request = env.http.expectOne(`${API}/api/support`);
    expect(request.request.body).toEqual({ kind: 'feedback', rating: 4, message: 'Clear and quick.' });
    request.flush({ sent: true }, { status: 202, statusText: 'Accepted' });
    await settle(fixture);
    expect(el(fixture, '#feedback-sent').textContent).toContain('Thank you.');
  });

  it('marks the chosen stars and the ones before them', () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentFeedback);
    fixture.detectChanges();
    el<HTMLButtonElement>(fixture, '[data-star="3"]').click();
    fixture.detectChanges();
    expect(all(fixture, '.star.on').length).toBe(3);
    void env;
  });
});

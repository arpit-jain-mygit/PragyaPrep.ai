import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { API, all, el, sessionFor, settle, setupTestBed } from '../testing';
import { StudentMocks } from './student-mocks';
import { StudentSectionals } from './student-sectionals';

const CARDS = [
  { id: 'm2', title: 'Mock 2', kind: 'mock', free: false, question_count: 3, total_marks: '9', state: 'open' },
  { id: 'm1', title: 'Full mock 1', kind: 'mock', free: true, question_count: 3, total_marks: '9', state: 'open' },
];

describe('Sectionals and Mocks pages', () => {
  it('lists the sectionals the student can open', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentSectionals);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/tests?kind=sectional`).flush([{ id: 's1', title: 'SA sectional', question_count: 4, total_marks: '12' }]);
    await settle(fixture);
    expect(el(fixture, '[data-test="s1"]').textContent).toContain('SA sectional');
  });

  it('shows the free mock first, marked Free, then the other mocks', async () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentMocks);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/my/tests?kind=mock`).flush(CARDS);
    await settle(fixture);
    expect(all(fixture, '.mock-tile').map((node) => node.getAttribute('data-test'))).toEqual(['m1', 'm2']);
    expect(el(fixture, '[data-test="m1"]').textContent).toContain('Free');
    expect(el(fixture, '[data-test="m2"]').textContent).not.toContain('Free');
  });
});

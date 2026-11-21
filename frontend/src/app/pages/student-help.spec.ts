import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { el, sessionFor, setupTestBed } from '../testing';
import { StudentHelp } from './student-help';

describe('Help page', () => {
  it('opens the same Contact support box as the header', () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const fixture = TestBed.createComponent(StudentHelp);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#support-box')).toBeNull();
    el<HTMLButtonElement>(fixture, '#help-contact').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#support-box')).not.toBeNull();
  });
});

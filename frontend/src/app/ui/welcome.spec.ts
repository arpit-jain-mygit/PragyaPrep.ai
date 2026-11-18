import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { all, el, settle, setupTestBed, text } from '../testing';
import { Welcome } from './welcome';

function open(role: string, tenant = 'demo', email = 'a@example.com') {
  setupTestBed();
  const fixture = TestBed.createComponent(Welcome);
  fixture.componentRef.setInput('role', role);
  fixture.componentRef.setInput('tenant', tenant);
  fixture.componentRef.setInput('email', email);
  fixture.detectChanges();
  return fixture;
}

describe('Welcome', () => {
  beforeEach(() => localStorage.clear());

  it('welcomes a new institute admin with their first steps, once', async () => {
    const fixture = open('tenant_admin');
    await settle(fixture);
    expect(el(fixture, '#welcome').textContent).toContain('Three steps to get started');
    expect(text(fixture)).toContain('Question bank');
    el<HTMLButtonElement>(fixture, '#welcome-done').click();
    await settle(fixture);
    expect(all(fixture, '#welcome').length).toBe(0);
    expect(localStorage.getItem('pragyaprep.welcomed.demo.a@example.com')).toBe('1');
  });

  it('does not show again once it was seen on this device', async () => {
    const fixture = open('tenant_admin');
    localStorage.setItem('pragyaprep.welcomed.demo.a@example.com', '1');
    fixture.componentInstance.ngOnInit();
    await settle(fixture);
    expect(all(fixture, '#welcome').length).toBe(0);
  });

  it('has its own words for a student, a parent and a free learner', async () => {
    expect(text(open('student'))).toContain('My Learning');
    TestBed.resetTestingModule();
    expect(text(open('parent'))).toContain('My children');
    TestBed.resetTestingModule();
    expect(text(open('student', 'free'))).toContain('free test');
  });

  it('is remembered for each person separately', async () => {
    el<HTMLButtonElement>(open('student', 'demo', 'a@example.com'), '#welcome-done').click();
    expect(localStorage.getItem('pragyaprep.welcomed.demo.a@example.com')).toBe('1');
    expect(localStorage.getItem('pragyaprep.welcomed.demo.b@example.com')).toBeNull();
  });
});

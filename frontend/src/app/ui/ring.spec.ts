import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { el, setupTestBed } from '../testing';
import { Ring } from './ring';

function make(done: number, total: number) {
  setupTestBed();
  const fixture = TestBed.createComponent(Ring);
  fixture.componentRef.setInput('done', done);
  fixture.componentRef.setInput('total', total);
  fixture.detectChanges();
  return fixture;
}

describe('Progress ring', () => {
  it('shows the percentage and describes it in words', () => {
    const fixture = make(3, 4);
    expect(el(fixture, 'text').textContent).toBe('75%');
    expect(el(fixture, 'svg').getAttribute('aria-label')).toBe('3 of 4 done, 75 percent');
  });

  it('is empty with nothing to do', () => {
    expect(el(make(0, 0), 'text').textContent).toBe('0%');
  });

  it('never goes over 100', () => {
    expect(el(make(9, 4), 'text').textContent).toBe('100%');
  });
});

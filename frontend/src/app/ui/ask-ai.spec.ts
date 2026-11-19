import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { el, setupTestBed } from '../testing';
import { AskAi } from './ask-ai';

describe('Ask AI box', () => {
  it('shows the sparkle mark (three star shapes) beside its heading', () => {
    setupTestBed();
    const fixture = TestBed.createComponent(AskAi);
    fixture.detectChanges();
    const heading = el(fixture, '#ask-ai-title');
    expect(heading.textContent).toContain('Ask AI');
    expect(heading.querySelectorAll('svg path').length).toBe(3);
  });
});

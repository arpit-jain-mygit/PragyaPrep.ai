import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { all, setupTestBed } from '../testing';
import { StudentVocabulary } from './student-vocabulary';

describe('English Vocabulary inside My Learning', () => {
  it('shows the vocabulary app in a frame at its own address', () => {
    setupTestBed();
    const fixture = TestBed.createComponent(StudentVocabulary);
    fixture.detectChanges();
    const frames = all<HTMLIFrameElement>(fixture, 'iframe#vocabulary-frame');
    expect(frames.length).toBe(1);
    expect(frames[0].getAttribute('title')).toBe('English Vocabulary');
    expect(frames[0].src).toBe('https://d20eivggluollb.cloudfront.net/');
  });
});

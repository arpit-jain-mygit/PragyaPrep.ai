import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { settle } from '../testing';
import { Avatar } from './avatar';

function make(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(Avatar);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture;
}

describe('Avatar', () => {
  it('shows the photo, round and at the size asked for', async () => {
    const fixture = make({ url: 'https://files.example/a.jpg', first: 'Asha', last: 'Rao', email: 'a@example.com', size: 60 });
    const image = fixture.nativeElement.querySelector('img.avatar') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('https://files.example/a.jpg');
    expect(image.style.width).toBe('60px');
    expect(image.getAttribute('alt')).toBe('');
    expect(fixture.nativeElement.querySelector('span.avatar')).toBeNull();
  });

  it('shows coloured initials when there is no photo', async () => {
    const fixture = make({ url: '', first: 'Asha', last: 'Rao', email: 'a@example.com' });
    const badge = fixture.nativeElement.querySelector('span.avatar') as HTMLElement;
    expect(badge.textContent!.trim()).toBe('AR');
    expect(badge.style.background).toContain('linear-gradient');
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });

  it('falls back to the initials when the photo cannot load, and tries a new link', async () => {
    const fixture = make({ url: 'https://files.example/old.jpg', first: 'Asha', last: 'Rao', email: 'a@example.com' });
    (fixture.nativeElement.querySelector('img') as HTMLImageElement).dispatchEvent(new Event('error'));
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('span.avatar')!.textContent.trim()).toBe('AR');
    fixture.componentRef.setInput('url', 'https://files.example/new.jpg');
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('img')!.getAttribute('src')).toBe('https://files.example/new.jpg');
  });

  it('uses the first letter of the email when there is no name', () => {
    expect(make({ url: '', email: 'zed@example.com' }).nativeElement.querySelector('span.avatar').textContent.trim()).toBe('Z');
  });
});

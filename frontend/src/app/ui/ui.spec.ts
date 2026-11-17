import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { shortAccess } from '../core/format';
import { ICON_NAMES, Icon } from './icon';
import { InfoTip } from './info-tip';

describe('The icon kit', () => {
  it('draws every named icon as an svg with at least one path, hidden from screen readers', () => {
    for (const name of ICON_NAMES) {
      const fixture = TestBed.createComponent(Icon);
      fixture.componentRef.setInput('name', name);
      fixture.detectChanges();
      const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
      expect(svg.getAttribute('aria-hidden'), name).toBe('true');
      expect(svg.querySelectorAll('path').length, name).toBeGreaterThan(0);
    }
  });

  it('uses the size it is given and draws nothing for an unknown name', () => {
    const fixture = TestBed.createComponent(Icon);
    fixture.componentRef.setInput('name', 'nope');
    fixture.componentRef.setInput('size', 30);
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('30');
    expect(svg.querySelectorAll('path').length).toBe(0);
  });

  it('has the icons the admin pages rely on', () => {
    for (const name of ['edit', 'trash', 'eye', 'eye-off', 'plus', 'check', 'x', 'upload', 'download', 'search', 'info', 'folder', 'users', 'book', 'help', 'logout']) {
      expect(ICON_NAMES).toContain(name);
    }
  });

  it('the info tip carries its text for hover, focus and screen readers', () => {
    const fixture = TestBed.createComponent(InfoTip);
    fixture.componentRef.setInput('text', 'A short explanation.');
    fixture.detectChanges();
    const tip = fixture.nativeElement.querySelector('.info') as HTMLElement;
    expect(tip.getAttribute('data-tip')).toBe('A short explanation.');
    expect(tip.getAttribute('aria-label')).toBe('A short explanation.');
    expect(tip.tabIndex).toBe(0);
  });

  it('describes access in the fewest words', () => {
    expect(shortAccess({ type: 'unlimited' })).toBe('Unlimited');
    expect(shortAccess({ type: 'days', days: 365 })).toBe('365 days');
    expect(shortAccess({ type: 'days', days: 1 })).toBe('1 day');
    expect(shortAccess({ type: 'until_date', until: '2027-06-30' })).toBe('Until 30 Jun 2027');
  });
});

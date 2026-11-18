import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PERSONAS, PITCH, TIERS, loadPersona, savePersona } from '../core/persona';
import { all, el, settle, setupTestBed, text } from '../testing';
import { Landing } from './landing';
import { Pricing } from './pricing';

beforeEach(() => localStorage.clear());

describe('Persona memory', () => {
  it('remembers the choice and ignores anything it does not know', () => {
    expect(loadPersona()).toBeNull();
    savePersona('parent');
    expect(loadPersona()).toBe('parent');
    localStorage.setItem('pragyaprep.persona', 'wizard');
    expect(loadPersona()).toBeNull();
  });

  it('has a pitch for every kind of visitor, and three plans', () => {
    expect(PERSONAS.map((p) => p.id)).toEqual(['institute', 'student', 'parent']);
    for (const p of PERSONAS) expect(PITCH[p.id].points.length).toBe(3);
    expect(TIERS.map((t) => t.id)).toEqual(['free', 'popular', 'premium']);
  });
});

describe('Home page', () => {
  async function open(remembered: 'student' | null = null) {
    setupTestBed({ tenant: false });
    if (remembered) savePersona(remembered);
    const fixture = TestBed.createComponent(Landing);
    await settle(fixture);
    return fixture;
  }

  it('asks who the visitor is and shows nothing personal until they choose', async () => {
    const fixture = await open();
    expect(all(fixture, '[data-persona].persona-btn').map((b) => b.getAttribute('data-persona'))).toEqual(['institute', 'student', 'parent']);
    expect(all(fixture, '#pitch').length).toBe(0);
    expect(text(fixture)).toContain('Who are you?');
  });

  it.each([
    ['institute', 'Run your coaching online', 'popular'],
    ['student', 'Prepare for your exam', 'free'],
    ['parent', "Stay close to your child's preparation", 'premium'],
  ] as const)('speaks to a %s and points to the plan that suits them', async (who, headline, tier) => {
    const fixture = await open();
    el(fixture, `.persona-btn[data-persona="${who}"]`).click();
    await settle(fixture);
    expect(el(fixture, '#pitch').textContent).toContain(headline);
    expect(el(fixture, '.persona-btn.on').getAttribute('data-persona')).toBe(who);
    expect(el(fixture, `.tier[data-tier="${tier}"]`).classList.contains('suits')).toBe(true);
    expect(loadPersona()).toBe(who);
    expect(el<HTMLAnchorElement>(fixture, '#pitch-cta').getAttribute('href')).toBe('/pricing');
  });

  it('remembers the visitor from the last time', async () => {
    const fixture = await open('student');
    expect(el(fixture, '#pitch').getAttribute('data-persona')).toBe('student');
  });

  it('shows the three plans in brief, with a link to compare them, and a top bar with Pricing and Log in', async () => {
    const fixture = await open();
    expect(all(fixture, '.tier').map((t) => t.getAttribute('data-tier'))).toEqual(['free', 'popular', 'premium']);
    expect(el<HTMLAnchorElement>(fixture, '#see-pricing').getAttribute('href')).toBe('/pricing');
    expect(all(fixture, 'nav a').map((a) => a.textContent?.trim())).toEqual(['Home', 'Pricing', 'Log in']);
  });

  it('keeps the box that opens an institute by its short name', async () => {
    const fixture = await open();
    expect(el(fixture, '#institute').textContent).toContain('Already with an institute?');
    expect(el(fixture, '#slug')).toBeTruthy();
  });
});

describe('Pricing page', () => {
  async function open() {
    setupTestBed({ tenant: false });
    const fixture = TestBed.createComponent(Pricing);
    await settle(fixture);
    return fixture;
  }

  it('lists Free, Popular and Premium with what each includes and leaves out', async () => {
    const fixture = await open();
    const free = el(fixture, '[data-tier="free"]').textContent!.replace(/\s+/g, ' ');
    expect(free).toContain('One open sub-topic in every course');
    expect(free).toContain('AI assistance');
    const popular = el(fixture, '[data-tier="popular"]').textContent!.replace(/\s+/g, ' ');
    expect(popular).toContain('All course content');
    expect(popular).toContain('Platform support');
    expect(popular).toContain('Price coming soon');
    const premium = el(fixture, '[data-tier="premium"]').textContent!.replace(/\s+/g, ' ');
    expect(premium).toContain('Everything in Popular');
    expect(premium).toContain('Parent mode');
    expect(premium).toContain('AI assistance');
  });

  it('says honestly that sign-up and prices are not open yet', async () => {
    const fixture = await open();
    expect(all<HTMLButtonElement>(fixture, '[data-cta]').every((b) => b.disabled)).toBe(true);
    expect(el(fixture, '[data-cta="free"]').textContent).toContain('opens soon');
    expect(el(fixture, '[data-cta="premium"]').textContent).toContain('to be announced');
  });

  it('marks the plan that suits the chosen kind of visitor', async () => {
    const fixture = await open();
    expect(all(fixture, '#suggested').length).toBe(0);
    el(fixture, '.persona-btn[data-persona="parent"]').click();
    await settle(fixture);
    expect(el(fixture, '[data-tier="premium"] #suggested').textContent).toContain('Suits you');
    el(fixture, '.persona-btn[data-persona="institute"]').click();
    await settle(fixture);
    expect(all(fixture, '[data-tier="premium"] #suggested').length).toBe(0);
    expect(el(fixture, '[data-tier="popular"] #suggested')).toBeTruthy();
  });
});

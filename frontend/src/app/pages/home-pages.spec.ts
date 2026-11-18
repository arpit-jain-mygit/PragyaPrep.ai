import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, all, el, settle, setupTestBed, text } from '../testing';
import { PERSONAS, PITCH, TIERS, loadPersona, savePersona } from '../core/persona';
import { GlimpseDialog } from '../ui/glimpse-dialog';
import { PublicBar } from '../ui/public-bar';
import { Landing } from './landing';
import { Pricing } from './pricing';

beforeEach(() => localStorage.clear());

const OUTLINE = {
  courses: [
    { name: 'CAT', subjects: [{ name: 'Quantitative Ability', topics: [{ title: 'Percentages', subtopics: ['Concepts', 'Examples'] }, { title: 'Ratios', subtopics: ['Basics'] }] }] },
    { name: 'CLAT', subjects: [{ name: 'Legal Reasoning', topics: [{ title: 'Torts', subtopics: ['Intro'] }] }] },
  ],
};

describe('Persona memory', () => {
  it('remembers the choice and ignores anything it does not know', () => {
    expect(loadPersona()).toBeNull();
    savePersona('parent');
    expect(loadPersona()).toBe('parent');
    localStorage.setItem('pragyaprep.persona', 'wizard');
    expect(loadPersona()).toBeNull();
  });

  it('has a short pitch for every kind of visitor, and three plans with short perks', () => {
    expect(PERSONAS.map((p) => p.id)).toEqual(['institute', 'student', 'parent']);
    for (const p of PERSONAS) expect(PITCH[p.id].chips.length).toBe(3);
    expect(TIERS.map((t) => t.id)).toEqual(['free', 'popular', 'premium']);
    for (const t of TIERS) for (const perk of t.perks) expect(perk.text.length).toBeLessThan(40);
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

  it('is short: a headline, who the visitor is, a peek button and three plans, with no institute box', async () => {
    const fixture = await open();
    expect(el(fixture, 'h1').textContent).toContain('Crack your exam');
    expect(all(fixture, '.persona-btn').map((b) => b.getAttribute('data-persona'))).toEqual(['institute', 'student', 'parent']);
    expect(all(fixture, '#pitch').length).toBe(0);
    expect(all(fixture, '.tier').map((t) => t.getAttribute('data-tier'))).toEqual(['free', 'popular', 'premium']);
    expect(text(fixture)).not.toContain('Already with an institute?');
    expect(all(fixture, '#institute').length).toBe(0);
  });

  it.each([
    ['institute', 'Your own page', 'popular'],
    ['student', 'A clear plan', 'free'],
    ['parent', 'See progress', 'premium'],
  ] as const)('gives a %s one line and three chips, and marks their plan', async (who, line, tier) => {
    const fixture = await open();
    el(fixture, `.persona-btn[data-persona="${who}"]`).click();
    await settle(fixture);
    expect(el(fixture, '#pitch').textContent).toContain(line);
    expect(all(fixture, '#pitch-chips .hero-chip').length).toBe(3);
    expect(el(fixture, '.persona-btn.on').getAttribute('data-persona')).toBe(who);
    expect(el(fixture, `.tier[data-tier="${tier}"]`).classList.contains('suits')).toBe(true);
    expect(el(fixture, '#suggested').textContent).toContain('For you');
    expect(loadPersona()).toBe(who);
  });

  it('remembers the visitor from the last time', async () => {
    const fixture = await open('student');
    expect(el(fixture, '#pitch').getAttribute('data-persona')).toBe('student');
  });

  it('shows at most four short perks for each plan and a link to compare them', async () => {
    const fixture = await open();
    for (const id of ['free', 'popular', 'premium']) {
      const perks = all(fixture, `[data-tier="${id}"] .perks li`).length;
      expect(perks).toBeGreaterThan(2);
      expect(perks).toBeLessThanOrEqual(4);
    }
    expect(el<HTMLAnchorElement>(fixture, '#see-pricing').getAttribute('href')).toBe('/pricing');
  });

  it('opens the peek popup and closes it again', async () => {
    setupTestBed({ tenant: false });
    const fixture = TestBed.createComponent(Landing);
    await settle(fixture);
    expect(all(fixture, '#glimpse').length).toBe(0);
    el(fixture, '#peek').click();
    await settle(fixture);
    TestBed.inject(HttpTestingController).expectOne(`${API}/api/public/glimpse`).flush(OUTLINE);
    await settle(fixture);
    expect(all(fixture, '#glimpse').length).toBe(1);
    el(fixture, '#glimpse button[title="Close"]').click();
    await settle(fixture);
    expect(all(fixture, '#glimpse').length).toBe(0);
  });
});

describe('Peek popup', () => {
  async function open(reply: object = OUTLINE) {
    const env = setupTestBed({ tenant: false });
    const fixture = TestBed.createComponent(GlimpseDialog);
    fixture.detectChanges();
    env.http.expectOne(`${API}/api/public/glimpse`).flush(reply);
    await settle(fixture);
    return { ...env, fixture };
  }

  it('shows the courses as tabs and the first course\'s subjects and topics', async () => {
    const { fixture } = await open();
    expect(all(fixture, '[data-course]').map((c) => c.getAttribute('data-course'))).toEqual(['CAT', 'CLAT']);
    expect(el(fixture, '[data-subject="Quantitative Ability"]')).toBeTruthy();
    expect(all(fixture, '[data-topic]').map((t) => t.getAttribute('data-topic'))).toEqual(['Percentages', 'Ratios']);
  });

  it('opens only the first sub-topic of a course and padlocks the rest', async () => {
    const { fixture } = await open();
    expect(el(fixture, '[data-sub="Concepts"]').textContent).toContain('Free');
    for (const locked of ['Examples', 'Basics']) {
      expect(el(fixture, `[data-sub="${locked}"]`).textContent).not.toContain('Free');
      expect(el(fixture, `[data-sub="${locked}"] .soft-icon`)).toBeTruthy();
    }
  });

  it('closes with the Escape key', async () => {
    const { fixture } = await open();
    let closed = 0;
    fixture.componentInstance.close.subscribe(() => closed++);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(1);
  });

  it('switches course', async () => {
    const { fixture } = await open();
    el(fixture, '[data-course="CLAT"]').click();
    await settle(fixture);
    expect(all(fixture, '[data-subject]').map((s) => s.getAttribute('data-subject'))).toEqual(['Legal Reasoning']);
    expect(el(fixture, '[data-sub="Intro"]').textContent).toContain('Free');
  });

  it('says courses are coming when there are none', async () => {
    const { fixture } = await open({ courses: [] });
    expect(el(fixture, '#glimpse-empty').textContent).toContain('soon');
  });

  it('says the same when the courses cannot be loaded', async () => {
    const env = setupTestBed({ tenant: false });
    const failed = TestBed.createComponent(GlimpseDialog);
    failed.detectChanges();
    env.http.expectOne(`${API}/api/public/glimpse`).flush({ detail: 'x' }, { status: 500, statusText: 'x' });
    await settle(failed);
    expect(el(failed, '#glimpse-empty')).toBeTruthy();
  });
});

describe('Top bar of the public pages', () => {
  async function open() {
    const env = setupTestBed({ tenant: false });
    const fixture = TestBed.createComponent(PublicBar);
    await settle(fixture);
    return { ...env, fixture };
  }

  it('has Home, Pricing and a Log in button that opens the institute name box', async () => {
    const { fixture } = await open();
    expect(all(fixture, 'nav a').map((a) => a.textContent?.trim())).toEqual(['Home', 'Pricing']);
    expect(all(fixture, '#login-pop').length).toBe(0);
    el(fixture, '#login-open').click();
    await settle(fixture);
    expect(el(fixture, '#login-pop').textContent).toContain("Your institute's short name");
    expect(el(fixture, '#login-pop').textContent).toContain('demo');
    expect(el(fixture, '#login-pop').textContent).toContain('local test version');
  });

  it('opens an institute by its short name', async () => {
    const { fixture, navigate } = await open();
    el(fixture, '#login-open').click();
    await settle(fixture);
    fixture.componentInstance.slug = '  AaptPrep ';
    fixture.componentInstance.go();
    expect(navigate).toHaveBeenCalledWith(['/', 'aaptprep']);
    await settle(fixture);
    expect(all(fixture, '#login-pop').length).toBe(0);
  });

  it('does nothing when nothing is typed', async () => {
    const { fixture, navigate } = await open();
    fixture.componentInstance.go();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('Pricing page', () => {
  async function open() {
    setupTestBed({ tenant: false });
    const fixture = TestBed.createComponent(Pricing);
    await settle(fixture);
    return fixture;
  }

  it('lists the perks of each plan, and what the lower plans leave out', async () => {
    const fixture = await open();
    const free = el(fixture, '[data-tier="free"]').textContent!.replace(/\s+/g, ' ');
    expect(free).toContain('1 free sub-topic per course');
    expect(free).toContain('AI assistant');
    const popular = el(fixture, '[data-tier="popular"]').textContent!.replace(/\s+/g, ' ');
    expect(popular).toContain('Every course, fully open');
    expect(popular).toContain('Platform support');
    expect(popular).toContain('Price coming soon');
    const premium = el(fixture, '[data-tier="premium"]').textContent!.replace(/\s+/g, ' ');
    expect(premium).toContain('Everything in Popular');
    expect(premium).toContain('Parent mode');
    expect(premium).toContain('AI study assistant');
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
    expect(el(fixture, '[data-tier="premium"] #suggested').textContent).toContain('For you');
    el(fixture, '.persona-btn[data-persona="institute"]').click();
    await settle(fixture);
    expect(all(fixture, '[data-tier="premium"] #suggested').length).toBe(0);
    expect(el(fixture, '[data-tier="popular"] #suggested')).toBeTruthy();
  });
});

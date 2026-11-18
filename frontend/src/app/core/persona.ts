/** Who a visitor says they are, remembered in the browser so the home and pricing pages speak to them. */
export type Persona = 'institute' | 'student' | 'parent';

export const PERSONAS: { id: Persona; label: string; icon: string; blurb: string }[] = [
  { id: 'institute', label: 'An institute', icon: 'building', blurb: 'I run a coaching institute or school' },
  { id: 'student', label: 'A student', icon: 'book', blurb: 'I am preparing for an exam' },
  { id: 'parent', label: 'A parent', icon: 'users', blurb: 'I want to follow my child\'s preparation' },
];

const KEY = 'pragyaprep.persona';

export function loadPersona(): Persona | null {
  try {
    const value = localStorage.getItem(KEY);
    return PERSONAS.some((p) => p.id === value) ? (value as Persona) : null;
  } catch {
    return null;
  }
}

export function savePersona(persona: Persona): void {
  try {
    localStorage.setItem(KEY, persona);
  } catch {
    // Private windows may refuse storage. The choice then lasts only until the page is closed.
  }
}

/** One line for each kind of visitor, and the plan that suits them. */
export const PITCH: Record<Persona, { line: string; chips: string[]; cta: string; tier: Tier }> = {
  institute: { line: 'Your own page, plans, live classes, tests and progress tracking.', chips: ['Own branded page', 'Bulk onboarding', 'Progress tracking'], cta: 'See plans', tier: 'popular' },
  student: { line: 'A clear plan, class recordings, tests and practice on your weak topics.', chips: ['Clear plan', 'Live class recordings', 'Weak-area practice'], cta: 'See plans', tier: 'free' },
  parent: { line: 'See progress, spot what is overdue and set practice tests.', chips: ['Progress view', 'Overdue alerts', 'Set practice tests'], cta: 'See plans', tier: 'premium' },
};

export type Tier = 'free' | 'popular' | 'premium';

export interface Perk { icon: string; text: string }

/** The three plans, with short perks. The first few are shown on the home page, all of them (and what is left out) on the pricing page. */
export const TIERS: { id: Tier; name: string; tag: string; price: string; priceNote: string; perks: Perk[]; missing: string[] }[] = [
  {
    id: 'free', name: 'Free', tag: 'Start here', price: 'Free', priceNote: 'No payment needed',
    perks: [{ icon: 'eye', text: 'Peek into every course' }, { icon: 'lock', text: '1 free sub-topic per course' }, { icon: 'mail', text: 'Ask us anything' }],
    missing: ['Full courses', 'Live classes and tests', 'Parent mode', 'AI assistant'],
  },
  {
    id: 'popular', name: 'Popular', tag: 'Most chosen', price: 'Price coming soon', priceNote: 'To be announced',
    perks: [
      { icon: 'layers', text: 'Every course, fully open' }, { icon: 'play', text: 'Live class recordings' }, { icon: 'clipboard', text: 'Tests and weak-area practice' },
      { icon: 'building', text: 'Institutes: own branded page' }, { icon: 'help', text: 'Platform support' },
    ],
    missing: ['Parent mode', 'AI assistant'],
  },
  {
    id: 'premium', name: 'Premium', tag: 'Everything', price: 'Price coming soon', priceNote: 'To be announced',
    perks: [{ icon: 'check', text: 'Everything in Popular' }, { icon: 'users', text: 'Parent mode' }, { icon: 'chart', text: 'Practice tests set by parents' }, { icon: 'bell', text: 'AI study assistant' }],
    missing: [],
  },
];

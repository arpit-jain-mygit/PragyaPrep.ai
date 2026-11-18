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

/** What the home page says to each kind of visitor. */
export const PITCH: Record<Persona, { headline: string; lead: string; points: { icon: string; title: string; text: string }[]; cta: string; tier: Tier }> = {
  institute: {
    headline: 'Run your coaching online, under your own name',
    lead: 'Your institute gets its own page, logo and colours. Plan the coursework, add live classes, set tests and see who is falling behind.',
    points: [
      { icon: 'layers', title: 'Coursework plan', text: 'Subject, topic and sub-topic with notes, files, videos and finish-by dates.' },
      { icon: 'upload', title: 'Onboard in bulk', text: 'Add students and parents one by one or from an Excel sheet.' },
      { icon: 'chart', title: 'Progress at a glance', text: 'See who is behind, where students get stuck, and remind them.' },
    ],
    cta: 'See plans for institutes',
    tier: 'popular',
  },
  student: {
    headline: 'Prepare for your exam, one topic at a time',
    lead: 'Follow a clear plan, watch live class recordings, take tests and practise exactly the topics where you are weak.',
    points: [
      { icon: 'book', title: 'A clear plan', text: 'Every course broken into topics and sub-topics, with what is due and what is done.' },
      { icon: 'play', title: 'Live class recordings', text: 'Watch the class again, with the slides, whenever you need.' },
      { icon: 'clipboard', title: 'Tests and weak-area practice', text: 'Take tests, see your results by topic and practise the topics that need work.' },
    ],
    cta: 'See what you get',
    tier: 'free',
  },
  parent: {
    headline: 'Stay close to your child\'s preparation',
    lead: 'See how your child is doing in every course, what is overdue and which topics are weak, and set them practice tests.',
    points: [
      { icon: 'chart', title: 'Progress you can read', text: 'Coursework done, tests taken and average score, course by course.' },
      { icon: 'flag', title: 'Know what is overdue', text: 'See what has slipped, so you can talk about it early.' },
      { icon: 'play', title: 'Set practice tests', text: 'Pick a weak topic and set your child a practice test in one click.' },
    ],
    cta: 'See what you get',
    tier: 'premium',
  },
};

export type Tier = 'free' | 'popular' | 'premium';

/** The three plans. Prices are not decided yet, so Popular and Premium say so. */
export const TIERS: { id: Tier; name: string; tag: string; price: string; priceNote: string; summary: string; features: string[]; missing: string[] }[] = [
  {
    id: 'free',
    name: 'Free',
    tag: 'Start here',
    price: 'Free',
    priceNote: 'No payment needed',
    summary: 'See how it works. One sub-topic of every course is open; the rest is locked.',
    features: ['One open sub-topic in every course', 'Pick a course, then a topic, then a sub-topic', 'Talk to the platform team with questions'],
    missing: ['All course content', 'Live classes and tests', 'Parent mode', 'AI assistance'],
  },
  {
    id: 'popular',
    name: 'Popular',
    tag: 'Most chosen',
    price: 'Price coming soon',
    priceNote: 'To be announced',
    summary: 'Everything a student or an institute needs to prepare, with platform support.',
    features: ['All course content, notes, files and videos', 'Live class recordings and slides', 'Tests, results and weak-area practice', 'For institutes: own page, bulk onboarding and progress tracking', 'Platform support'],
    missing: ['Parent mode', 'AI assistance'],
  },
  {
    id: 'premium',
    name: 'Premium',
    tag: 'Everything',
    price: 'Price coming soon',
    priceNote: 'To be announced',
    summary: 'Everything in Popular, plus parents in the picture and AI help.',
    features: ['Everything in Popular', 'Parent mode: progress view and practice tests set by parents', 'AI assistance'],
    missing: [],
  },
];

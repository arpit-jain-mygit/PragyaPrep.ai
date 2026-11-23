// Shapes returned by the FastAPI backend.

export interface LevelInfo {
  root: string;
  meaning: string;
  word_count: number;
  unlocked: boolean;
  completed: boolean;
  stars: number;
}

export interface Profile {
  code: string;
  name: string;
  points: number;
  candies: number;
  streak: number;
  owned: string[];
  equipped: Record<string, string>;
}

export interface ShopItem {
  id: string;
  slot: 'hat' | 'wand' | 'pet';
  name: string;
  emoji: string;
  price: number;
}

export interface Part {
  text: string;
  type: string;
  meaning: string;
}

export interface WordCard {
  word: string;
  parts: Part[];
  meaning: string;
  sentence: string;
}

// The nine quiz formats. Choice-style ones use "choices"; the others use the fields noted below.
export type QuizFormat = 'choice' | 'emoji' | 'hear' | 'odd' | 'tf' | 'scenario' | 'two' | 'build' | 'type' | 'match';

export interface QuizQuestion {
  id: string;
  format: QuizFormat;
  prompt: string;
  choices?: string[];        // choice-style formats, two-step (current step)
  scene?: string;            // emoji picture shown above the prompt
  speak?: string;            // hear: sentence read aloud
  stage?: number;            // two-step: which step (0-based)
  stage_total?: number;      // two-step: number of steps
  tiles?: string[];          // build: tiles to tap, already shuffled
  length?: number;           // type: letters in the word
  lefts?: string[];          // match: words in order
  rights?: string[];         // match: meanings, shuffled
}

export interface AnswerResult {
  correct: boolean;
  already_answered: boolean;
  points_awarded: number;
  candies_awarded: number;
  first_try?: boolean;
  stage_passed?: boolean;    // two-step: first step right, second step to come
  next?: QuizQuestion;       // two-step: the second step
  explanation: string;
  points: number;
  candies: number;
  streak: number;
}

export interface FinishResult {
  root: string;
  stars: number;
  first_try: number;
  total: number;
  points: number;
  candies: number;
}

export interface LeaderRow {
  name: string;
  points: number;
}

// ---- Wren & Martin grammar quiz ----

export interface WmChapter {
  chapter: number;
  title: string;
  count: number;
}

export interface WmQuestion {
  id: string;
  source: string;      // "Book" (from the exercises) or "Generated" (written for practice)
  exercise: string;    // e.g. "Exercise in Grammar 94" for book questions, empty otherwise
  stem: string;
  options: string[];   // always four
  done: boolean;
}

export interface WmQuestionList {
  chapter: number;
  title: string;
  questions: WmQuestion[];
  done: number;
}

export interface WmAnswerResult {
  correct: boolean;
  already_answered: boolean;
  points_awarded: number;
  candies_awarded: number;
  first_try?: boolean;
  explanation: string;
  points: number;
  candies: number;
  streak: number;
}

export interface WmNote {
  chapter: number;
  title: string;
  summary: string;
  points: string[];
  examples: string[];
  tip: string;
}

// Student-made tests: formats A (multiple choice), B (fill in), C (true or false), D (write the answer).
export interface WmTestItem {
  id: string;
  chapter: number;
  format: 'A' | 'B' | 'C' | 'D';
  stem: string;
  options?: string[];
}

export interface WmTestResult {
  results: { id: string; known: boolean; correct: boolean; expected?: string; explanation?: string }[];
  score: number;
  total: number;
}

// Cambridge Lower Secondary Maths Stage 8.
export interface CmChapter {
  chapter: number;
  title: string;
  questions: number;
}

export interface CmSection {
  heading: string;
  paragraphs: string[];
}

export interface CmNote {
  chapter: number;
  title: string;
  notes: CmSection[];
  questions: number;
}

export interface CmQuizQuestion {
  id: string;
  stem: string;
  options: string[];
}

export interface CmQuiz {
  chapter: number;
  title: string;
  questions: CmQuizQuestion[];
}

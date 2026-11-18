import { formatDateTime } from './format';
import { StudentTestCard } from './models';

export type ScheduleKey = 'overdue' | 'open' | 'upcoming' | 'finished';

export interface ScheduleGroup {
  key: ScheduleKey;
  title: string;
  tests: StudentTestCard[];
}

const TITLES: Record<ScheduleKey, string> = { overdue: 'Overdue', open: 'Open now', upcoming: 'Coming up', finished: 'Finished' };

/** "3 days", "5 h 20 min", "45 min" */
export function countdown(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  if (days >= 1) return days === 1 ? '1 day' : `${days} days`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 1) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  return `${Math.max(1, minutes)} min`;
}

/** Which part of the schedule a test belongs to. */
export function scheduleKey(test: StudentTestCard): ScheduleKey {
  if (test.overdue) return 'overdue';
  if (test.state === 'upcoming') return 'upcoming';
  if (test.state === 'open' && (test.attempts_left > 0 || test.in_progress)) return 'open';
  return 'finished';
}

const soonest = (value: number | null | undefined) => (value ?? Number.MAX_SAFE_INTEGER);

/** Group tests into Overdue, Open now (closing soonest first), Coming up (opening soonest first) and Finished. Empty groups are left out. */
export function scheduleGroups(tests: StudentTestCard[]): ScheduleGroup[] {
  const parts: Record<ScheduleKey, StudentTestCard[]> = { overdue: [], open: [], upcoming: [], finished: [] };
  for (const test of tests) parts[scheduleKey(test)].push(test);
  parts.overdue.sort((a, b) => (b.end_at ?? '').localeCompare(a.end_at ?? ''));
  parts.open.sort((a, b) => Number(!!b.in_progress) - Number(!!a.in_progress) || soonest(a.minutes_left) - soonest(b.minutes_left));
  parts.upcoming.sort((a, b) => soonest(a.opens_in_minutes) - soonest(b.opens_in_minutes));
  parts.finished.sort((a, b) => (b.end_at ?? '').localeCompare(a.end_at ?? ''));
  return (Object.keys(parts) as ScheduleKey[]).filter((key) => parts[key].length).map((key) => ({ key, title: TITLES[key], tests: parts[key] }));
}

/** A closing time within a day is urgent. */
export function isUrgent(test: StudentTestCard): boolean {
  return test.state === 'open' && test.minutes_left != null && test.minutes_left <= 1440;
}

/** The one line that says when: "Closes in 2 days", "Opens in 5 h 20 min", "Closed 14 Jan 2027, 6:00 pm". */
export function dueLabel(test: StudentTestCard): string {
  if (test.state === 'upcoming') return test.opens_in_minutes != null ? `Opens in ${countdown(test.opens_in_minutes)}` : 'Opens soon';
  if (test.state === 'ended') return test.end_at ? `Closed ${formatDateTime(test.end_at)}` : 'Closed';
  if (test.minutes_left != null) return `Closes in ${countdown(test.minutes_left)}`;
  return 'Open any time';
}

/** A week, in minutes. */
export const WEEK = 7 * 1440;

export interface ToTake {
  /** Closed without ever being taken. */
  overdue: number;
  /** Not yet attempted and closing, or opening, within the next 7 days. */
  thisWeek: number;
  /** Not yet attempted and further off, or with no closing date. */
  later: number;
  /** The not-yet-attempted test that needs the student first. */
  next: StudentTestCard | null;
}

/** Counts for the "Tests to take" tile. A test counts once: overdue, or not yet attempted and open or upcoming. */
export function toTake(tests: StudentTestCard[]): ToTake {
  const out: ToTake = { overdue: 0, thisWeek: 0, later: 0, next: null };
  let nextMinutes = Number.MAX_SAFE_INTEGER;
  for (const test of tests) {
    if (test.overdue) {
      out.overdue += 1;
      continue;
    }
    if (test.attempts_used > 0 || test.state === 'ended') continue;
    const minutes = test.state === 'upcoming' ? test.opens_in_minutes : test.minutes_left;
    if (minutes != null && minutes <= WEEK) out.thisWeek += 1;
    else out.later += 1;
    // The next test is the one that closes soonest among open ones, else the one that opens first.
    // Open tests with a closing time rank first, then open ones that never close, then upcoming ones by when they open.
    const rank = test.state === 'open' ? (minutes ?? 90_000_000) : 100_000_000 + (minutes ?? 80_000_000);
    if (!out.next || rank < nextMinutes) {
      out.next = test;
      nextMinutes = rank;
    }
  }
  return out;
}

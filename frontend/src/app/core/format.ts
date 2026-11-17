import { environment } from '../../environments/environment';
import { Access } from './models';

/** 10000 becomes "₹10,000", using the Indian way of grouping digits. */
export function formatFee(rupees: number): string {
  return '₹' + new Intl.NumberFormat('en-IN').format(rupees);
}

/** A short, plain description of how long access lasts. */
export function describeAccess(access: Access): string {
  switch (access.type) {
    case 'days':
      return `${access.days} day${access.days === 1 ? '' : 's'} after payment`;
    case 'until_date':
      return `Until ${formatDate(access.until)}`;
    default:
      return 'Unlimited';
  }
}

/** The shortest description of access, for tables: "Unlimited", "365 days" or "Until 30 Jun 2027". */
export function shortAccess(access: Access): string {
  switch (access.type) {
    case 'days':
      return `${access.days} day${access.days === 1 ? '' : 's'}`;
    case 'until_date':
      return `Until ${formatDate(access.until)}`;
    default:
      return 'Unlimited';
  }
}

/** "2027-01-15" or a full timestamp becomes "15 Jan 2027". Anything unreadable is shown as it is. */
export function formatDate(value: string): string {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "15 Jan 2027, 1:30 pm" */
export function formatDateTime(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
};

/** Today's date as YYYY-MM-DD, for the birth date field's upper limit. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 1536 becomes "1.5 KB". */
export function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

/** A logo's address as the API gave it (like "/api/logo/aaptprep?v=ab12") becomes one a page can load. */
export function logoSrc(path: string | null | undefined): string | null {
  return path ? environment.apiBase + path : null;
}

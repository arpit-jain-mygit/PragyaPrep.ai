import { CollegeRule } from './models';

/** What the student types on the eligibility checker. It is only kept in the page, never sent to the server. */
export interface EligibilityDetails {
  dob: string;
  tenthYear: string;
  tenthPercent: string;
  twelfthYear: string;
  twelfthPercent: string;
  /** 'yes' or 'no' when the student has answered, otherwise empty. */
  twelfthMaths: string;
}

export type Verdict = 'eligible' | 'not_eligible' | 'pending';

export interface Check {
  verdict: Verdict;
  /** The rules the student does not meet, in words. */
  failed: string[];
  /** The rules that cannot be checked yet because a detail is missing. */
  missing: string[];
}

/** The words a student sees for one rule, for example "10th: 60%+". */
export function ruleLabel(rule: CollegeRule): string {
  switch (rule.type) {
    case 'dob_on_or_after':
      return `Born on or after ${formatDate(String(rule.value))}`;
    case 'min_tenth_percent':
      return `10th: ${rule.value}%+`;
    case 'min_twelfth_percent':
      return `12th: ${rule.value}%+`;
    case 'tenth_year_or_later':
      return `10th: ${rule.value} or later`;
    case 'twelfth_year_or_later':
      return `12th: ${rule.value} or later`;
    case 'twelfth_maths':
      return 'Maths in 12th';
  }
}

/**
 * Check one college's rules against the details. A rule with no detail to check against is "missing", so the
 * college stays pending until the student fills it in. A college is eligible only when every rule is met.
 */
export function check(rules: CollegeRule[], details: EligibilityDetails): Check {
  const failed: string[] = [];
  const missing: string[] = [];
  for (const rule of rules) {
    const label = ruleLabel(rule);
    const outcome = meets(rule, details);
    if (outcome === null) missing.push(label);
    else if (!outcome) failed.push(label);
  }
  if (failed.length) return { verdict: 'not_eligible', failed, missing };
  if (missing.length) return { verdict: 'pending', failed, missing };
  return { verdict: 'eligible', failed, missing };
}

/** true when met, false when not met, null when the detail is missing. */
function meets(rule: CollegeRule, details: EligibilityDetails): boolean | null {
  switch (rule.type) {
    case 'dob_on_or_after':
      return details.dob ? details.dob >= String(rule.value) : null;
    case 'min_tenth_percent':
      return details.tenthPercent ? Number(details.tenthPercent) >= Number(rule.value) : null;
    case 'min_twelfth_percent':
      return details.twelfthPercent ? Number(details.twelfthPercent) >= Number(rule.value) : null;
    case 'tenth_year_or_later':
      return details.tenthYear ? Number(details.tenthYear) >= Number(rule.value) : null;
    case 'twelfth_year_or_later':
      return details.twelfthYear ? Number(details.twelfthYear) >= Number(rule.value) : null;
    case 'twelfth_maths':
      return details.twelfthMaths ? details.twelfthMaths === 'yes' : null;
  }
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[month - 1]} ${year}`;
}

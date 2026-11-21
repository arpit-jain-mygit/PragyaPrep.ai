import { describe, expect, it } from 'vitest';
import { check, EligibilityDetails, ruleLabel } from './eligibility';

const EMPTY: EligibilityDetails = { dob: '', tenthYear: '', tenthPercent: '', twelfthYear: '', twelfthPercent: '', twelfthMaths: '' };
const RULES = [
  { type: 'dob_on_or_after' as const, value: '2007-08-01' },
  { type: 'min_tenth_percent' as const, value: 60 },
  { type: 'twelfth_year_or_later' as const, value: 2026 },
  { type: 'twelfth_maths' as const, value: true },
];

describe('eligibility checks', () => {
  it('is pending while a detail the rules need is still empty', () => {
    expect(check(RULES, EMPTY).verdict).toBe('pending');
    expect(check(RULES, EMPTY).missing).toContain('Maths in 12th');
  });

  it('is eligible when every rule is met', () => {
    const details = { ...EMPTY, dob: '2008-01-15', tenthPercent: '72', twelfthYear: '2026', twelfthMaths: 'yes' };
    expect(check(RULES, details)).toEqual({ verdict: 'eligible', failed: [], missing: [] });
  });

  it('is not eligible, and names the rule, when one is failed', () => {
    const details = { ...EMPTY, dob: '2005-01-15', tenthPercent: '72', twelfthYear: '2026', twelfthMaths: 'yes' };
    const result = check(RULES, details);
    expect(result.verdict).toBe('not_eligible');
    expect(result.failed).toEqual(['Born on or after 1 Aug 2007']);
  });

  it('counts the percent exactly at the limit as met', () => {
    expect(check([{ type: 'min_tenth_percent', value: 60 }], { ...EMPTY, tenthPercent: '60' }).verdict).toBe('eligible');
  });

  it('is eligible when there are no rules at all', () => {
    expect(check([], EMPTY).verdict).toBe('eligible');
  });

  it('labels each rule in plain words', () => {
    expect(ruleLabel({ type: 'min_twelfth_percent', value: 70 })).toBe('12th: 70%+');
    expect(ruleLabel({ type: 'tenth_year_or_later', value: 2022 })).toBe('10th: 2022 or later');
  });
});

# Doc templates

Update all three docs at the repo root. Keep the wording plain and short, and keep the table of contents current.

## PHASE1-STATUS.md

1. **Steps table row** under `## Steps`. Columns: `#`, `Step` (bold title, then what it does), `Status`, `Evidence`. Status is one of the legend values, or "Moved to Phase 2" (with a date in the evidence). Evidence names the test counts and what was checked live, in one paragraph. Put the new row after the last finished one.
2. **Latest test results** (near the end): update the totals line and add rows to the backend or frontend area tables.
3. **How to test it**: add a `### <ID> (<name>): what to try` section before `### What you can't test yet`, as a table of `Step | What to do | What you should see`. Mention how to start the screens, and remind the user to remove test data from real institutes afterwards.
4. Fix the "run the automated tests" line (`You should see N passed`) and the "What you can't test yet" list.

## features.md

Add the user-visible behaviour under the right role heading (Platform admin, Tenant admin, Student). When scope moves, put a phase note at the top and mark the affected sections.

## design-choice.md

Append a numbered section and add it to the `## Contents` list. Use this shape:

```
## N. Title (step ID)

**Status:** built and tested (counts, and what was checked live).

**Chosen:** one short paragraph.

**Alternatives considered:** a few, each with why it lost.

### N.1 Decisions
- Bold lead phrase, then the reason.

### N.2 Trade-offs
- What is given up, and when it matters.

### N.3 Revisit when
- The signals that mean the decision should be looked at again.
```

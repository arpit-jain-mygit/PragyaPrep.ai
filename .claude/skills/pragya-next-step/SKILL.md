---
name: pragya-next-step
description: Decide and scope the next step of PragyaPrep.ai work from the scope docs (PHASE1-STATUS.md, features.md, design-choice.md). Use this whenever the user asks "what's next", "what's left", "next step", "what remains for Phase 1/2", "where are we", or proposes a new feature, a scope change, or a change of order (for example moving payments to Phase 2), even if they don't mention the docs. It reads the docs first, so what it says matches what is really built and agreed, then states what will be built, what is out of scope, and the decisions only the user can make.
---

# Next step for PragyaPrep.ai

The scope lives in three files at the root of the PragyaPrep.ai repo. They are the source of truth, and they drift if you answer from memory, so read them before saying anything about progress or scope.

| File | What it holds |
|---|---|
| `PHASE1-STATUS.md` | The steps table (M = backend, F = frontend, P = platform extras), each step's status and evidence, test counts, and how to try each step |
| `features.md` | What the product does, by role (platform admin, tenant admin, student), and what is deferred. Items marked proposed need the user's approval |
| `design-choice.md` | Numbered sections with the decision, alternatives, trade-offs and when to revisit. Section 2 holds the phase scope |

## How to answer "what's next"

1. **Read** the steps table in `PHASE1-STATUS.md`, then the scope lines in `features.md` and section 2 of `design-choice.md`. Note anything marked "Moved to Phase 2" or "Not started".
2. **Compare scope with the code when it matters.** If a feature in `features.md` has no step, or a step is marked done but you doubt it, check `backend/app/` and `frontend/src/app/pages/` before claiming either. Say plainly where the docs and the code disagree.
3. **Pick the next step** as the first unfinished step in the current phase, unless the user has reordered things. If you would reorder (for example hosting before an end-to-end run), say so and why in one sentence.
4. **Restate the step in four lines** so the user can correct you before any work starts:
   - what it will do, in plain words;
   - what it will not do (the nearest out-of-scope items, so the boundary is clear);
   - the screens or API it adds;
   - how it will be checked (tests, browser, live on dev).
5. **Ask only the decisions that are the user's** (product choices, who can do what, what to defer). Give a recommendation with each one, since the user has said they want a clear recommendation and not a survey. Anything that has a sensible default, choose it and say so.
6. **Stop and wait** for a yes before building. When the user says yes, hand over to `pragya-ship-step`.

## When the user changes scope

A scope change touches several places, and a half-updated doc is worse than none. When something moves between phases, is added, or is dropped:

- Update the status row (use "Moved to Phase 2" with the date, never delete the row).
- Update `features.md`: add a phase note at the top and mark the affected sections.
- Update `design-choice.md` section 2 with an "Update (date)" line, and leave the old design sections in place with a note, since they are the design for the later phase.
- Search the three files for every mention before finishing, for example `grep -n "payment" PHASE1-STATUS.md features.md design-choice.md`.

## Style

The user prefers simple, plain explanations with a recommendation, not long option lists. Keep the reply short, use a small table when comparing steps, and end with one clear question.

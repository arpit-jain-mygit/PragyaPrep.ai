# Wireframe mapping for beta

Rule agreed on 20 Nov 2026:

1. **Matched**: an existing feature already covers the wireframe screen. Keep it, and rename or reorder it through the institute's labels.
2. **As-is**: an existing feature with no wireframe match. Keep it unchanged on beta.
3. **Fresh**: a wireframe screen with no existing feature. Build it on beta. Until built, it is listed as "Coming later" in the admin Features page.

Feature keys refer to `backend/app/features.py` (the `CATALOGUE`).

## Existing features

| Existing feature | Key | Bucket | Matching wireframe | Note |
|---|---|---|---|---|
| Coursework (subject, topic, sub-topic plan with files) | `coursework` | Matched | Videos (img03), Learn (img04) | Same content, shown as the Videos library in the wireframe |
| Live classes | `live_classes` | As-is | none | Not in wireframes; keep |
| Tests (question bank tests) | `tests` | Matched | Topic Tests (img08) | Mocks (img10) and Sectionals (img09) use the same test engine; they will be separate labelled screens later |
| Results | `results` | Matched | Analyse: Deep analytics (img16) | Results screen is the closest match; deep analytics is a fresh screen |
| Notices | `notices` | As-is | none | Not in wireframes; keep |
| Ask AI (student doubts) | none yet | Matched | Unresolved Doubts (img02, img07) | Admin already sees the log; student side reuses it |
| Study log | none yet | Matched | Activity (img02, img07) | Activity overview |
| Admin progress, registrations, batches, parents, import, announcements, admin question bank | none | As-is | none | Institute admin tooling; not student screens |

## Wireframe screens with no existing feature (fresh)

| Wireframe screen | Key (planned) | Screens |
|---|---|---|
| Dashboard: today's progress, oranges, days strong, free daily RC and weekly DILR cards, vocab builder, overview, word of the day, yesterday's winners | `dashboard_points`, `word_of_day`, `leaderboard` | img02, img07 |
| Vocabulary and Idioms daily test with a calendar of packs | `vocabulary`, `idioms` | img04, img05, img06 |
| Topic Tests by subject, with sub-topics | `topic_tests` | img08 |
| Sectionals: SA and MCQ | `sectionals` | img09 |
| Mocks: a grid of 25 mocks plus a free one | `mocks` | img10 |
| Daily RC: a passage per day, with tabs for analytics, leaderboard and help | `daily_rc` | img11 |
| Weekly DILR: a set per week, filtered by sub-topic | `weekly_dilr` | img12 |
| Past papers: attempt, explore, syllabus, filter topics | `past_papers`, `syllabus`, `filter_topics` | img13, img15 |
| Syllabus table: topics by year, with counts | `syllabus` | img14, img25 |
| Deep analytics for topic tests, sectionals and mocks | `analytics` | img16, img17, img18 |
| SWOT analysis from the last 10 attempts | `swot` | img19 |
| Forums: home, explore, farmhouses per subject | `forum` | img20, img21 |
| PI question bank with list and flashcard views | `pi_bank` | img22 |
| Application tracker (tools) | `application_tracker` | img23 |
| Eligibility checker | `eligibility` | img24 |
| Cutoffs | `cutoffs` | img26 |
| Loan calculator | `loan_calculator` | img27 |

## Decisions still open (need your answer)

1. Should **Dashboard points** (oranges and days strong) come first, or the test-based screens (Topic Tests, Sectionals, Mocks)? The test screens reuse the existing test engine, so they are cheaper.
2. Should **Daily RC and Weekly DILR** be scheduled by the institute admin (one passage per day, one set per week, from the question bank)? This is my recommendation from before and still unconfirmed.
3. **Eligibility, cutoffs and loan calculator** need data (college rules, cutoff marks, fees). **Decided (decision 6): entered per institute**, not shared. Each institute enters its own college data through its admin.

## Bulk utilities to prepare (for later)

Each one needs an Excel template, a checked preview row by row before anything is saved, and a clear message for every bad row. Existing ones are already built; new ones follow the same pattern.

| Utility | Status | Used by |
|---|---|---|
| Question bank upload (with pictures) | Built | Topic tests, sectionals, mocks |
| Student import (with photos) | Built | Registrations |
| Live class import | Built | Live classes |
| Parent import | Built | Parents |
| Word of the day list | To build (dummy words added on beta for now) | Dashboard |
| Daily RC passages (one per day, dated) | To build | Daily RC |
| Weekly DILR sets (one per week, sub-topic tagged) | To build | Weekly DILR |
| Mock and sectional packs (paper, section, timing) | To build | Mocks, sectionals |
| Past-year papers and tags (year, section, topic) | To build | Past papers, syllabus, filter topics |
| Cutoffs by college, category and year | To build | Cutoffs |
| Eligibility rules by college | To build | Eligibility |
| Fees and loan terms by college | To build | Loan calculator |
| Vocabulary and idioms lists | To build | Vocabulary, idioms |

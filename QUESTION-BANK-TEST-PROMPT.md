# Prompt: create tests from the question bank

How to use it: give everything between the START and END lines to an AI agent that can sign in to the PragyaPrep admin
(either by calling the admin API with an admin token, or by using the Tests page in the browser). You do not need to
fill in anything. The courses, subjects, topics, marking and naming rules are inside. To change a default, add one line
after the prompt, for example: "Create only CAT tests" or "Create 5 tests, then stop for my review".

---------------------------------------- START ----------------------------------------

You are creating tests for an exam-prep platform, using the questions that are already in its question bank. Create tests
only. Do not change, publish, unpublish or delete any question, and do not delete or edit any existing test.

## 1. First, look at what exists
1. Read every question in the bank: its subject, topic, difficulty (easy, medium, hard), status and passage group. In the
   API this is GET /api/admin/questions; in the browser it is the Question bank page.
2. Read the existing tests (GET /api/admin/tests, or the Tests page): their titles, courses and question ids. Never create
   a test whose title already exists.
3. Read the courses (GET /api/admin/courses) so you can tick the right ones.
4. Work out, for each subject and topic, how many published questions there are at each difficulty, and how many are not
   yet in any test. Only PUBLISHED questions can go into a test.

## 2. Courses and their subjects
- CUET: every subject in sections I, II and III below (13 languages, 23 domain subjects, General Aptitude Test).
- IPMAT: Quantitative Ability, Verbal Ability and Reading Comprehension, Logical Reasoning.
- CAT: Verbal Ability and Reading Comprehension, Data Interpretation, Logical Reasoning, Quantitative Ability.
- CLAT: Verbal Ability and Reading Comprehension, Current Affairs and General Knowledge, Legal Reasoning, Logical Reasoning, Quantitative Ability.
A test is assigned to one or more courses. Assign it to a course only if every subject in the test belongs to that course.
Create tests only for subjects that have published questions in the bank. If a subject of a course has no questions yet,
skip it and say so in the report.

## 3. Which tests to create
Make three kinds, for each course and subject that has questions:
1. **Full mock**: one per course, mixing the sections (subjects) of that course that have questions. About 30 to 40 questions.
2. **Sectional test**: one per subject of a course. About 25 to 35 questions across all of the subject's topics.
3. **Topic tests**: for each topic, one test of about 25 to 30 questions. If a topic has more questions than that, make
   several numbered tests (Set 2, Set 3 and so on) until every published question is in at least one test.
Use ALL difficulty levels in every test where the bank has them: aim for roughly 30% easy, 50% medium, 20% hard. If a topic has
no hard (or no easy) questions, use what exists and put the levels in the title, for example "(easy and medium)".

## 4. How to choose the questions
- Questions that belong to a passage (reading comprehension, data interpretation sets) must stay together: include the
  whole group, never part of it. A set of five counts as five questions, so tests built from sets come out in multiples of five.
- Spread difficulty evenly: when you split a big topic into several tests, deal its easy, medium and hard questions across
  the tests in turn so each test gets a fair share of every level.
- Prefer questions that are not yet in another test, so tests feel fresh. When a topic is too small for that, repeat questions
  rather than skip the test, and note it in the report.
- Use "Automatically" (random pick by subject, topic, level and count) for full mocks and sectional tests, and a manual list of
  question ids when you are covering a whole topic. Either way the test stores a fixed list.
- Never add a draft question. Never add the same question twice to one test.

## 5. Settings for every test
- Start: today at 00:00 (so the test is open as soon as it is published), End: four months later at 23:59 (India time).
- Maximum attempts: 3. Pass percentage: 40. Show correct answers after submitting: yes. Status: published, unless I ask for drafts.
- Marking by course: CAT +3 correct and -1 wrong. IPMAT +4 and -1. CLAT +1 and -0.25. CUET +5 and -1. A test for several courses
  uses the marking of its first course.
- Duration: about 0.8 minutes per question for text questions, about 1.4 minutes per question for data interpretation sets
  (charts and tables), at least 10 minutes.
- Instructions: one or two plain sentences saying what the test covers and its marking.

## 6. Names
Use clear, consistent titles so tests sort well:
- "CAT Full Mock Test 1 (Verbal + Data Interpretation, all levels)"
- "CAT Verbal Ability Sectional Test 1 (all levels)"
- "CUET Geography Topic Test: Human Geography, Set 2 (all levels)"
- "Verbal Ability Topic Test: Vocabulary, Set 3 (all levels)" (for a test shared by several courses)
Numbers continue from the highest number already used for the same name.

## 7. Work in batches
Create the tests in batches of 5 (or the number I ask for). After each batch, stop and report, unless I said to do everything
in one go. Keep going until every published question is in at least one test, or until I say stop.

## 8. Report after each batch
For every test created: title, course(s), number of questions, total marks, how many easy / medium / hard, duration.
Then: total tests now, how many distinct questions are in at least one test out of all published questions, which topics still
have questions not in any test, which tests repeat questions from earlier tests, and which subjects were skipped because
they have no questions. Do not claim coverage you did not check: count it from the bank.

----------------------------------------- END -----------------------------------------

## Notes for you (not part of the prompt)
- The tests land as published, so students of the assigned courses will see them once student screens exist. Ask for drafts
  if you want to review first ("create them as drafts").
- The agent needs admin access. With the API it needs an admin session token for your institute; in the browser it needs
  you to be signed in.
- If subjects, topics or marking rules change in the app, regenerate this file so the lists inside stay correct.

## Appendix: subjects and topics (for reference)
I: Language
- English  >>  topics: Reading comprehension; Vocabulary; Grammar; Verbal ability
- Hindi  >>  topics: Reading comprehension; Vocabulary; Grammar; Verbal ability
- Assamese  >>  topics: Reading comprehension; Vocabulary; Grammar; Verbal ability
- Bengali  >>  topics: Reading comprehension; Vocabulary; Grammar; Verbal ability
- Gujarati  >>  topics: Reading comprehension; Vocabulary; Grammar; Verbal ability
- Kannada  >>  topics: Reading comprehension; Vocabulary; Grammar; Verbal ability
- Malayalam  >>  topics: Reading comprehension; Vocabulary; Grammar; Verbal ability
- Marathi  >>  topics: Reading comprehension; Vocabulary; Grammar; Verbal ability
- Odia  >>  topics: Reading comprehension; Vocabulary; Grammar; Verbal ability
- Punjabi  >>  topics: Reading comprehension; Vocabulary; Grammar; Verbal ability
- Tamil  >>  topics: Reading comprehension; Vocabulary; Grammar; Verbal ability
- Telugu  >>  topics: Reading comprehension; Vocabulary; Grammar; Verbal ability
- Urdu  >>  topics: Reading comprehension; Vocabulary; Grammar; Verbal ability

II: Domain
- Physics  >>  topics: Electrostatics; Current electricity; Magnetism; EMI and AC; EM waves; Optics; Dual nature; Atoms and nuclei; Semiconductors
- Chemistry  >>  topics: Solutions; Electrochemistry; Kinetics; d- and f-block; Coordination compounds; Organic chemistry (haloalkanes to amines); Biomolecules
- Mathematics / Applied Mathematics  >>  topics: Common part; Functions; Calculus; Vectors; 3D geometry; Linear programming (LPP); Probability; Numerical applications; Statistics; Financial mathematics
- Biology  >>  topics: Reproduction; Genetics and evolution; Human health; Microbes; Biotechnology; Ecology
- Computer Science / Informatics Practices  >>  topics: Python exceptions and files; Stack; Queue; Searching; Sorting; Databases and SQL; Networks; Security; Project-based learning
- Environmental Science  >>  topics: Human beings and nature; Conservation ecology; Pollution; Third World development; Sustainable agriculture; Resource economics; Global treaties
- Agriculture  >>  topics: Agrometeorology; Genetics and plant breeding; Biochemistry and microbiology; Livestock; Crop production; Horticulture
- Accountancy / Book Keeping  >>  topics: Not-for-profit organisations; Partnership accounts; Goodwill; Admission, retirement and death of a partner; Dissolution; Company accounts; Ratios; Cash flow
- Business Studies  >>  topics: Management principles; Business environment; Planning; Organising; Staffing; Directing; Controlling; Financial markets; Marketing; Consumer protection
- Economics / Business Economics  >>  topics: Microeconomics; Macroeconomics; Indian economic development
- History  >>  topics: Harappan to early states; Buddhism; Travellers; Bhakti-Sufi; Vijayanagara; Mughal agrarian society; 1857; Gandhi; The Constitution
- Political Science  >>  topics: Contemporary world politics; Politics in India since Independence
- Geography / Geology  >>  topics: Human geography; India's people and economy; Map work
- Psychology  >>  topics: Intelligence; Personality; Stress; Disorders; Therapies; Attitudes; Social influence
- Sociology  >>  topics: Indian society; Social change and development in India
- Anthropology  >>  topics: Human evolution; Prehistoric archaeology; Social and cultural anthropology; Fieldwork; Tribes of India
- Home Science  >>  topics: Nutrition; Human development; Fabric and apparel; Resource management; Extension
- Physical Education (Yoga, Sports)  >>  topics: Sports management; Yoga; Nutrition; Testing; Fitness; Physiology and biomechanics; Sports psychology; Training
- Mass Media / Mass Communication  >>  topics: Communication; Journalism; Print; Radio; TV; Cinema; New media; Advertising
- Sanskrit  >>  topics: Comprehension; Grammar (sandhi, samasa, karaka); Prescribed texts; History of literature
- Knowledge Traditions and Practices of India  >>  topics: Language and literature; Arts; Science; Mathematics; Medicine; Metallurgy; Agriculture; Trade
- Fine Arts / Visual Arts / Commercial Arts  >>  topics: Miniature painting schools; The Bengal School; Modern Indian art
- Performing Arts (Dance, Drama, Music)  >>  topics: Music terms; Hindustani and Carnatic music; Classical and folk dance; Theatre

III: General
- General Aptitude Test  >>  topics: General knowledge; Current affairs; Mental ability; Numerical ability; Quantitative reasoning; Logical reasoning

IV: Management and law entrance
- Quantitative Ability  >>  topics: Arithmetic; Algebra; Geometry and mensuration; Number system; Modern mathematics; Data sufficiency
- Verbal Ability and Reading Comprehension  >>  topics: Reading comprehension; Para jumbles; Para summary; Odd sentence out; Sentence completion; Grammar and usage; Vocabulary
- Data Interpretation  >>  topics: Tables; Bar and line graphs; Pie charts; Caselets; Mixed charts
- Logical Reasoning  >>  topics: Arrangements; Puzzles; Syllogisms; Blood relations and directions; Sets and Venn diagrams; Critical reasoning; Series and coding
- Legal Reasoning  >>  topics: Legal principles and facts; Legal knowledge; Constitutional law; Contract law; Law of torts; Criminal law
- Current Affairs and General Knowledge  >>  topics: Current affairs; India and the world; Polity; Economy; History and culture; Science and technology; Static GK

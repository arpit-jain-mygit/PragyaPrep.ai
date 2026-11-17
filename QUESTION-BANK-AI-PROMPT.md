# Prompt: create the Excel file and pictures.zip for the question bank

Copy everything between the two lines marked START and END into any AI tool, attach your PDFs, and fill in the three
values in the first block. The long lists of subjects and topics are at the bottom of this file: paste the line for your
subject where the prompt says SUBJECT TOPICS.

---------------------------------------- START ----------------------------------------

You are preparing questions for an exam-prep question bank. Read the attached PDFs and produce files in the exact format below.
Follow every rule. Do not skip steps. Do not invent facts that are not supported by the PDFs or by well-established knowledge.

## 1. What I am giving you
- SUBJECT (exact text): <paste the subject name exactly as written in the list, for example: Data Interpretation>
- SUBJECT TOPICS (use only these, exactly as written): <paste the topics of that subject>
- MODE: <choose one>
  - CREATE: write new, original questions from the material in the PDFs.
  - EXTRACT: copy the questions that already exist in the PDFs (with their answer key), tidying only the formatting.
- HOW MANY: <number of questions wanted in total, for example 500>

## 2. What to deliver
1. One or more Excel files (.xlsx). Put at most 100 questions in each file and name them {Subject}-batch-01.xlsx, {Subject}-batch-02.xlsx, and so on.
2. One file called pictures.zip holding every picture the questions use (see section 6). If no question needs a picture, say so and skip the zip.
3. A short report at the end (see section 8).
If you cannot create .xlsx or .zip files, give each batch as a tab-separated table in a code block (header row first, 50 rows per block) and list each picture with its file name and what it shows, so I can build the files myself.

## 3. The Excel file
- Exactly one sheet, named: Questions
- Row 1 is this header, with exactly these 25 columns in this order and no other columns:
  Subject | Topic | Question | Option A | Option B | Option C | Option D | Why A | Why B | Why C | Why D | Correct | Difficulty | Status | Question image | Image A | Image B | Image C | Image D | Type | Answer | Answer type | Tolerance | Explanation | Passage
- One question per row, from row 2. No blank rows, no merged cells, no formulas, no colours or other formatting needed.
- Every cell is plain text (no markdown, no bullets, no LaTeX). Write maths in plain characters, for example x^2, sqrt(16), 3/4, 12.5%, 45 degrees. Keep line breaks out of every cell except the Passage column.

## 4. Column rules (multiple-choice questions, which is the default)
- **Subject**: the SUBJECT exactly as given. The same on every row.
- **Topic**: one of the SUBJECT TOPICS, spelled exactly. Choose the topic that fits each question best, and spread the questions sensibly across the topics.
- **Question**: the question text, up to 2000 characters. Self-contained: it must make sense without the PDF. If it refers to a passage or a picture, that is supplied in the Passage or Question image column, not by saying "see page 4".
- **Option A, Option B, Option C, Option D**: exactly four different options, each up to 500 characters. Never use "all of the above" or "none of the above". Only one option is correct. Put the correct answer in a different position from question to question (do not always use B).
- **Why A, Why B, Why C, Why D**: a reason for EVERY option, up to 1000 characters each. Start the correct one with "Correct." and each wrong one with "Wrong.", then say why in one or two clear sentences (for a wrong option, name the mistake a student would make to pick it). A reason is required even for an option that is only a picture.
- **Correct**: a single capital letter: A, B, C or D.
- **Difficulty**: easy, medium or hard (lower case). Aim for roughly 30% easy, 50% medium, 20% hard.
- **Status**: draft (lower case) for every row.
- **Question image**, **Image A**, **Image B**, **Image C**, **Image D**: leave empty unless a picture is needed (section 6).
- **Type, Answer, Answer type, Tolerance, Explanation**: leave empty for multiple-choice questions.
- **Passage**: leave empty unless the question belongs to a passage (section 7).

## 5. Fill-in questions (optional, only if the PDFs call for a typed answer)
For a question where the student types the answer instead of choosing:
- Type = fill_in
- Leave Option A to D, Why A to D and Correct empty.
- Answer type = text or number.
  - text: Answer holds the accepted answer; add other accepted spellings after a vertical bar, for example Mumbai|Bombay.
  - number: Answer holds the number only (no units or commas); Tolerance is optional, for example 0.01.
- Explanation: required, why this is the right answer (up to 2000 characters).

## 6. Pictures (charts, graphs, tables shown as images, diagrams, maps)
- Only add a picture when the question truly needs it. Text tables and data should be written out as text in the Question or Passage instead.
- Create each picture from the PDF (crop or redraw it clearly) as a PNG or JPG, at most 1 MB, readable at normal size.
- Give each picture a unique, descriptive file name with no spaces, for example DI-S001-Q1.png. Type that exact file name in the Question image column (or Image A to D for a picture that is an answer option).
- A picture belongs to ONE question only. If two questions use the same chart, save two copies under two different names, one per question.
- An option that is only a picture may leave its Option text empty, but it still needs its Why reason.
- Put all pictures in pictures.zip, flat or in folders, it does not matter. Every file name used in the Excel files must exist in the zip, and every file in the zip must be used by a question.

## 7. Passages (reading comprehension, data sets, case studies)
- When several questions share one text, paste the complete passage text into the Passage column of EVERY related question, repeated word for word. The system groups questions by identical text, so copy it exactly: do not shorten, reword or change spacing between rows.
- Up to 5000 characters per passage. Paragraphs are separated by one blank line (this is the only place a line break is allowed).
- Do not add a title column or a number. Questions with no passage leave the cell empty.
- Keep all questions of one passage in the same file, next to each other.

## 8. Quality rules
- Every question must have exactly one defensible correct answer, checked against the PDFs.
- No duplicate or near-duplicate questions, within a file or across files.
- Keep the wording neutral and exam-style. Do not copy long passages of copyrighted text word for word; in CREATE mode write your own questions and short passages based on the material.
- Match the difficulty to the label. Check arithmetic twice.

## 9. Check yourself before you answer
Verify and then report, in a short list:
1. Header row is exactly as in section 3, on every file.
2. Every row: Subject exact, Topic from the list, four different options, four reasons, Correct is A, B, C or D, Difficulty and Status valid.
3. No file has more than 100 rows. Count the rows in each file and the total.
4. Every picture name in the Excel files exists in pictures.zip, no picture is used twice, and none is larger than 1 MB.
5. Questions that share a passage have identical passage text.
6. Number of questions per topic and per difficulty.
Fix any problem you find before giving me the files.

----------------------------------------- END -----------------------------------------

## Notes for you (not part of the prompt)
- Upload the finished .xlsx files and pictures.zip together in the Question bank, Upload tab. You see a preview first, and nothing is saved until you click Import.
- Each Excel file can hold up to 500 questions (2 MB). The prompt asks for 100 per file because AI tools make fewer mistakes in smaller batches.
- If the preview lists problems, copy the "What to fix" lines back to the AI tool and ask it to correct only those rows.
- Check a few questions by hand before importing a whole subject: the AI can be wrong about the correct answer.

## Appendix: subjects and their topics (copy the line you need)

### I: Language
- **English**: Reading comprehension; Vocabulary; Grammar; Verbal ability
- **Hindi**: Reading comprehension; Vocabulary; Grammar; Verbal ability
- **Assamese**: Reading comprehension; Vocabulary; Grammar; Verbal ability
- **Bengali**: Reading comprehension; Vocabulary; Grammar; Verbal ability
- **Gujarati**: Reading comprehension; Vocabulary; Grammar; Verbal ability
- **Kannada**: Reading comprehension; Vocabulary; Grammar; Verbal ability
- **Malayalam**: Reading comprehension; Vocabulary; Grammar; Verbal ability
- **Marathi**: Reading comprehension; Vocabulary; Grammar; Verbal ability
- **Odia**: Reading comprehension; Vocabulary; Grammar; Verbal ability
- **Punjabi**: Reading comprehension; Vocabulary; Grammar; Verbal ability
- **Tamil**: Reading comprehension; Vocabulary; Grammar; Verbal ability
- **Telugu**: Reading comprehension; Vocabulary; Grammar; Verbal ability
- **Urdu**: Reading comprehension; Vocabulary; Grammar; Verbal ability

### II: Domain
- **Physics**: Electrostatics; Current electricity; Magnetism; EMI and AC; EM waves; Optics; Dual nature; Atoms and nuclei; Semiconductors
- **Chemistry**: Solutions; Electrochemistry; Kinetics; d- and f-block; Coordination compounds; Organic chemistry (haloalkanes to amines); Biomolecules
- **Mathematics / Applied Mathematics**: Common part; Functions; Calculus; Vectors; 3D geometry; Linear programming (LPP); Probability; Numerical applications; Statistics; Financial mathematics
- **Biology**: Reproduction; Genetics and evolution; Human health; Microbes; Biotechnology; Ecology
- **Computer Science / Informatics Practices**: Python exceptions and files; Stack; Queue; Searching; Sorting; Databases and SQL; Networks; Security; Project-based learning
- **Environmental Science**: Human beings and nature; Conservation ecology; Pollution; Third World development; Sustainable agriculture; Resource economics; Global treaties
- **Agriculture**: Agrometeorology; Genetics and plant breeding; Biochemistry and microbiology; Livestock; Crop production; Horticulture
- **Accountancy / Book Keeping**: Not-for-profit organisations; Partnership accounts; Goodwill; Admission, retirement and death of a partner; Dissolution; Company accounts; Ratios; Cash flow
- **Business Studies**: Management principles; Business environment; Planning; Organising; Staffing; Directing; Controlling; Financial markets; Marketing; Consumer protection
- **Economics / Business Economics**: Microeconomics; Macroeconomics; Indian economic development
- **History**: Harappan to early states; Buddhism; Travellers; Bhakti-Sufi; Vijayanagara; Mughal agrarian society; 1857; Gandhi; The Constitution
- **Political Science**: Contemporary world politics; Politics in India since Independence
- **Geography / Geology**: Human geography; India's people and economy; Map work
- **Psychology**: Intelligence; Personality; Stress; Disorders; Therapies; Attitudes; Social influence
- **Sociology**: Indian society; Social change and development in India
- **Anthropology**: Human evolution; Prehistoric archaeology; Social and cultural anthropology; Fieldwork; Tribes of India
- **Home Science**: Nutrition; Human development; Fabric and apparel; Resource management; Extension
- **Physical Education (Yoga, Sports)**: Sports management; Yoga; Nutrition; Testing; Fitness; Physiology and biomechanics; Sports psychology; Training
- **Mass Media / Mass Communication**: Communication; Journalism; Print; Radio; TV; Cinema; New media; Advertising
- **Sanskrit**: Comprehension; Grammar (sandhi, samasa, karaka); Prescribed texts; History of literature
- **Knowledge Traditions and Practices of India**: Language and literature; Arts; Science; Mathematics; Medicine; Metallurgy; Agriculture; Trade
- **Fine Arts / Visual Arts / Commercial Arts**: Miniature painting schools; The Bengal School; Modern Indian art
- **Performing Arts (Dance, Drama, Music)**: Music terms; Hindustani and Carnatic music; Classical and folk dance; Theatre

### III: General
- **General Aptitude Test**: General knowledge; Current affairs; Mental ability; Numerical ability; Quantitative reasoning; Logical reasoning

### IV: Management and law entrance
- **Quantitative Ability**: Arithmetic; Algebra; Geometry and mensuration; Number system; Modern mathematics; Data sufficiency
- **Verbal Ability and Reading Comprehension**: Reading comprehension; Para jumbles; Para summary; Odd sentence out; Sentence completion; Grammar and usage; Vocabulary
- **Data Interpretation**: Tables; Bar and line graphs; Pie charts; Caselets; Mixed charts
- **Logical Reasoning**: Arrangements; Puzzles; Syllogisms; Blood relations and directions; Sets and Venn diagrams; Critical reasoning; Series and coding
- **Legal Reasoning**: Legal principles and facts; Legal knowledge; Constitutional law; Contract law; Law of torts; Criminal law
- **Current Affairs and General Knowledge**: Current affairs; India and the world; Polity; Economy; History and culture; Science and technology; Static GK

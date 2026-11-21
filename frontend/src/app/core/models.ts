// The shapes of the data the API sends and receives. They match the backend's schemas.

export interface Branding {
  display_name: string;
  primary_color: string;
  /** The text colour to use on white, chosen by the admin or suggested from the brand colour. */
  text_color?: string;
  logo_url: string | null;
}

/** What an institute chose to show everyone. */
export interface InstituteProfile {
  description: string;
  city: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  exam_categories: string[];
}

/** One screen the institute can show, as students see it: built features only. */
export interface PublicFeature {
  key: string;
  group: string;
  label: string;
  enabled: boolean;
  /** The menu icon, from the admin's choice. Older saved screens may have none, so students fall back to a plain list icon. */
  icon?: string;
}

/** One row on the admin's Features & labels page: every feature, built or planned. */
/** One word on the institute's word list. */
export interface WordEntry {
  id: string;
  /** A word, or an idiom. Entries saved before idioms existed are words. */
  kind?: 'word' | 'idiom';
  word: string;
  meaning: string;
  example: string;
}

/** One day's pack in Vocabulary or Idioms, and the days either side of it for the calendar. */
export interface VocabPack {
  packs: number;
  today: { pack: number; items: { word: string; meaning: string; example: string }[] } | null;
  days: { date: string; pack: number; count: number }[];
}

export interface VocabQuestion {
  word: string;
  options: string[];
}

export interface VocabMarked {
  score: number;
  total: number;
  results: { word: string; given: number | null; answer: number; right: boolean; meaning: string }[];
}

/** The word a student sees today: null when the institute has nothing to show. */
export interface MyWordOfDay {
  word: { word: string; meaning: string; example: string } | null;
}

/** A student's oranges for today and their streak. Null when the institute has them switched off. */
export interface Oranges {
  collected_today: number;
  collected_total: number;
  target: number;
  days_strong: number;
}

export interface MyOranges {
  oranges: Oranges | null;
}

/** One row of the leaderboard: a student's rank, first name and last initial, and their oranges. */
export interface LeaderRow {
  rank: number;
  name: string;
  oranges: number;
  me: boolean;
}

export interface Leaderboard {
  days: number;
  top: LeaderRow[];
  me: LeaderRow | null;
}

export interface MyLeaderboard {
  leaderboard: Leaderboard | null;
}

/** Yesterday's winners: the top students by oranges on the given day, and whether the student was one of them. */
export interface YesterdayWinners {
  day: string;
  top: LeaderRow[];
  me_in_top: boolean;
}

export interface MyYesterdayWinners {
  yesterday_winners: YesterdayWinners | null;
}

/** How a kind of release is added: one at a time by the admin (self), or in a queue (bulk). */
export interface ReleaseSchedule {
  mode: 'self' | 'queue';
  start: string | null;
}

/** One release: a passage a student sees on a date (a day for Daily RC, the week from it for Weekly DILR). */
export interface Release {
  id: string;
  kind: 'daily_rc' | 'weekly_dilr';
  passage_id: string;
  title: string;
  date: string;
}

export interface ReleaseList {
  kind: 'daily_rc' | 'weekly_dilr';
  schedule: ReleaseSchedule;
  items: Release[];
}

/** A passage a student can read today, with the date it was released. */
export interface TodayPassage {
  id: string;
  title: string;
  text: string;
  date: string;
}

export interface TodayReleases {
  daily_rc: TodayPassage | null;
  weekly_dilr: TodayPassage | null;
}

/** A topic a student can practise, with how many published questions it has. */
export interface TopicCount {
  name: string;
  count: number;
}

export interface TopicSubject {
  id: string;
  name: string;
  section: string;
  topics: TopicCount[];
}

export interface TopicTestsOverview {
  enrolled: boolean;
  subjects: TopicSubject[];
}

export interface MyTopicTests {
  topic_tests: TopicTestsOverview | null;
}

export interface FeatureRow {
  key: string;
  group: string;
  default_label: string;
  built: boolean;
  enabled: boolean;
  label: string;
  icon?: string;
  position: number;
}

export interface TenantInfo {
  slug: string;
  name: string;
  branding: Branding;
  profile?: InstituteProfile;
  features?: PublicFeature[];
  /** The icon for each menu heading (heading name to icon name). */
  menu_headings?: Record<string, string>;
  /** The colour of the menu icons: a hex colour from the recommended list. */
  menu_icon_colour?: string;
}

/** The institute admin's My institute page. */
export interface MyInstitute {
  slug: string;
  name: string;
  primary_color: string;
  text_color: string;
  logo_url: string | null;
  plan: string;
  profile: InstituteProfile;
  admin: { email: string; first_name: string; last_name: string; mobile: string; avatar_url: string };
}

export interface Course {
  id: string;
  name: string;
  fee: number;
}

export type Access =
  | { type: 'unlimited' }
  | { type: 'days'; days: number }
  | { type: 'until_date'; until: string };

export interface AdminCourse extends Course {
  /** The subjects this course covers, as ids from the fixed subject list. */
  papers: string[];
  access: Access;
  active: boolean;
  created_at: string;
}

export interface RegistrationForm {
  email: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  mobile: string;
  whatsapp_same_as_mobile: boolean;
  whatsapp: string;
  address: string;
  city: string;
  pin_code: string;
  /** The courses the student chose (one or more). */
  course_ids: string[];
}

export type RegistrationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Registration {
  email: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  mobile: string;
  whatsapp: string;
  address: string;
  city: string;
  pin_code: string;
  /** The first course chosen, kept for anything that reads a single course. */
  course_id: string;
  course_name: string;
  /** Every course the student chose. A registration made with one course shows it here as a list of one. */
  course_ids: string[];
  course_names: string[];
  status: RegistrationStatus;
  created_at: string;
  decided_by: string;
  decided_at: string;
  reason: string;
  avatar_url?: string;
  edited_by?: string;
  edited_at?: string;
  previous_email?: string;
}

/** Only the fields that changed are sent. */
export type RegistrationEdit = Partial<RegistrationForm>;

export type DecisionAction = 'approve' | 'reject' | 'suspend' | 'reactivate';

export interface DecisionResult {
  registration: Registration;
  email_sent: boolean;
}

export type CodeStatus = 'code_sent' | 'not_registered' | 'pending' | 'rejected' | 'suspended';

export interface CodeResult {
  status: CodeStatus;
  message: string;
}

export interface Member {
  email: string;
  first_name: string;
  last_name: string;
  role: 'student' | 'tenant_admin' | 'platform_admin' | 'parent';
  status: string;
  /** A short-lived link to their photo, or empty. */
  avatar_url?: string;
}

export interface Session {
  access_token: string;
  token_type: string;
  expires_in: number;
  tenant: string;
  member: Member;
}

/** What the API's errors look like once the frontend has tidied them up. */
export interface ApiError {
  status: number;
  detail: string;
  /** For the registration form: a message for each field that has a mistake. */
  errors?: Record<string, string>;
  /** For "too many requests": how many seconds to wait. */
  retryAfter?: number;
  /** The whole answer the server sent, for the few errors that carry more than a message. */
  body?: Record<string, unknown>;
}

/** The institute's admin, as the platform admin sees them. */
export interface InstituteAdmin {
  email: string;
  first_name: string;
  last_name: string;
  status: string;
}

/** An institute as the platform admin sees it. */
export interface Institute {
  slug: string;
  name: string;
  status: 'active' | 'suspended';
  primary_color: string;
  /** Where the logo is asked for, relative to the API, or null when there is none. */
  logo_url: string | null;
  created_at: string;
  admin: InstituteAdmin | null;
  /** free, popular or premium (an older institute may still say paid, which counts as premium). */
  plan?: string;
  /** What the institute shows everyone. Read only here. */
  profile?: InstituteProfile;
  counts?: { students: number; parents: number; pending: number; courses: number };
}

export interface InstituteResult {
  institute: Institute;
  /** Whether the new admin's welcome email went out. null when no new admin was made. */
  new_admin_notified: boolean | null;
}

export interface InstituteCreate {
  slug: string;
  name: string;
  admin_name: string;
  admin_email: string;
  primary_color: string;
}

/** Only the fields that changed are sent. */
export interface InstituteUpdate {
  name?: string;
  primary_color?: string;
  status?: string;
  admin_name?: string;
  admin_email?: string;
  plan?: string;
}


// ---- Course files and access ----

export interface CourseFile {
  id: string;
  course_id: string;
  title: string;
  kind: 'pdf' | 'mp4';
  content_type: string;
  size: number | null;
  status: 'uploading' | 'ready';
  created_at: string;
  /** Whether the study helper can use this PDF's text: 'ready', 'unreadable', or null (not checked, or not a PDF). */
  ai_status?: 'ready' | 'unreadable' | null;
  ai_pages?: number | null;
  ai_passages?: number | null;
  ai_note?: string | null;
}

/** A signed form from the API: the file is posted to S3 with these fields, the file itself last. */
export interface UploadForm {
  url: string;
  fields: Record<string, string>;
}

export interface FileStart {
  file: CourseFile;
  upload: UploadForm;
}

export interface CourseAccess {
  course_id: string;
  course_name: string;
  granted_at: string;
  granted_by: string;
  source: string;
  /** null means the access never ends. */
  expires_at: string | null;
  active: boolean;
}

export interface FileLink {
  url: string;
  expires_in: number;
  content_type: string;
  title: string;
}

// ---- Question bank ----

export interface Paper {
  id: string;
  name: string;
  section: string;
  stream: string;
  topics: string[];
}

export interface QuestionOption {
  text: string;
  why: string;
}

/** A picture on a question or an option. The link is short-lived, so it is fetched fresh with the question. */
export interface Picture {
  id: string;
  url: string;
}

export const PICTURE_SLOTS = ['question', 'A', 'B', 'C', 'D'] as const;

/** The right answer to a fill-in question: text (any accepted spelling) or a number (numbers are strings, to stay exact). */
export type FillInAnswer =
  | { type: 'text'; accepted: string[] }
  | { type: 'number'; value: string; tolerance: string };

export interface Question {
  id: string;
  paper: string;
  topic: string;
  text: string;
  /** Multiple choice (4 options) or fill in (one box the student types the answer into). */
  kind: 'mcq' | 'fill_in';
  options: QuestionOption[];
  correct: number | null;
  answer?: FillInAnswer | null;
  explanation?: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  status: 'draft' | 'published';
  created_at: string;
  images: Record<string, Picture>;
  /** The id of the reading passage this question belongs to, and its text. Questions that share one are shown together. */
  passage?: string | null;
  passage_text?: string | null;
  edited_by?: string | null;
  edited_at?: string | null;
}

/** A reading passage, saved once and shared by the questions that use it. */
export interface Passage {
  id: string;
  title: string;
  text: string;
  /** How many questions use it. */
  questions: number;
}

/** What the admin sends. For an edit, only what changed. */
export type QuestionInput = Partial<Omit<Question, 'id' | 'created_at' | 'edited_by' | 'edited_at' | 'images' | 'answer' | 'correct' | 'passage' | 'passage_text'>> & {
  /** The passage's text. Questions with the same text share one passage. An empty string takes the passage off. */
  passage_text?: string;
  correct?: number | null;
  answer?: { type: 'text'; accepted: string[] } | { type: 'number'; value: string; tolerance: string };
  /** Picture ids by position. null takes a picture off. */
  images?: Record<string, string | null>;
};

/** What the server says about an uploaded Excel file of questions. Nothing is saved until the admin confirms. */
export interface QuestionImport {
  confirmed: boolean;
  ready: { row: number; paper: string; topic: string; text: string; pictures: number; passage?: string | null }[];
  /** How many passages from the Passages sheet would be saved for the first time. */
  new_passages?: number;
  problems: { row: number; errors: Record<string, string> }[];
  duplicates: { row: number; text: string }[];
  imported: number;
}

// ---- Tests built from the question bank ----

export interface AutoRule {
  paper: string;
  topic: string;
  difficulty: '' | 'easy' | 'medium' | 'hard';
  count: number | null;
}

export interface TestSummary {
  id: string;
  title: string;
  description: string;
  /** What the test is for. Older tests have none, so they count as a test. */
  kind?: TestKind;
  /** The free mock. */
  free?: boolean;
  /** The year of a past paper. */
  year?: number | null;
  /** India time, "2027-01-31T23:59", or null for no limit. */
  start_at: string | null;
  end_at: string | null;
  duration_minutes: number;
  max_attempts: number;
  pass_percentage: number;
  /** Marks are text with up to 2 decimals, for example "3", "-1" or "0.25". */
  marks_correct: string;
  marks_incorrect: string;
  show_answers: boolean;
  /** Ids of the courses the test is assigned to. */
  courses: string[];
  mode: 'manual' | 'auto';
  rules: { paper: string; topic: string; difficulty: string; count: number }[];
  question_ids: string[];
  status: 'draft' | 'published';
  question_count: number;
  total_marks: string;
  /** How many attempts students have started at this test. */
  attempt_count: number;
}

/** What a test is for. Students see each kind on its own page. */
export type TestKind = 'test' | 'sectional' | 'mock' | 'past_paper';

export interface TestDetail extends TestSummary {
  questions: Question[];
}

export interface TestInput {
  title?: string;
  description?: string;
  /** What the test is for: a normal test, a sectional, or a full mock. */
  kind?: TestKind;
  /** Only a mock can be free. */
  free?: boolean;
  /** The year of a past paper. Other kinds have none. */
  year?: number | null;
  start_at?: string;
  end_at?: string;
  duration_minutes?: number;
  max_attempts?: number;
  pass_percentage?: number;
  marks_correct?: string;
  marks_incorrect?: string;
  show_answers?: boolean;
  courses?: string[];
  mode?: 'manual' | 'auto';
  rules?: { paper: string; topic: string; difficulty: string; count: number }[];
  question_ids?: string[];
  status?: 'draft' | 'published';
}

export interface AutoPickResult {
  question_ids: string[];
  picked: number;
  added_for_passages: number;
  short: { rule: number; wanted: number; found: number }[];
}

// ---- A student taking tests ----

export interface AttemptLine {
  number: number;
  status: 'in_progress' | 'submitted';
  started_at: string;
  submitted_at?: string | null;
  marks?: string;
  total_marks?: string;
  percentage?: string;
  passed?: boolean;
  auto_submitted?: boolean;
}

/** One personal interview question, as the student sees it. */
export interface PiQuestion {
  id: string;
  topic: string;
  subtopic: string;
  question: string;
  hint: string;
  done: boolean;
}

/** The student's question bank: the questions in list order, the counts, and the topics to filter by. */
export interface PiBankView {
  questions: PiQuestion[];
  counts: { new: number; done: number; total: number };
  topics: { name: string; subtopics: string[] }[];
}

/** One question as the admin keeps it. */
export interface PiQuestionRow {
  id: string;
  topic: string;
  subtopic: string;
  question: string;
  hint: string;
  added_at: number;
}

/** What the admin sends when adding a question. */
export interface PiQuestionInput {
  topic: string;
  subtopic: string;
  question: string;
  hint: string;
}

/** One eligibility rule. The value depends on the type: a date, a percent, a year, or nothing (twelfth_maths). */
export type CollegeRuleType =
  | 'dob_on_or_after'
  | 'min_tenth_percent'
  | 'min_twelfth_percent'
  | 'tenth_year_or_later'
  | 'twelfth_year_or_later'
  | 'twelfth_maths';

export interface CollegeRule {
  type: CollegeRuleType;
  value: string | number | boolean | null;
}

/** A college with its eligibility rules, as the student sees them. */
export interface EligibilityCollege {
  id: string;
  name: string;
  rules: CollegeRule[];
}

/** A college as the admin keeps it. */
export interface AdminCollege extends EligibilityCollege {
  created_at: string;
  updated_at: string;
  added_at: number;
}

/** One cutoff row. Seats, applicants and qualified are null when the admin has not entered them. */
export interface CutoffRow {
  id: string;
  year: number;
  category: string;
  section: string;
  cutoff: number;
  seats: number | null;
  applicants: number | null;
  qualified: number | null;
}

/** One college's cutoffs for one year, with the years that have data. */
export interface CutoffView {
  college: { id: string; name: string };
  years: number[];
  year: number | null;
  rows: CutoffRow[];
}

/** The stages a student can pick for a college application, in order. */
export type ApplicationStatus = 'planning' | 'applied' | 'shortlisted' | 'accepted' | 'rejected' | 'withdrawn';

/** One college application the student is tracking. */
export interface Application {
  id: string;
  college: string;
  programme: string;
  status: ApplicationStatus;
  deadline: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** What the student sends when adding or changing an application. */
export interface ApplicationInput {
  college: string;
  programme: string;
  status: ApplicationStatus;
  deadline: string | null;
  notes: string;
}

/** Analyse for one kind of test: the summary, the score trend, and accuracy by subject and topic. */
export interface AnalyseView {
  summary: { attempts: number; average: string | null; best: string | null };
  trend: { title: string; percentage: string; started_at: string }[];
  subjects: {
    id: string;
    name: string;
    correct: number;
    questions: number;
    accuracy: string;
    topics: { topic: string; correct: number; wrong: number; unanswered: number; questions: number; accuracy: string }[];
  }[];
  /** The subjects the student has attempts in, before any filter, so the filter can offer them. */
  subject_options: { id: string; name: string }[];
  filters: { subject: string | null; start: string | null; end: string | null };
}

/** The Analyse filters: a subject, and a start and end date for when the attempt began. Blank means no filter. */
export interface AnalyseFilters {
  subject?: string;
  start?: string;
  end?: string;
}

/** SWOT from the last ten sectional and mock attempts. Needs a few attempts before it judges. */
export interface SwotView {
  attempts: number;
  enough: boolean;
  strengths: SwotTopic[];
  weaknesses: SwotTopic[];
}

export interface SwotTopic {
  subject: string;
  topic: string;
  accuracy: string;
  questions: number;
}

export interface PastPaperCard {
  id: string;
  title: string;
  year: number | null;
  question_count: number;
}

export interface SyllabusTable {
  years: number[];
  rows: { paper: string; topic: string; counts: Record<string, number>; total: number }[];
}

export interface FilterTopicGroup {
  paper: string;
  topics: { name: string; count: number }[];
}

export interface StudentTestCard {
  id: string;
  kind?: TestKind;
  /** The free mock, shown first on the Mocks page. */
  free?: boolean;
  /** A practice test made from a weak topic, only for this student. */
  practice?: boolean;
  /** Who made a practice test, when it was not the student (a parent). */
  set_by?: string | null;
  title: string;
  description: string;
  start_at: string | null;
  end_at: string | null;
  duration_minutes: number;
  max_attempts: number;
  pass_percentage: number;
  marks_correct: string;
  marks_incorrect: string;
  show_answers: boolean;
  question_count: number;
  total_marks: string;
  state: 'upcoming' | 'open' | 'ended';
  /** The window has closed and the student never took the test. */
  overdue?: boolean;
  /** Minutes until an open test closes (null if it never closes). */
  minutes_left?: number | null;
  /** Minutes until an upcoming test opens. */
  opens_in_minutes?: number | null;
  attempts_used: number;
  attempts_left: number;
  /** The number of the attempt in progress, if there is one. */
  in_progress: number | null;
  best: { marks: string; percentage: string; passed: boolean } | null;
  attempts: AttemptLine[];
}

/** A question as a student sees it during a test: no correct answer and no reasons. */
export interface AttemptQuestion {
  id: string;
  kind: 'mcq' | 'fill_in';
  text: string;
  options: { text: string }[];
  /** Picture links by position (question, A to D). */
  images: Record<string, string>;
  passage: string | null;
  passage_text: string | null;
}

export interface AttemptView {
  status: 'in_progress';
  test_id: string;
  number: number;
  title: string;
  started_at: string;
  duration_minutes: number;
  remaining_seconds: number;
  questions: AttemptQuestion[];
  /** Saved answers: an option number for multiple choice, typed text for fill-in. */
  answers: Record<string, number | string>;
}

export interface ReviewItem extends AttemptQuestion {
  result: 'c' | 'w' | 'u';
  given: number | string | null;
  correct: number | null;
  reasons: string[];
  answer: string | null;
  explanation: string | null;
}

export interface AttemptResult {
  status: 'submitted';
  test_id: string;
  number: number;
  title: string;
  started_at: string;
  submitted_at: string | null;
  auto_submitted: boolean;
  correct: number;
  wrong: number;
  unanswered: number;
  marks: string;
  total_marks: string;
  percentage: string;
  passed: boolean;
  pass_percentage: number;
  marks_correct: string;
  marks_incorrect: string;
  show_answers: boolean;
  review: ReviewItem[] | null;
}

// ---- The admin's view of students' results ----

export interface ResultRow {
  email: string;
  name: string;
  number: number;
  status: 'in_progress' | 'submitted';
  started_at: string;
  submitted_at: string | null;
  auto_submitted: boolean;
  marks?: string;
  total_marks?: string;
  percentage?: string;
  passed?: boolean;
  correct?: number;
  wrong?: number;
  unanswered?: number;
  /** How long the attempt took, in seconds. */
  seconds?: number | null;
}

export interface QuestionStat {
  id: string;
  text: string;
  kind: 'mcq' | 'fill_in';
  topic: string;
  difficulty: string | null;
  /** Students who got this question in a finished attempt, and how many answered it and got it right. */
  faced: number;
  answered: number;
  correct: number;
  percent_correct: string | null;
  most_chosen_wrong: { option: number; count: number; text: string } | null;
}

export interface ResultsSummary {
  students: number;
  attempts: number;
  submitted: number;
  in_progress: number;
  average: string | null;
  highest: string | null;
  lowest: string | null;
  passed: number;
  pass_rate: string | null;
  /** How many finished attempts scored 0-9%, 10-19%, and so on up to 90-100%. */
  distribution: number[];
}

export interface TestResults {
  test: { id: string; title: string; question_count: number; pass_percentage: number; marks_correct: string; marks_incorrect: string };
  summary: ResultsSummary;
  attempts: ResultRow[];
  questions: QuestionStat[];
}

/** One student's attempt as the admin sees it. A finished one carries the whole review. */
export type AdminAttempt =
  | (AttemptResult & { student: { email: string; name: string } })
  | { status: 'in_progress'; test_id: string; number: number; title: string; started_at: string; student: { email: string; name: string }; answered: number; questions: number };

// ---- A student's results across tests ----

export interface TopicResult {
  topic: string;
  correct: number;
  wrong: number;
  unanswered: number;
  questions: number;
  /** Percent of the questions faced that were answered correctly. */
  accuracy: string;
}

export interface SubjectResult {
  id: string;
  name: string;
  correct: number;
  questions: number;
  accuracy: string;
  topics: TopicResult[];
}

export interface MyResultRow {
  test_id: string;
  title: string;
  number: number;
  started_at: string;
  submitted_at: string | null;
  marks: string;
  total_marks: string;
  percentage: string;
  passed: boolean;
  auto_submitted: boolean;
  show_answers: boolean;
}

export interface MyResults {
  summary: { tests_taken: number; attempts: number; in_progress: number; average: string | null; best: string | null; tests_passed: number };
  /** The last attempts, oldest first. */
  trend: { title: string; number: number; percentage: string; passed: boolean; started_at: string }[];
  /** Every finished attempt, newest first. */
  attempts: MyResultRow[];
  /** Weakest first. */
  subjects: SubjectResult[];
}

/** What giving a student all the courses they chose did. */
export interface GrantRequestedResult {
  granted: CourseAccess[];
  /** Chosen courses that no longer exist, by name. */
  skipped: string[];
}

// ---- Coursework: a course's plan of subjects, topics and sub-topics ----

export type WorkMaterial =
  | { type: 'file'; file_id: string; title: string; kind: 'pdf' | 'mp4'; size: number | null }
  | { type: 'link'; url: string; title: string };

export interface WorkSubtopic {
  id: string;
  title: string;
  note: string;
  /** Its own finish-by date (YYYY-MM-DD), if any. */
  due: string | null;
  /** The date that counts: its own, else its topic's, else its subject's. */
  effective_due: string | null;
  due_from: 'subtopic' | 'topic' | 'subject' | null;
  status: 'draft' | 'published';
  materials: WorkMaterial[];
}

export interface WorkTopic {
  id: string;
  title: string;
  due: string | null;
  subtopics: WorkSubtopic[];
}

export interface WorkSubject {
  paper_id: string;
  name: string;
  due: string | null;
  /** False for a subject taken off the course that still has a plan. */
  in_course: boolean;
  topics: WorkTopic[];
  /** The usual topics of this subject that are not in the plan yet. */
  topic_options: string[];
}

export interface CourseworkPlan {
  course: { id: string; name: string };
  counts: { topics: number; subtopics: number; published: number; with_dates: number };
  subjects: WorkSubject[];
}

/** What the admin sends when adding or changing a sub-topic. */
export interface WorkSubtopicInput {
  title?: string;
  note?: string;
  due?: string | null;
  status?: 'draft' | 'published';
  materials?: ({ type: 'file'; file_id: string } | { type: 'link'; url: string; title: string })[];
}

/** What copying coursework from another course did. */
export interface CopyResult {
  topics_added: number;
  subtopics_added: number;
  subtopics_skipped: number;
  files_linked: number;
  /** Subjects this course does not have, so their topics were left out. */
  subjects_skipped: string[];
}

export interface CopyChoice {
  source_course_id: string;
  topic_ids: string[];
  subtopic_ids: string[];
  keep_dates: boolean;
  keep_status: boolean;
}

// ---- Coursework (student) ----

export type StudentMaterial =
  | { type: 'file'; file_id: string; title: string; kind: 'pdf' | 'mp4'; size: number | null }
  | { type: 'link'; url: string; title: string };

export interface Progress {
  total: number;
  done: number;
}

export interface StudentSubtopic {
  id: string;
  /** Live classes tagged to this sub-topic, its topic or its subject. */
  live_classes?: StudentLiveClass[];
  title: string;
  note: string;
  due: string | null;
  due_from: 'subtopic' | 'topic' | 'subject' | null;
  /** Days until the date; negative once it has passed. */
  days_left: number | null;
  overdue: boolean;
  done: boolean;
  done_at: string | null;
  materials: StudentMaterial[];
  /** In a course the student isn't enrolled in, and not the free sample: shown by title only. */
  locked?: boolean;
  /** The free sample sub-topic, open to everyone. */
  free?: boolean;
}

export interface StudentTopic {
  id: string;
  title: string;
  due: string | null;
  progress: Progress;
  subtopics: StudentSubtopic[];
}

export interface StudentSubject {
  paper_id: string;
  name: string;
  due: string | null;
  progress: Progress;
  topics: StudentTopic[];
}

export interface StudentCourse {
  id: string;
  name: string;
  /** The student isn't enrolled: its content is locked apart from the free sample. */
  locked?: boolean;
  progress: Progress;
  overdue: number;
  subjects: StudentSubject[];
}

export interface StudentCoursework {
  summary: { total: number; done: number; left: number; overdue: number; this_week: number };
  courses: StudentCourse[];
}

export interface StudentLiveClass {
  id: string;
  title: string;
  held_on: string;
  held_time: string;
  description: string;
  materials: StudentMaterial[];
}

export interface StudentLiveCourse {
  course_id: string;
  course_name: string;
  classes: StudentLiveClass[];
}

// ---- Admin home ----

export interface AdminHomeCounts {
  pending: number;
  students: number;
  courses: number;
  tests_open: number;
  questions: { published: number; draft: number };
}

/** The saved answer to "who is behind". students is null until it has been worked out once; fresh is false when it is over 15 minutes old. */
export interface AdminBehind {
  students: number | null;
  courses: number | null;
  as_of?: string | null;
  fresh?: boolean;
}

// ---- Progress (admin) ----

export type ProgressStatus = 'behind' | 'not_started' | 'on_track';

export interface ProgressRow {
  email: string;
  name: string;
  status: ProgressStatus;
  cw_done: number;
  cw_total: number;
  cw_overdue: number;
  tests_taken: number;
  tests_available: number;
  tests_overdue: number;
  avg_percent: number | null;
  /** Items overdue: coursework and tests together. */
  overdue: number;
  last_active: string | null;
  avatar_url?: string;
}

export interface CourseProgress {
  course: { id: string; name: string };
  summary: { students: number; behind: number; not_started: number; on_track: number; subtopics: number; tests: number };
  students: ProgressRow[];
  /** When this page was worked out, and whether that was within the last 15 minutes. The page is saved, so it opens at once. */
  as_of?: string | null;
  fresh?: boolean;
}

export interface StuckItem {
  id: string;
  title: string;
  topic: string;
  subject: string;
  due: string | null;
  done: number;
  students: number;
  percent: number;
}

export interface CourseStuck {
  course: { id: string; name: string };
  students: number;
  subtopics: StuckItem[];
  as_of?: string | null;
  fresh?: boolean;
}

export interface StudentProgress {
  course: { id: string; name: string };
  student: { email: string; name: string; avatar_url?: string };
  row: ProgressRow;
  coursework: StudentCourse | null;
  overdue_items: { title: string; topic: string; subject: string; due: string; days_late: number }[];
  tests: { id: string; title: string; state: 'upcoming' | 'open' | 'ended'; overdue: boolean; attempts_used: number; max_attempts: number; best: { marks: string; percentage: string; passed: boolean } | null }[];
}

// ---- Notices and announcements ----

export type NoticeKind = 'info' | 'action';
export type NoticeLinkTo = 'coursework' | 'tests' | 'results';

export interface Notice {
  id: string;
  title: string;
  message: string;
  kind: NoticeKind;
  link: { to: NoticeLinkTo; label: string } | null;
  source: 'manual' | 'reminder';
  created_at: string;
  read_at: string | null;
}

export interface MyNotices {
  unread: number;
  action_unread: number;
  notices: Notice[];
}

export interface AnnouncementInput {
  title: string;
  message: string;
  kind: NoticeKind;
  link: NoticeLinkTo | null;
  audience: { type: 'all' } | { type: 'course'; course_id: string } | { type: 'students'; emails: string[] };
  send_email: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  kind: NoticeKind;
  link: { to: NoticeLinkTo; label: string } | null;
  source: 'manual' | 'reminder';
  audience: { type: 'all' | 'course' | 'students'; course_name?: string; count?: number };
  recipients: number;
  email_requested: boolean;
  emailed: number;
  email_failed: number;
  created_at: string;
  created_by: string;
}

export interface ReminderResult {
  reminded: number;
  skipped: number;
  not_behind: number;
  emailed: number;
  email_failed: number;
}

// ---- Importing students (admin) ----

export interface ImportRow {
  row: number;
  email: string;
  name: string;
  courses: string[];
  status: 'ready' | 'skipped' | 'error' | 'created';
  message: string;
  /** The mistakes in this row, by column heading. */
  problems: Record<string, string>;
  /** The row names a photo file. */
  photo?: boolean;
}

export interface StudentImport {
  summary: { total: number; ready: number; skipped: number; errors: number; created?: number };
  rows: ImportRow[];
  confirmed: boolean;
  batch: string | null;
  created: string[];
}

export interface WelcomeResult {
  sent: number;
  failed: number;
  skipped: number;
}

// ---- Photos ----

/** What registering can send back when the student said they have a photo. */
export interface RegistrationReceived {
  status: string;
  message: string;
  photo_upload?: UploadForm;
  photo_token?: string;
}

export interface StudentPhotoStart {
  id: string;
  name: string;
  upload: UploadForm;
}

// ---- Live classes ----

export interface LiveClass {
  id: string;
  /** Where in the course plan it sits: a subject, and optionally a topic and a sub-topic. */
  paper_id?: string;
  topic_id?: string;
  subtopic_id?: string;
  /** The names, like "Quant › Percentages › Concepts". */
  place?: string;
  title: string;
  /** YYYY-MM-DD */
  held_on: string;
  /** HH:MM, or empty. */
  held_time: string;
  description: string;
  status: 'draft' | 'published';
  materials: WorkMaterial[];
}

export interface LiveClassInput {
  paper_id?: string;
  topic_id?: string;
  subtopic_id?: string;
  title?: string;
  held_on?: string;
  held_time?: string;
  description?: string;
  status?: 'draft' | 'published';
  materials?: ({ type: 'file'; file_id: string } | { type: 'link'; url: string; title: string })[];
}

export interface LiveImportRow {
  row: number;
  title: string;
  held_on: string;
  files: number;
  status: 'ready' | 'skipped' | 'error' | 'created';
  message: string;
  problems: Record<string, string>;
}

export interface LiveImport {
  summary: { total: number; ready: number; skipped: number; errors: number; created?: number };
  rows: LiveImportRow[];
  confirmed: boolean;
}


// ---- Parents ----

export interface AdminParent {
  email: string;
  name: string;
  mobile: string;
  children: { email: string; name: string }[];
  created_at: string;
}

export interface ParentInput {
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  student_email: string;
}

export interface ParentImportRow {
  row: number;
  email: string;
  name: string;
  children: string[];
  status: 'ready' | 'skipped' | 'error' | 'created';
  message: string;
  problems: Record<string, string>;
}

export interface ParentImport {
  summary: { total: number; ready: number; skipped: number; errors: number; created?: number; linked?: number; emailed?: number };
  rows: ParentImportRow[];
  confirmed: boolean;
}

/** A parent's view of one child in one course (the same numbers the admin sees on the Progress page). */
export interface ChildCourse {
  id: string;
  name: string;
  row: ProgressRow;
}

export interface ChildSummary {
  email: string;
  name: string;
  avatar_url: string;
  status: string;
  courses: ChildCourse[];
}

export interface ChildDetail {
  student: { email: string; name: string; avatar_url: string };
  courses: StudentProgress[];
  batches?: MyBatch[];
  /** The child's practice tests, made by the child or set by a parent. */
  practice: { id: string; title: string; question_count: number; attempts_used: number; best: { marks: string; percentage: string; passed: boolean } | null; set_by_parent: boolean; created_at: string }[];
  results: { summary: MyResults['summary']; trend: MyResults['trend']; subjects: SubjectResult[] };
}

/** The form of a first-time sign-up. The institute fields are only used when kind is 'institute'. */
export interface SignupForm {
  kind: 'institute' | 'student' | 'parent';
  email: string;
  name: string;
  institute_name?: string;
  slug?: string;
  primary_color?: string;
}

export interface FreeState {
  picked: string | null;
  courses: { name: string; subjects: { name: string; topics: { title: string; subtopics: string[] }[] }[] }[];
}

export interface FreeSample {
  course: string;
  subject: string;
  topic: string;
  title: string;
  note: string;
  links: { title: string; url: string }[];
  files: { file_id: string; title: string; kind: string; size: number | null }[];
}

/** A student's or parent's own profile (the part they keep themselves). Fields of the other role are absent. */
export interface MyProfile {
  role: 'student' | 'parent';
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string;
  mobile: string;
  birth_date?: string;
  target_exams?: string[];
  exam_date?: string;
  weekly_goal_hours?: number;
  notify?: { announcements: boolean; tests: boolean; live_classes: boolean };
  relation?: string;
  summary?: string;
  consent?: boolean;
  deletion_requested: boolean;
  linked: { name: string; email: string }[];
}

/** A batch (a cohort) as the admin sees it. The students list is only in the detail. */
export interface Batch {
  id: string;
  name: string;
  status: 'active' | 'archived';
  course_ids: string[];
  course_names: string[];
  start_date: string;
  end_date: string;
  seat_limit: number | null;
  seats_left: number | null;
  enrolled: number;
  faculty: string;
  schedule: string;
  students?: { email: string; name: string; status: string }[];
}

/** A batch as the student or a parent sees it: no other students. */
export interface MyBatch {
  id: string;
  name: string;
  course_names: string[];
  start_date: string;
  end_date: string;
  faculty: string;
  schedule: string;
}

/** A student at a glance, for the admin's side drawer. */
export interface StudentQuick {
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  mobile: string;
  city: string;
  created_at: string;
  avatar_url: string;
  target_exams: string[];
  exam_date: string;
  courses: { name: string; active: boolean; expires_at: string | null; source: string }[];
  batches: string[];
  parents: { name: string; email: string }[];
  deletion_requested: boolean;
}

/** One passage that answers a student's search: where it sits in the plan, the page, and a short snippet. */
export interface StudyHit {
  course_id: string;
  course: string;
  subject: string;
  topic: string;
  subtopic: string;
  file_id: string;
  file: string;
  page: number;
  snippet: string;
  score: number;
  /** The question's words (lowercase, no punctuation) that this passage contains. Shown in bold in the snippet. */
  matched: string[];
  coverage: number;
}

export interface StudySearch {
  query: string;
  hits: StudyHit[];
}

/** A cited passage the answer was written from. */
export interface StudyCitation {
  course_id: string;
  file_id: string;
  file: string;
  page: number;
  subtopic: string;
}

/** The answer step: an answer only when the notes clearly cover the question; the passages are always listed. */
export interface StudyAnswer {
  answered: boolean;
  answer: string | null;
  citations: StudyCitation[];
  hits: StudyHit[];
}

/** Where a logged passage is in the coursework, and the page to open it at. */
export interface AskLogSource {
  course_id: string;
  course: string;
  subject: string;
  topic: string;
  subtopic: string;
  file_id: string;
  file: string;
  page: number;
}

/** One question a student asked in Ask AI, as the admin sees it. The student's name and email appear only when asked for. */
export interface AskLogRow {
  id: string;
  created_at: string;
  question: string;
  best_coverage: number;
  matches: number;
  answered: boolean;
  sources: AskLogSource[];
  student_name?: string;
  student_email?: string;
}

export interface AskLog {
  rows: AskLogRow[];
}

/** One row of the Daily RC or Weekly DILR list: a past or current release, and whether the student has attempted it. */
export interface ReleaseHistoryRow {
  id: string;
  date: string;
  title: string;
  current: boolean;
  attempted: boolean;
  practice_id: string | null;
}

export interface ReleaseHistory {
  releases: ReleaseHistoryRow[];
}

/** One question in the Filter topics viewer. Options are shown with their reasons; the answer is there to check against. */
export interface ViewerOption {
  letter: string;
  text: string;
  why: string;
}

export interface ViewerQuestion {
  id: string;
  paper: string;
  topic: string;
  difficulty: string;
  text: string;
  years: number[];
  kind: 'mcq' | 'fill_in';
  options?: ViewerOption[];
  correct_letter?: string | null;
  answer?: string | string[] | null;
  explanation?: string | null;
}

export interface QuestionViewer {
  total: number;
  limit: number;
  questions: ViewerQuestion[];
  years: number[];
  difficulties: string[];
}

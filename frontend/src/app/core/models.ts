// The shapes of the data the API sends and receives. They match the backend's schemas.

export interface Branding {
  display_name: string;
  primary_color: string;
  logo_url: string | null;
}

export interface TenantInfo {
  slug: string;
  name: string;
  branding: Branding;
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
  role: 'student' | 'tenant_admin' | 'platform_admin';
  status: string;
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

export interface MyCourse {
  id: string;
  name: string;
  expires_at: string | null;
  files: CourseFile[];
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

export interface TestDetail extends TestSummary {
  questions: Question[];
}

export interface TestInput {
  title?: string;
  description?: string;
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

export interface StudentTestCard {
  id: string;
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

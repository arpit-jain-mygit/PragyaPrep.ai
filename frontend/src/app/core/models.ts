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
  /** The papers (subjects) this course covers, as ids from the fixed paper list. */
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
  course_id: string;
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
  course_id: string;
  course_name: string;
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
  /** The id of the reading passage this question belongs to. */
  passage?: string | null;
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
export type QuestionInput = Partial<Omit<Question, 'id' | 'created_at' | 'edited_by' | 'edited_at' | 'images' | 'answer' | 'correct' | 'passage'>> & {
  /** A passage id. An empty string takes the question off its passage. */
  passage?: string;
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

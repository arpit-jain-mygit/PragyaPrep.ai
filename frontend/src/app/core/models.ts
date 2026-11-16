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


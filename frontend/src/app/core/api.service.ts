import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Access,
  AdminCourse,
  ApiError,
  CourseAccess,
  CourseFile,
  CodeResult,
  Course,
  DecisionAction,
  DecisionResult,
  FileLink,
  FileStart,
  Institute,
  InstituteCreate,
  InstituteResult,
  InstituteUpdate,
  Member,
  MyCourse,
  Paper,
  Question,
  QuestionInput,
  Registration,
  RegistrationEdit,
  RegistrationForm,
  Session,
  TenantInfo,
  UploadForm,
} from './models';

/** Turn whatever went wrong into one simple shape the screens can show. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return { status: 0, detail: "We couldn't reach the server. Check your connection and try again." };
    }
    const body = error.error;
    let detail = 'Something went wrong. Please try again.';
    let errors: Record<string, string> | undefined;
    if (body && typeof body.detail === 'string') {
      detail = body.detail;
      errors = body.errors;
    } else if (error.status >= 500) {
      detail = 'Something went wrong on our side. Please try again in a few minutes.';
    }
    const retry = Number(error.headers?.get('Retry-After'));
    return { status: error.status, detail, errors, retryAfter: retry > 0 ? retry : undefined };
  }
  return { status: -1, detail: 'Something went wrong. Please try again.' };
}

/** Every call to the API goes through here. The interceptor adds the institute and the sign-in. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  private async call<T>(request: Promise<T>): Promise<T> {
    try {
      return await request;
    } catch (error) {
      throw toApiError(error);
    }
  }

  private get<T>(path: string, params?: Record<string, string>): Promise<T> {
    return this.call(firstValueFrom(this.http.get<T>(this.base + path, { params })));
  }

  private post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.call(firstValueFrom(this.http.post<T>(this.base + path, body)));
  }

  private delete(path: string): Promise<void> {
    return this.call(firstValueFrom(this.http.delete<void>(this.base + path)));
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return this.call(firstValueFrom(this.http.patch<T>(this.base + path, body)));
  }

  // ---- Public ----

  tenant(): Promise<TenantInfo> {
    return this.get('/api/tenant');
  }

  courses(): Promise<Course[]> {
    return this.get('/api/courses');
  }

  register(form: RegistrationForm): Promise<{ status: string; message: string }> {
    return this.post('/api/register', form);
  }

  // ---- Signing in ----

  requestCode(email: string): Promise<CodeResult> {
    return this.post('/api/auth/request-code', { email });
  }

  verifyCode(email: string, code: string): Promise<Session> {
    return this.post('/api/auth/verify-code', { email, code });
  }

  me(): Promise<Member> {
    return this.get('/api/auth/me');
  }

  // ---- Admin ----

  registrations(status: string): Promise<Registration[]> {
    return this.get('/api/admin/registrations', { status });
  }

  decide(action: DecisionAction, email: string, reason?: string): Promise<DecisionResult> {
    // The email goes in the address, so characters like + must be escaped.
    const path = `/api/admin/registrations/${encodeURIComponent(email)}/${action}`;
    return this.post(path, action === 'reject' ? { reason: reason ?? '' } : {});
  }

  editRegistration(email: string, changes: RegistrationEdit): Promise<DecisionResult> {
    return this.patch(`/api/admin/registrations/${encodeURIComponent(email)}`, changes);
  }

  adminCourses(): Promise<AdminCourse[]> {
    return this.get('/api/admin/courses');
  }

  addCourse(body: { name: string; fee: number; access: Access }): Promise<AdminCourse> {
    return this.post('/api/admin/courses', body);
  }

  updateCourse(
    id: string,
    body: { name?: string; fee?: number; access?: Access; active?: boolean },
  ): Promise<AdminCourse> {
    return this.patch(`/api/admin/courses/${id}`, body);
  }

  // ---- Course files and access (admin) ----

  courseFiles(courseId: string): Promise<CourseFile[]> {
    return this.get(`/api/admin/courses/${encodeURIComponent(courseId)}/files`);
  }

  startUpload(courseId: string, body: { filename: string; size: number; title: string }): Promise<FileStart> {
    return this.post(`/api/admin/courses/${encodeURIComponent(courseId)}/files`, body);
  }

  finishUpload(courseId: string, fileId: string): Promise<CourseFile> {
    return this.post(`/api/admin/courses/${encodeURIComponent(courseId)}/files/${encodeURIComponent(fileId)}/complete`);
  }

  deleteFile(courseId: string, fileId: string): Promise<void> {
    return this.delete(`/api/admin/courses/${encodeURIComponent(courseId)}/files/${encodeURIComponent(fileId)}`);
  }

  studentAccess(email: string): Promise<CourseAccess[]> {
    return this.get(`/api/admin/registrations/${encodeURIComponent(email)}/access`);
  }

  giveAccess(email: string, courseId: string): Promise<CourseAccess> {
    return this.post(`/api/admin/registrations/${encodeURIComponent(email)}/access`, { course_id: courseId });
  }

  revokeAccess(email: string, courseId: string): Promise<void> {
    return this.delete(`/api/admin/registrations/${encodeURIComponent(email)}/access/${encodeURIComponent(courseId)}`);
  }

  // ---- Question bank (admin) ----

  papers(): Promise<Paper[]> {
    return this.get('/api/admin/papers');
  }

  questions(filter: { paper?: string; topic?: string; status?: string } = {}): Promise<Question[]> {
    const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => !!value) as [string, string][]);
    return this.get(`/api/admin/questions${query.size ? '?' + query : ''}`);
  }

  addQuestion(body: QuestionInput): Promise<Question> {
    return this.post('/api/admin/questions', body);
  }

  updateQuestion(id: string, body: QuestionInput): Promise<Question> {
    return this.patch(`/api/admin/questions/${encodeURIComponent(id)}`, body);
  }

  deleteQuestion(id: string): Promise<void> {
    return this.delete(`/api/admin/questions/${encodeURIComponent(id)}`);
  }

  // ---- Student ----

  myCourses(): Promise<MyCourse[]> {
    return this.get('/api/my/courses');
  }

  fileLink(courseId: string, fileId: string): Promise<FileLink> {
    return this.get(`/api/my/courses/${encodeURIComponent(courseId)}/files/${encodeURIComponent(fileId)}/link`);
  }

  // ---- Platform admin ----

  institutes(): Promise<Institute[]> {
    return this.get('/api/platform/institutes');
  }

  createInstitute(body: InstituteCreate): Promise<InstituteResult> {
    return this.post('/api/platform/institutes', body);
  }

  startLogoUpload(slug: string, body: { filename: string; size: number }): Promise<{ upload: UploadForm }> {
    return this.post(`/api/platform/institutes/${encodeURIComponent(slug)}/logo`, body);
  }

  finishLogoUpload(slug: string): Promise<Institute> {
    return this.post(`/api/platform/institutes/${encodeURIComponent(slug)}/logo/complete`);
  }

  removeLogo(slug: string): Promise<Institute> {
    return this.post(`/api/platform/institutes/${encodeURIComponent(slug)}/logo/remove`);
  }

  updateInstitute(slug: string, body: InstituteUpdate): Promise<InstituteResult> {
    return this.patch(`/api/platform/institutes/${encodeURIComponent(slug)}`, body);
  }
}


import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  FreeSample,
  FreeState,
  SignupForm,
  Access,
  MyProfile,
  StudentPhotoStart,
  RegistrationReceived,
  AdminCourse,
  ApiError,
  CourseAccess,
  CourseFile,
  AdminBehind,
  Announcement,
  LiveClass,
  LiveClassInput,
  LiveImport,
  StudentImport,
  WelcomeResult,
  AnnouncementInput,
  MyNotices,
  ReminderResult,
  AdminHomeCounts,
  CopyChoice,
  CourseProgress,
  CourseStuck,
  StudentProgress,
  AdminParent,
  ChildDetail,
  ChildSummary,
  ParentImport,
  ParentInput,
  StudentCoursework,
  StudentLiveCourse,
  CopyResult,
  CourseworkPlan,
  WorkSubtopicInput,
  CodeResult,
  Course,
  DecisionAction,
  DecisionResult,
  FileLink,
  FileStart,
  GrantRequestedResult,
  Institute,
  InstituteCreate,
  InstituteResult,
  InstituteUpdate,
  Member,
  AdminAttempt,
  AttemptResult,
  AttemptView,
  AutoPickResult,
  MyResults,
  StudentTestCard,
  Paper,
  TestDetail,
  TestResults,
  TestInput,
  TestSummary,
  Passage,
  Picture,
  Question,
  QuestionImport,
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
    return { status: error.status, detail, errors, retryAfter: retry > 0 ? retry : undefined, body: body && typeof body === 'object' ? body : undefined };
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

  register(form: RegistrationForm, photo = false): Promise<RegistrationReceived> {
    return this.post('/api/register', photo ? { ...form, photo: true } : form);
  }

  /** The student's photo has been sent: attach it to their registration. */
  finishRegistrationPhoto(email: string, token: string): Promise<{ ok: boolean }> {
    return this.post('/api/register/photo', { email, token });
  }

  // ---- My profile (student and parent) ----

  myProfile(): Promise<MyProfile> {
    return this.get('/api/me/profile');
  }

  saveMyProfile(fields: Partial<MyProfile>): Promise<MyProfile> {
    return this.call(firstValueFrom(this.http.put<MyProfile>(`${this.base}/api/me/profile`, fields)));
  }

  startMyPhoto(): Promise<{ upload: UploadForm; key: string }> {
    return this.post('/api/me/photo');
  }

  finishMyPhoto(key: string): Promise<MyProfile> {
    return this.post('/api/me/photo/complete', { key });
  }

  removeMyPhoto(): Promise<MyProfile> {
    return this.call(firstValueFrom(this.http.delete<MyProfile>(`${this.base}/api/me/photo`)));
  }

  myData(): Promise<unknown> {
    return this.get('/api/me/export');
  }

  askDeletion(): Promise<{ message: string }> {
    return this.post('/api/me/delete-request');
  }

  cancelDeletion(): Promise<void> {
    return this.delete('/api/me/delete-request');
  }

  // ---- Photos (admin) ----

  startStudentPhoto(email: string): Promise<{ upload: UploadForm; key: string }> {
    return this.post(`/api/admin/registrations/${encodeURIComponent(email)}/photo`);
  }

  finishStudentPhoto(email: string, key: string): Promise<Registration> {
    return this.post(`/api/admin/registrations/${encodeURIComponent(email)}/photo/complete`, { key });
  }

  removeStudentPhoto(email: string): Promise<Registration> {
    return this.call(firstValueFrom(this.http.delete<Registration>(`${this.base}/api/admin/registrations/${encodeURIComponent(email)}/photo`)));
  }

  /** A photo for a bulk import, sent under its file name. */
  startBulkPhoto(filename: string, size: number): Promise<StudentPhotoStart> {
    return this.post('/api/admin/student-photos', { filename, size });
  }

  finishBulkPhoto(id: string): Promise<{ id: string; name: string }> {
    return this.post(`/api/admin/student-photos/${encodeURIComponent(id)}/complete`);
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

  addCourse(body: { name: string; fee?: number; access: Access; papers?: string[] }): Promise<AdminCourse> {
    return this.post('/api/admin/courses', body);
  }

  /** The usual subjects for a course name (CUET, IPMAT, CAT, CLAT), to tick in the form. */
  async suggestedPapers(name: string): Promise<string[]> {
    const reply = await this.get<{ papers: string[] }>(`/api/admin/course-papers/suggested?name=${encodeURIComponent(name)}`);
    return reply.papers;
  }

  updateCourse(
    id: string,
    body: { name?: string; fee?: number; access?: Access; active?: boolean; papers?: string[] },
  ): Promise<AdminCourse> {
    return this.patch(`/api/admin/courses/${id}`, body);
  }

  // ---- Course files and access (admin) ----

  // ---- Live classes (admin) ----

  liveClasses(courseId: string): Promise<LiveClass[]> {
    return this.get(`/api/admin/courses/${encodeURIComponent(courseId)}/live-classes`);
  }

  addLiveClass(courseId: string, body: LiveClassInput): Promise<LiveClass[]> {
    return this.post(`/api/admin/courses/${encodeURIComponent(courseId)}/live-classes`, body);
  }

  editLiveClass(courseId: string, id: string, body: LiveClassInput): Promise<LiveClass[]> {
    return this.patch(`/api/admin/courses/${encodeURIComponent(courseId)}/live-classes/${encodeURIComponent(id)}`, body);
  }

  removeLiveClass(courseId: string, id: string): Promise<LiveClass[]> {
    return this.call(firstValueFrom(this.http.delete<LiveClass[]>(`${this.base}/api/admin/courses/${encodeURIComponent(courseId)}/live-classes/${encodeURIComponent(id)}`)));
  }

  liveTemplate(courseId: string): Promise<Blob> {
    return this.call(firstValueFrom(this.http.get(`${this.base}/api/admin/courses/${encodeURIComponent(courseId)}/live-classes/template`, { responseType: 'blob' })));
  }

  importLiveClasses(courseId: string, file: File, confirm: boolean): Promise<LiveImport> {
    const url = `${this.base}/api/admin/courses/${encodeURIComponent(courseId)}/live-classes/import?confirm=${confirm}`;
    return this.call(firstValueFrom(this.http.post<LiveImport>(url, file, { headers: { 'Content-Type': 'application/octet-stream' } })));
  }

  // ---- Coursework (admin) ----

  coursework(courseId: string): Promise<CourseworkPlan> {
    return this.get(`/api/admin/courses/${encodeURIComponent(courseId)}/coursework`);
  }

  addTopic(courseId: string, paperId: string, title: string): Promise<CourseworkPlan> {
    return this.post(`/api/admin/courses/${encodeURIComponent(courseId)}/coursework/topics`, { paper_id: paperId, title });
  }

  addSubtopic(courseId: string, topicId: string, body: WorkSubtopicInput): Promise<CourseworkPlan> {
    return this.post(`/api/admin/courses/${encodeURIComponent(courseId)}/coursework/topics/${encodeURIComponent(topicId)}/subtopics`, body);
  }

  editWork(courseId: string, nodeId: string, body: WorkSubtopicInput): Promise<CourseworkPlan> {
    return this.patch(`/api/admin/courses/${encodeURIComponent(courseId)}/coursework/${encodeURIComponent(nodeId)}`, body);
  }

  setSubjectDue(courseId: string, paperId: string, due: string | null): Promise<CourseworkPlan> {
    return this.patch(`/api/admin/courses/${encodeURIComponent(courseId)}/coursework/subjects/${encodeURIComponent(paperId)}`, { due });
  }

  moveWork(courseId: string, nodeId: string, direction: 'up' | 'down'): Promise<CourseworkPlan> {
    return this.post(`/api/admin/courses/${encodeURIComponent(courseId)}/coursework/${encodeURIComponent(nodeId)}/move`, { direction });
  }

  removeWork(courseId: string, nodeId: string): Promise<CourseworkPlan & { removed: number }> {
    return this.call(firstValueFrom(this.http.delete<CourseworkPlan & { removed: number }>(`${this.base}/api/admin/courses/${encodeURIComponent(courseId)}/coursework/${encodeURIComponent(nodeId)}`)));
  }

  copyCoursework(courseId: string, choice: CopyChoice): Promise<CourseworkPlan & { copied: CopyResult }> {
    return this.post(`/api/admin/courses/${encodeURIComponent(courseId)}/coursework/copy`, choice);
  }

  // ---- Coursework (student) ----

  myCoursework(): Promise<StudentCoursework> {
    return this.get('/api/my/coursework');
  }

  // ---- Parents ----

  parents(): Promise<AdminParent[]> {
    return this.get('/api/admin/parents');
  }

  addParent(body: ParentInput): Promise<AdminParent[]> {
    return this.post('/api/admin/parents', body);
  }

  removeParent(email: string): Promise<AdminParent[]> {
    return this.call(firstValueFrom(this.http.delete<AdminParent[]>(`${this.base}/api/admin/parents/${encodeURIComponent(email)}`)));
  }

  unlinkChild(email: string, child: string): Promise<AdminParent[]> {
    return this.call(firstValueFrom(this.http.delete<AdminParent[]>(`${this.base}/api/admin/parents/${encodeURIComponent(email)}/children/${encodeURIComponent(child)}`)));
  }

  parentTemplate(): Promise<Blob> {
    return this.call(firstValueFrom(this.http.get(`${this.base}/api/admin/parents/template`, { responseType: 'blob' })));
  }

  importParents(file: File, confirm: boolean): Promise<ParentImport> {
    return this.call(firstValueFrom(this.http.post<ParentImport>(`${this.base}/api/admin/parents/import?confirm=${confirm}`, file, { headers: { 'Content-Type': 'application/octet-stream' } })));
  }

  myChildren(): Promise<ChildSummary[]> {
    return this.get('/api/parent/children');
  }

  myChild(email: string): Promise<ChildDetail> {
    return this.get(`/api/parent/children/${encodeURIComponent(email)}`);
  }

  makeChildPractice(email: string, body: { paper: string; topic: string; count?: number }): Promise<{ id: string; title: string; question_count: number }> {
    return this.post(`/api/parent/children/${encodeURIComponent(email)}/practice`, body);
  }

  makePractice(body: { paper: string; topic: string; count?: number }): Promise<{ id: string; title: string; question_count: number }> {
    return this.post('/api/my/practice', body);
  }

  glimpse(): Promise<{ courses: { name: string; subjects: { name: string; topics: { title: string; subtopics: string[] }[] }[] }[] }> {
    return this.get('/api/public/glimpse');
  }

  signupCode(form: SignupForm): Promise<{ message: string }> {
    return this.post('/api/public/signup/code', form);
  }

  signup(form: SignupForm, code: string): Promise<Session> {
    return this.post('/api/public/signup', { ...form, code });
  }

  freeCourses(): Promise<FreeState> {
    return this.get('/api/free/courses');
  }

  freePick(course: string): Promise<FreeState> {
    return this.call(firstValueFrom(this.http.put<FreeState>(`${this.base}/api/free/pick`, { course })));
  }

  freeSample(): Promise<{ sample: FreeSample | null }> {
    return this.get('/api/free/sample');
  }

  sendSupport(body: { message: string; page?: string; screenshot?: string }): Promise<{ sent: boolean }> {
    return this.post('/api/support', body);
  }

  myLiveClasses(): Promise<StudentLiveCourse[]> {
    return this.get('/api/my/live-classes');
  }

  markDone(courseId: string, subtopicId: string): Promise<StudentCoursework> {
    return this.call(firstValueFrom(this.http.put<StudentCoursework>(`${this.base}/api/my/coursework/${encodeURIComponent(courseId)}/${encodeURIComponent(subtopicId)}/done`, {})));
  }

  markNotDone(courseId: string, subtopicId: string): Promise<StudentCoursework> {
    return this.call(firstValueFrom(this.http.delete<StudentCoursework>(`${this.base}/api/my/coursework/${encodeURIComponent(courseId)}/${encodeURIComponent(subtopicId)}/done`)));
  }

  // ---- Progress (admin) ----

  // ---- Announcements and notices ----

  sendAnnouncement(body: AnnouncementInput): Promise<Announcement> {
    return this.post('/api/admin/announcements', body);
  }

  announcements(): Promise<Announcement[]> {
    return this.get('/api/admin/announcements');
  }

  sendReminders(courseId: string, emails: string[] | null, sendEmail: boolean): Promise<ReminderResult> {
    return this.post('/api/admin/reminders', { course_id: courseId, emails, send_email: sendEmail });
  }

  myNotices(): Promise<MyNotices> {
    return this.get('/api/my/notices');
  }

  markNoticeRead(id: string): Promise<MyNotices> {
    return this.call(firstValueFrom(this.http.put<MyNotices>(`${this.base}/api/my/notices/${encodeURIComponent(id)}/read`, {})));
  }

  markAllNoticesRead(): Promise<MyNotices> {
    return this.call(firstValueFrom(this.http.put<MyNotices>(`${this.base}/api/my/notices/read-all`, {})));
  }

  adminHome(): Promise<AdminHomeCounts> {
    return this.get('/api/admin/home');
  }

  adminBehind(): Promise<AdminBehind> {
    return this.get('/api/admin/home/behind');
  }

  courseProgress(courseId: string): Promise<CourseProgress> {
    return this.get(`/api/admin/progress/${encodeURIComponent(courseId)}`);
  }

  courseStuck(courseId: string): Promise<CourseStuck> {
    return this.get(`/api/admin/progress/${encodeURIComponent(courseId)}/stuck`);
  }

  studentProgress(courseId: string, email: string): Promise<StudentProgress> {
    return this.get(`/api/admin/progress/${encodeURIComponent(courseId)}/students/${encodeURIComponent(email)}`);
  }

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

  /** Give an approved student every course they chose, each for its own length. */
  giveRequestedAccess(email: string): Promise<GrantRequestedResult> {
    return this.post(`/api/admin/registrations/${encodeURIComponent(email)}/access/requested`);
  }

  revokeAccess(email: string, courseId: string): Promise<void> {
    return this.delete(`/api/admin/registrations/${encodeURIComponent(email)}/access/${encodeURIComponent(courseId)}`);
  }

  // ---- Question bank (admin) ----

  papers(): Promise<Paper[]> {
    return this.get('/api/admin/papers');
  }

  questions(filter: { paper?: string; topic?: string; status?: string; pictures?: string; kind?: string; passage?: string } = {}): Promise<Question[]> {
    const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => !!value) as [string, string][]);
    return this.get(`/api/admin/questions${query.size ? '?' + query : ''}`);
  }

  updatePassage(id: string, body: { title?: string; text?: string }): Promise<Passage> {
    return this.patch(`/api/admin/passages/${encodeURIComponent(id)}`, body);
  }

  addQuestion(body: QuestionInput): Promise<Question> {
    return this.post('/api/admin/questions', body);
  }

  updateQuestion(id: string, body: QuestionInput): Promise<Question> {
    return this.patch(`/api/admin/questions/${encodeURIComponent(id)}`, body);
  }

  startQuestionPicture(body: { filename: string; size: number }): Promise<{ id: string; upload: UploadForm }> {
    return this.post('/api/admin/question-images', body);
  }

  finishQuestionPicture(id: string): Promise<Picture> {
    return this.post(`/api/admin/question-images/${encodeURIComponent(id)}/complete`);
  }

  discardQuestionPicture(id: string): Promise<void> {
    return this.delete(`/api/admin/question-images/${encodeURIComponent(id)}`);
  }

  /** Publish (or move back to draft) many questions in one go. */
  setQuestionStatus(ids: string[], status: 'draft' | 'published'): Promise<{ changed: number; unchanged: number; missing: number }> {
    return this.post('/api/admin/questions/status', { ids, status });
  }

  /** Delete many questions for good. The server insists on the word DELETE. */
  deleteQuestions(ids: string[]): Promise<{ deleted: number; missing: number; blocked: number }> {
    return this.post('/api/admin/questions/delete', { ids, confirm: 'DELETE' });
  }

  // ---- Tests (admin) ----

  tests(): Promise<TestSummary[]> {
    return this.get('/api/admin/tests');
  }

  test(id: string): Promise<TestDetail> {
    return this.get(`/api/admin/tests/${encodeURIComponent(id)}`);
  }

  addTest(body: TestInput): Promise<TestDetail> {
    return this.post('/api/admin/tests', body);
  }

  updateTest(id: string, body: TestInput): Promise<TestDetail> {
    return this.patch(`/api/admin/tests/${encodeURIComponent(id)}`, body);
  }

  deleteTest(id: string): Promise<void> {
    return this.delete(`/api/admin/tests/${encodeURIComponent(id)}`);
  }

  /** How students did at a test: a summary, every attempt, and how each question went. */
  testResults(id: string): Promise<TestResults> {
    return this.get(`/api/admin/tests/${encodeURIComponent(id)}/results`);
  }

  /** One student's attempt with every answer, the right answers and the reasons. */
  studentAttempt(testId: string, email: string, number: number): Promise<AdminAttempt> {
    return this.get(`/api/admin/tests/${encodeURIComponent(testId)}/results/${encodeURIComponent(email)}/${number}`);
  }

  /** Pick random published questions for the rules. Saves nothing. */
  autoPick(rules: { paper: string; topic: string; difficulty: string; count: number }[], exclude: string[]): Promise<AutoPickResult> {
    return this.post('/api/admin/tests/auto-pick', { rules, exclude });
  }

  deleteQuestion(id: string): Promise<void> {
    return this.delete(`/api/admin/questions/${encodeURIComponent(id)}`);
  }

  /** The Excel template for uploading many questions. Returns the file, ready to save. */
  questionTemplate(): Promise<Blob> {
    return this.call(firstValueFrom(this.http.get(this.base + '/api/admin/questions/template', { responseType: 'blob' })));
  }

  /** Send a filled-in Excel file. Without confirm, the server only checks it and says what would happen. */
  importQuestions(file: File, confirm: boolean): Promise<QuestionImport> {
    const url = `${this.base}/api/admin/questions/import?confirm=${confirm}`;
    const headers = { 'Content-Type': 'application/octet-stream' };
    return this.call(firstValueFrom(this.http.post<QuestionImport>(url, file, { headers })));
  }

  /** The Excel template for importing many students. Returns the file, ready to save. */
  studentImportTemplate(): Promise<Blob> {
    return this.call(firstValueFrom(this.http.get(this.base + '/api/admin/students/import/template', { responseType: 'blob' })));
  }

  /** Send a filled-in Excel file. Without confirm, the server only checks it and says what would happen. */
  importStudents(file: File, confirm: boolean): Promise<StudentImport> {
    const url = `${this.base}/api/admin/students/import?confirm=${confirm}`;
    const headers = { 'Content-Type': 'application/octet-stream' };
    return this.call(firstValueFrom(this.http.post<StudentImport>(url, file, { headers })));
  }

  /** Email a welcome to some imported students (the server takes up to 25 at a time). */
  sendWelcome(emails: string[]): Promise<WelcomeResult> {
    return this.post('/api/admin/students/welcome', { emails });
  }

  // ---- Student: tests ----

  myTests(): Promise<StudentTestCard[]> {
    return this.get('/api/my/tests');
  }

  myTest(id: string): Promise<StudentTestCard> {
    return this.get(`/api/my/tests/${encodeURIComponent(id)}`);
  }

  /** The student's results across all their tests. */
  myResults(): Promise<MyResults> {
    return this.get('/api/my/results');
  }

  startTest(id: string): Promise<AttemptView> {
    return this.post(`/api/my/tests/${encodeURIComponent(id)}/start`);
  }

  attempt(testId: string, number: number): Promise<AttemptView | AttemptResult> {
    return this.get(`/api/my/tests/${encodeURIComponent(testId)}/attempts/${number}`);
  }

  saveAnswers(testId: string, number: number, answers: Record<string, number | string | null>): Promise<{ saved: number; remaining_seconds: number }> {
    return this.call(firstValueFrom(this.http.put<{ saved: number; remaining_seconds: number }>(`${this.base}/api/my/tests/${encodeURIComponent(testId)}/attempts/${number}/answers`, { answers })));
  }

  submitAttempt(testId: string, number: number): Promise<AttemptResult> {
    return this.post(`/api/my/tests/${encodeURIComponent(testId)}/attempts/${number}/submit`);
  }

  // ---- Student ----

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


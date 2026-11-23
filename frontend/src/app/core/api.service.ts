import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, Injector, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { TenantService } from './tenant.service';
import { AskLog, FeatureRow, MyLeaderboard, MyYesterdayWinners, ReleaseHistory, QuestionViewer, AnalyseFilters, MyTopicTests, ReleaseList, ReleaseSchedule, Release, TodayReleases, MyOranges, MyWordOfDay, WordEntry, FreeSample, FreeState, SignupForm, Access, Batch, StudentQuick, MyBatch, MyInstitute, MyProfile, StudentPhotoStart, RegistrationReceived, AdminCourse, ApiError, CourseAccess, CourseFile, AdminBehind, Announcement, LiveClass, LiveClassInput, LiveImport, StudentImport, WelcomeResult, AnnouncementInput, MyNotices, ReminderResult, AdminHomeCounts, CopyChoice, CourseProgress, CourseStuck, StudentProgress, AdminParent, ChildDetail, ChildSummary, ParentImport, ParentInput, StudentCoursework, StudyAnswer, StudySearch, StudentLiveCourse, CopyResult, CourseworkPlan, WorkSubtopicInput, CodeResult, Course, DecisionAction, DecisionResult, FileLink, FileStart, GrantRequestedResult, Institute, InstituteCreate, InstituteResult, InstituteUpdate, Member, AdminAttempt, AttemptResult, AttemptView, AutoPickResult, MyResults, StudentTestCard, Paper, TestDetail, TestResults, TestInput, TestSummary, Passage, Picture, Question, QuestionImport, QuestionInput, Registration, RegistrationEdit, RegistrationForm, Session, TenantInfo, UploadForm, TestKind, VocabPack, VocabQuestion, VocabMarked, PastPaperCard, SyllabusTable, FilterTopicGroup, AnalyseView, SwotView, Application, ApplicationInput, PiBankView, PiQuestionRow, PiQuestionInput, EligibilityCollege, CollegeRule, AdminCollege, CutoffView, CutoffRow, HubWmNote, HubWmChapter, HubWmQuestion, HubWmAnswerResult, HubCmChapter, HubCmNote, HubCmQuiz, HubTestItem, HubTestResult } from './models';

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
  private readonly injector = inject(Injector);
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

  /** One page of a long list. `next` is the cursor for the page after it, from the X-Next-Cursor header, or null when none are left. */
  private async getPage<T>(path: string, params: Record<string, string>, before: string | null): Promise<{ body: T; next: string | null }> {
    const query = before ? { ...params, before } : params;
    const response = await this.call(
      firstValueFrom(this.http.get<T>(this.base + path, { params: query, observe: 'response' })),
    );
    return { body: response.body as T, next: response.headers.get('X-Next-Cursor') || null };
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

  // ---- A student at a glance (the admin's side drawer) ----

  studentQuick(email: string): Promise<StudentQuick> {
    return this.get(`/api/admin/students/${encodeURIComponent(email)}/quick`);
  }

  // ---- Batches ----

  batches(): Promise<Batch[]> {
    return this.get('/api/admin/batches');
  }

  batch(id: string): Promise<Batch> {
    return this.get(`/api/admin/batches/${encodeURIComponent(id)}`);
  }

  createBatch(fields: Record<string, unknown>): Promise<Batch> {
    return this.post('/api/admin/batches', fields);
  }

  updateBatch(id: string, fields: Record<string, unknown>): Promise<Batch> {
    return this.patch(`/api/admin/batches/${encodeURIComponent(id)}`, fields);
  }

  enrolInBatch(id: string, emails: string[]): Promise<Batch> {
    return this.post(`/api/admin/batches/${encodeURIComponent(id)}/students`, { emails });
  }

  removeFromBatch(id: string, email: string): Promise<Batch> {
    return this.call(firstValueFrom(this.http.delete<Batch>(`${this.base}/api/admin/batches/${encodeURIComponent(id)}/students/${encodeURIComponent(email)}`)));
  }

  myBatches(): Promise<MyBatch[]> {
    return this.get('/api/my/batches');
  }

  // ---- Features and labels (the institute admin) ----

  features(): Promise<{ features: FeatureRow[]; oranges_target: number }> {
    return this.get('/api/admin/features');
  }

  saveFeatures(rows: { key: string; enabled: boolean; label: string; icon: string }[]): Promise<{ features: FeatureRow[] }> {
    return this.call(firstValueFrom(this.http.put<{ features: FeatureRow[] }>(`${this.base}/api/admin/features`, rows)));
  }

  // ---- My institute (the institute admin) ----

  myInstitute(): Promise<MyInstitute> {
    return this.get('/api/admin/institute');
  }

  saveMyInstitute(fields: Record<string, unknown>): Promise<MyInstitute> {
    return this.call(firstValueFrom(this.http.put<MyInstitute>(`${this.base}/api/admin/institute`, fields)));
  }

  startInstituteLogo(file: { filename: string; size: number }): Promise<{ upload: UploadForm }> {
    return this.post('/api/admin/institute/logo', file);
  }

  finishInstituteLogo(): Promise<MyInstitute> {
    return this.post('/api/admin/institute/logo/complete');
  }

  removeInstituteLogo(): Promise<MyInstitute> {
    return this.post('/api/admin/institute/logo/remove');
  }

  startAdminPhoto(): Promise<{ upload: UploadForm; key: string }> {
    return this.post('/api/admin/institute/photo');
  }

  finishAdminPhoto(key: string): Promise<MyInstitute> {
    return this.post('/api/admin/institute/photo/complete', { key });
  }

  removeAdminPhoto(): Promise<MyInstitute> {
    return this.call(firstValueFrom(this.http.delete<MyInstitute>(`${this.base}/api/admin/institute/photo`)));
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

  /** One page of registrations. `next` is the cursor for the page after it, or null when there are no more. */
  async registrationPage(status: string, before: string | null, limit: number): Promise<{ people: Registration[]; next: string | null }> {
    const page = await this.getPage<Registration[] | null>('/api/admin/registrations', { status, limit: String(limit) }, before);
    return { people: page.body ?? [], next: page.next };
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

  /** Passages of the student's coursework that match the words of a question. No AI: keyword matching only. */
  studySearch(query: string): Promise<StudySearch> {
    return this.get(`/api/my/study/search?q=${encodeURIComponent(query)}`);
  }

  /** Ask a question. An answer comes back only when the notes clearly cover it; the passages come back either way. */
  studyAsk(question: string): Promise<StudyAnswer> {
    return this.post('/api/my/study/ask', { question });
  }

  /** The admin's Ask AI log. The student's name and email are included only when showStudent is true. */
  studyLog(match: string, showStudent: boolean, sort: string): Promise<AskLog> {
    return this.get(`/api/admin/study-log?match=${encodeURIComponent(match)}&show_student=${showStudent}&sort=${encodeURIComponent(sort)}`);
  }

  /** One page of the Ask AI log. `next` is the cursor for the page after it, or null when there are no more. */
  async studyLogPage(match: string, showStudent: boolean, sort: string, before: string | null, limit: number): Promise<{ rows: AskLog['rows']; next: string | null }> {
    const page = await this.getPage<AskLog>(
      '/api/admin/study-log',
      { match, show_student: String(showStudent), sort, limit: String(limit) },
      before,
    );
    return { rows: page.body.rows, next: page.next };
  }

  /** A short-lived link to one file, for the admin to open a passage from the Ask AI log. */
  adminFileLink(courseId: string, fileId: string): Promise<FileLink> {
    return this.get(`/api/admin/courses/${encodeURIComponent(courseId)}/files/${encodeURIComponent(fileId)}/link`);
  }

  // ---- Parents ----

  parents(): Promise<AdminParent[]> {
    return this.get('/api/admin/parents');
  }

  /** One page of parents, by name. `next` is the cursor for the page after it, or null when there are no more. */
  async parentPage(before: string | null, limit: number): Promise<{ items: AdminParent[]; next: string | null }> {
    const page = await this.getPage<AdminParent[] | null>('/api/admin/parents', { limit: String(limit) }, before);
    return { items: page.body ?? [], next: page.next };
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

  /** The subjects and topics a student can practise, with their published question counts. */
  myTopicTests(): Promise<MyTopicTests> {
    return this.get('/api/my/topic-tests');
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

  freeFileLink(fileId: string): Promise<FileLink> {
    return this.get(`/api/free/files/${encodeURIComponent(fileId)}/link`);
  }

  freeSample(): Promise<{ sample: FreeSample | null }> {
    return this.get('/api/free/sample');
  }

  sendSupport(body: { message: string; page?: string; screenshot?: string; kind?: 'feedback'; rating?: number }): Promise<{ sent: boolean }> {
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

  /** One page of sent announcements. `next` is the cursor for the page after it, or null when there are no more. */
  async announcementPage(before: string | null, limit: number): Promise<{ items: Announcement[]; next: string | null }> {
    const page = await this.getPage<Announcement[] | null>('/api/admin/announcements', { limit: String(limit) }, before);
    return { items: page.body ?? [], next: page.next };
  }

  sendReminders(courseId: string, emails: string[] | null, sendEmail: boolean): Promise<ReminderResult> {
    return this.post('/api/admin/reminders', { course_id: courseId, emails, send_email: sendEmail });
  }

  /** The institute's word list, or its idiom list, in the order it was added. */
  words(kind: 'word' | 'idiom' = 'word'): Promise<WordEntry[]> {
    return this.get(`/api/admin/words?kind=${kind}`);
  }

  addWord(body: { kind: 'word' | 'idiom'; word: string; meaning: string; example: string }): Promise<WordEntry> {
    return this.post('/api/admin/words', body);
  }

  removeWord(id: string): Promise<void> {
    return this.delete(`/api/admin/words/${encodeURIComponent(id)}`);
  }

  /** The student's oranges for today (null when the institute has them switched off). */
  myOranges(): Promise<MyOranges> {
    return this.get('/api/my/oranges');
  }

  /** The leaderboard for the last seven days (null when the institute has it switched off). */
  myLeaderboard(): Promise<MyLeaderboard> {
    return this.get('/api/my/leaderboard');
  }

  /** Past and current Daily RC passages or Weekly DILR sets, newest first (empty when the institute has the kind off). */
  releaseHistory(kind: 'daily_rc' | 'weekly_dilr'): Promise<ReleaseHistory> {
    return this.get(`/api/my/releases/${kind}/history`);
  }

  /** Yesterday's top three students by oranges (null when the institute has it switched off). */
  myYesterdayWinners(): Promise<MyYesterdayWinners> {
    return this.get('/api/my/yesterday-winners');
  }

  /** The institute's daily target for oranges. */
  /** The icon each menu heading shows, for the admin's Menu headings section. */
  menuHeadings(): Promise<{ headings: Record<string, string> }> {
    return this.get('/api/admin/features/headings');
  }

  iconColour(): Promise<{ colour: string; options: { hex: string; name: string }[] }> {
    return this.get('/api/admin/features/icon-colour');
  }

  saveIconColour(colour: string): Promise<{ colour: string; options: { hex: string; name: string }[] }> {
    return this.call(firstValueFrom(this.http.put<{ colour: string; options: { hex: string; name: string }[] }>(`${this.base}/api/admin/features/icon-colour`, { colour })));
  }

  /** The student-view design the institute uses, and the three choices the admin can pick from. */
  studentDesign(): Promise<{ design: string; options: { key: string; name: string; text: string }[] }> {
    return this.get('/api/admin/features/design');
  }

  saveStudentDesign(design: string): Promise<{ design: string; options: { key: string; name: string; text: string }[] }> {
    return this.call(firstValueFrom(this.http.put<{ design: string; options: { key: string; name: string; text: string }[] }>(`${this.base}/api/admin/features/design`, { design })));
  }

  saveMenuHeadings(headings: Record<string, string>): Promise<{ headings: Record<string, string> }> {
    return this.call(firstValueFrom(this.http.put<{ headings: Record<string, string> }>(`${this.base}/api/admin/features/headings`, headings)));
  }

  setOrangesTarget(target: number): Promise<{ target: number }> {
    return this.call(firstValueFrom(this.http.put<{ target: number }>(`${this.base}/api/admin/oranges-target`, { target })));
  }

  // ---- Study Hub (student): Wren & Martin grammar and Cambridge Maths Stage 8. Nothing is saved on the server. ----

  hubWmNotes(): Promise<{ notes: HubWmNote[] }> {
    return this.get('/api/my/study-hub/wm/notes');
  }

  hubWmChapters(): Promise<{ chapters: HubWmChapter[] }> {
    return this.get('/api/my/study-hub/wm/chapters');
  }

  hubWmQuestions(chapter: number): Promise<{ chapter: number; title: string; questions: HubWmQuestion[] }> {
    return this.get(`/api/my/study-hub/wm/chapters/${chapter}/questions`);
  }

  /** Marks one Wren & Martin quiz answer. The right answer is only told after the student has answered. */
  hubWmAnswer(chapter: number, questionId: string, choice: number): Promise<HubWmAnswerResult> {
    return this.post('/api/my/study-hub/wm/answers', { chapter, question_id: questionId, choice });
  }

  hubCmChapters(): Promise<{ chapters: HubCmChapter[] }> {
    return this.get('/api/my/study-hub/cm/chapters');
  }

  hubCmChapter(chapter: number): Promise<HubCmNote> {
    return this.get(`/api/my/study-hub/cm/chapters/${chapter}`);
  }

  hubCmQuiz(chapter: number): Promise<HubCmQuiz> {
    return this.get(`/api/my/study-hub/cm/chapters/${chapter}/quiz`);
  }

  /** A student-made test for one subject ('wm' or 'cm'). Chapters empty = all chapters. */
  hubBuildTest(subject: 'wm' | 'cm', chapters: number[], formats: string[], count: number): Promise<{ items: HubTestItem[] }> {
    return this.get(`/api/my/study-hub/${subject}/tests/build`, {
      chapters: chapters.join(','),
      formats: formats.join(''),
      count: String(count),
    });
  }

  hubGradeTest(subject: 'wm' | 'cm', items: { id: string; answer: string }[]): Promise<HubTestResult> {
    return this.post(`/api/my/study-hub/${subject}/tests/grade`, { items });
  }

  /** Today's pack in Vocabulary or Idioms, with the calendar around it. */
  myVocab(kind: 'vocabulary' | 'idioms'): Promise<VocabPack> {
    return this.get(`/api/my/vocab/${kind}`);
  }

  /** Today's test: the words and four choices each. The right answers are not sent. */
  vocabTest(kind: 'vocabulary' | 'idioms'): Promise<{ questions: VocabQuestion[] }> {
    return this.post(`/api/my/vocab/${kind}/test`, {});
  }

  /** Mark today's test: the chosen option for each word, or null for none. */
  vocabMark(kind: 'vocabulary' | 'idioms', answers: (number | null)[]): Promise<VocabMarked> {
    return this.post(`/api/my/vocab/${kind}/test/answers`, { answers });
  }

  /** Today's word for the student (null when there is none or it is switched off). */
  myWordOfDay(): Promise<MyWordOfDay> {
    return this.get('/api/my/word-of-day');
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

  /** The saved answer, instantly. */
  adminBehind(): Promise<AdminBehind> {
    return this.get('/api/admin/home/behind');
  }

  /** Work the answer out again (a few seconds on a large institute) and save it. */
  refreshBehind(): Promise<AdminBehind> {
    return this.post('/api/admin/home/behind/refresh');
  }

  courseProgress(courseId: string): Promise<CourseProgress> {
    return this.get(`/api/admin/progress/${encodeURIComponent(courseId)}`);
  }

  /** Work the course's page out again and save it (a few seconds on a large course). */
  refreshProgress(courseId: string): Promise<CourseProgress> {
    return this.post(`/api/admin/progress/${encodeURIComponent(courseId)}/refresh`);
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

  /** Read the text of every PDF of the course again. */
  reindexFiles(courseId: string): Promise<CourseFile[]> {
    return this.post(`/api/admin/courses/${encodeURIComponent(courseId)}/files/reindex`);
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

  /** One page of the question bank for a filter. `next` is the cursor for the page after it, or null when there are no more. */
  async questionPage(
    filter: { paper?: string; topic?: string; status?: string; pictures?: string; kind?: string; passage?: string },
    before: string | null,
    limit: number,
  ): Promise<{ items: Question[]; next: string | null }> {
    const params: Record<string, string> = { limit: String(limit) };
    for (const [name, value] of Object.entries(filter)) if (value) params[name] = value;
    const page = await this.getPage<Question[] | null>('/api/admin/questions', params, before);
    return { items: page.body ?? [], next: page.next };
  }

  /** The question bank's passages, by title. */
  passages(): Promise<Passage[]> {
    return this.get('/api/admin/passages');
  }

  /** The releases for one kind (daily_rc or weekly_dilr), with the schedule the admin chose. */
  releases(kind: string): Promise<ReleaseList> {
    return this.get(`/api/admin/releases/${encodeURIComponent(kind)}`);
  }

  saveReleaseSchedule(kind: string, body: ReleaseSchedule): Promise<ReleaseSchedule> {
    return this.call(firstValueFrom(this.http.put<ReleaseSchedule>(`${this.base}/api/admin/releases/${encodeURIComponent(kind)}/schedule`, body)));
  }

  addReleases(body: { kind: string; passage_ids: string[]; date?: string }): Promise<Release[]> {
    return this.post('/api/admin/releases', body);
  }

  removeRelease(id: string): Promise<void> {
    return this.delete(`/api/admin/releases/${encodeURIComponent(id)}`);
  }

  /** Today's Daily RC passage and this week's Weekly DILR set for the student (each null when there is none). */
  myReleasesToday(): Promise<TodayReleases> {
    return this.get('/api/my/releases/today');
  }

  /** The student's own college applications, nearest deadline first. */
  myApplications(): Promise<Application[]> {
    return this.get('/api/my/applications');
  }

  addApplication(body: ApplicationInput): Promise<Application> {
    return this.post('/api/my/applications', body);
  }

  changeApplication(id: string, body: ApplicationInput): Promise<Application> {
    return this.call(firstValueFrom(this.http.put<Application>(`${this.base}/api/my/applications/${encodeURIComponent(id)}`, body)));
  }

  removeApplication(id: string): Promise<void> {
    return this.delete(`/api/my/applications/${encodeURIComponent(id)}`);
  }

  /** The student's question bank, with their own done marks. */
  piBank(): Promise<PiBankView> {
    return this.get('/api/my/pi-questions');
  }

  markPiDone(id: string): Promise<void> {
    return this.call(firstValueFrom(this.http.put<void>(`${this.base}/api/my/pi-questions/${encodeURIComponent(id)}/done`, {})));
  }

  unmarkPiDone(id: string): Promise<void> {
    return this.delete(`/api/my/pi-questions/${encodeURIComponent(id)}/done`);
  }

  /** The admin's questions, in the order they were added. */
  piQuestions(): Promise<PiQuestionRow[]> {
    return this.get('/api/admin/pi-questions');
  }

  addPiQuestion(body: PiQuestionInput): Promise<PiQuestionRow> {
    return this.post('/api/admin/pi-questions', body);
  }

  removePiQuestion(id: string): Promise<void> {
    return this.delete(`/api/admin/pi-questions/${encodeURIComponent(id)}`);
  }

  /** The colleges with their eligibility rules, for the student's checker. */
  myEligibility(): Promise<EligibilityCollege[]> {
    return this.get('/api/my/eligibility');
  }

  /** The college names and the years with cutoffs, for the Cutoffs pickers. */
  myColleges(): Promise<{ id: string; name: string; years: number[] }[]> {
    return this.get('/api/my/colleges');
  }

  myCutoffs(college: string, year?: number): Promise<CutoffView> {
    const params: Record<string, string> = { college };
    if (year) params['year'] = String(year);
    return this.get('/api/my/cutoffs', params);
  }

  adminColleges(): Promise<AdminCollege[]> {
    return this.get('/api/admin/colleges');
  }

  addCollege(body: { name: string; rules: CollegeRule[] }): Promise<AdminCollege> {
    return this.post('/api/admin/colleges', body);
  }

  changeCollege(id: string, body: { name: string; rules: CollegeRule[] }): Promise<AdminCollege> {
    return this.call(firstValueFrom(this.http.put<AdminCollege>(`${this.base}/api/admin/colleges/${encodeURIComponent(id)}`, body)));
  }

  removeCollege(id: string): Promise<void> {
    return this.delete(`/api/admin/colleges/${encodeURIComponent(id)}`);
  }

  adminCutoffs(id: string, year?: number): Promise<CutoffView> {
    const query = year ? `?year=${year}` : '';
    return this.get(`/api/admin/colleges/${encodeURIComponent(id)}/cutoffs${query}`);
  }

  saveCutoff(id: string, body: Omit<CutoffRow, 'id'>): Promise<CutoffRow> {
    return this.call(firstValueFrom(this.http.put<CutoffRow>(`${this.base}/api/admin/colleges/${encodeURIComponent(id)}/cutoffs`, body)));
  }

  removeCutoff(collegeId: string, rowId: string): Promise<void> {
    return this.delete(`/api/admin/colleges/${encodeURIComponent(collegeId)}/cutoffs/${encodeURIComponent(rowId)}`);
  }

  /** Analyse for one kind of test: topic tests, sectionals or mocks. */
  myAnalyse(view: 'topic' | 'sectional' | 'mock', filters: AnalyseFilters = {}): Promise<AnalyseView> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) if (value) params[key] = value;
    return this.get(`/api/my/analyse/${view}`, params);
  }

  /** SWOT from the student's last sectional and mock attempts. */
  mySwot(): Promise<SwotView> {
    return this.get('/api/my/swot');
  }

  /** The past papers the student can open, newest year first. */
  myPastPapers(): Promise<PastPaperCard[]> {
    return this.get('/api/my/past-papers');
  }

  /** Topics by year: how many questions of each topic came up in each year's paper. */
  mySyllabus(): Promise<SyllabusTable> {
    return this.get('/api/my/syllabus');
  }

  /** Each subject's topics that appear in the past papers, for practice. */
  myFilterTopics(): Promise<FilterTopicGroup[]> {
    return this.get('/api/my/filter-topics');
  }

  /** Questions for the Filter topics viewer. Blank filters match everything. */
  filterQuestions(filters: { paper?: string; topic?: string; difficulty?: string; year?: number }): Promise<QuestionViewer> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params[key] = String(value);
    return this.get('/api/my/filter-topics/questions', params);
  }

  /** Open the student's practice test on today's Daily RC passage, or this week's Weekly DILR set. */
  attemptRelease(kind: 'daily_rc' | 'weekly_dilr'): Promise<{ id: string; title: string; question_count: number }> {
    return this.post(`/api/my/releases/${kind}/attempt`, {});
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

  /** One page of a test's attempts, with the summary. `next` is the cursor for the page after it, or null when there are no more. */
  async testResultsPage(id: string, before: string | null, limit: number): Promise<{ data: TestResults; next: string | null }> {
    const page = await this.getPage<TestResults>(`/api/admin/tests/${encodeURIComponent(id)}/results`, { limit: String(limit) }, before);
    return { data: page.body, next: page.next };
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

  /** A free learner's one test lives under /api/free; everyone else's tests under /api/my. The pages are the same. */
  private testsPath(): string {
    return this.injector.get(TenantService).slug() === 'free' ? '/api/free/tests' : '/api/my/tests';
  }

  freeTest(): Promise<{ test: StudentTestCard | null }> {
    return this.get('/api/free/test');
  }

  myTests(kind?: TestKind): Promise<StudentTestCard[]> {
    return this.get(kind ? `/api/my/tests?kind=${kind}` : '/api/my/tests');
  }

  myTest(id: string): Promise<StudentTestCard> {
    return this.get(`${this.testsPath()}/${encodeURIComponent(id)}`);
  }

  /** The student's results across all their tests. */
  myResults(): Promise<MyResults> {
    return this.get('/api/my/results');
  }

  startTest(id: string): Promise<AttemptView> {
    return this.post(`${this.testsPath()}/${encodeURIComponent(id)}/start`);
  }

  attempt(testId: string, number: number): Promise<AttemptView | AttemptResult> {
    return this.get(`${this.testsPath()}/${encodeURIComponent(testId)}/attempts/${number}`);
  }

  saveAnswers(testId: string, number: number, answers: Record<string, number | string | null>): Promise<{ saved: number; remaining_seconds: number }> {
    return this.call(firstValueFrom(this.http.put<{ saved: number; remaining_seconds: number }>(`${this.base}${this.testsPath()}/${encodeURIComponent(testId)}/attempts/${number}/answers`, { answers })));
  }

  submitAttempt(testId: string, number: number): Promise<AttemptResult> {
    return this.post(`${this.testsPath()}/${encodeURIComponent(testId)}/attempts/${number}/submit`);
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


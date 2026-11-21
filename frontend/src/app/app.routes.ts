import { Routes } from '@angular/router';
import { adminGuard, parentGuard, platformGuard, signedInGuard, tenantGuard, unsavedGuard } from './core/guards';

// Every page belongs to an institute, named in the address: /aaptprep/login, /aaptprep/register, and so on.
// Once the platform has a domain, the institute will come from the web address instead.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/landing').then((m) => m.Landing),
  },
  { path: 'free/register', redirectTo: 'signup' },
  { path: 'signup', loadComponent: () => import('./pages/signup').then((m) => m.Signup) },
  { path: 'pricing', loadComponent: () => import('./pages/pricing').then((m) => m.Pricing) },
  {
    // The platform admin's page. It must come before ':tenant', so 'platform-admin' isn't taken for an institute.
    path: 'platform-admin',
    canActivate: [platformGuard],
    loadComponent: () => import('./pages/tenant-shell').then((m) => m.TenantShell),
    children: [{ path: '', loadComponent: () => import('./pages/platform-admin').then((m) => m.PlatformAdmin) }],
  },
  {
    path: ':tenant',
    canActivate: [tenantGuard],
    loadComponent: () => import('./pages/tenant-shell').then((m) => m.TenantShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      { path: 'login', loadComponent: () => import('./pages/login').then((m) => m.Login) },
      { path: 'register', loadComponent: () => import('./pages/register').then((m) => m.Register) },
      {
        path: 'home',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-home').then((m) => m.StudentHome),
      },
      {
        path: 'admin/announcements',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-announcements').then((m) => m.AdminAnnouncements),
      },
      {
        path: 'admin/study-log',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-study-log').then((m) => m.AdminStudyLog),
      },
      {
        path: 'notices',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-notices').then((m) => m.StudentNotices),
      },
      {
        path: 'admin/home',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-home').then((m) => m.AdminHome),
      },
      {
        path: 'admin/batches',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-batches').then((m) => m.AdminBatchesPage),
      },
      {
        path: 'admin/institute',
        canActivate: [signedInGuard, adminGuard],
        canDeactivate: [unsavedGuard],
        loadComponent: () => import('./pages/admin-institute').then((m) => m.AdminInstitutePage),
      },
      {
        path: 'admin/colleges',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-colleges').then((m) => m.AdminCollegesPage),
      },
      {
        path: 'admin/pi-bank',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-pi-bank').then((m) => m.AdminPiBankPage),
      },
      {
        path: 'admin/words',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-words').then((m) => m.AdminWordsPage),
      },
      {
        path: 'admin/releases',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-releases').then((m) => m.AdminReleasesPage),
      },
      {
        path: 'admin/features',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-features').then((m) => m.AdminFeaturesPage),
      },
      {
        path: 'admin/parents',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-parents').then((m) => m.AdminParents),
      },
      {
        path: 'profile',
        canActivate: [signedInGuard],
        canDeactivate: [unsavedGuard],
        loadComponent: () => import('./pages/my-profile').then((m) => m.MyProfilePage),
      },
      {
        path: 'parent',
        canActivate: [signedInGuard, parentGuard],
        loadComponent: () => import('./pages/parent-home').then((m) => m.ParentHome),
      },
      {
        path: 'parent/:email',
        canActivate: [signedInGuard, parentGuard],
        loadComponent: () => import('./pages/parent-child').then((m) => m.ParentChild),
      },
      {
        path: 'admin/import-students',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-import-students').then((m) => m.AdminImportStudents),
      },
      {
        path: 'admin/registrations',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-registrations').then((m) => m.AdminRegistrations),
      },
      {
        path: 'admin/courses',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-courses').then((m) => m.AdminCourses),
      },
      {
        path: 'admin/courses/:id/files',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-course-files').then((m) => m.AdminCourseFiles),
      },
      {
        path: 'admin/courses/:id/coursework',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-coursework').then((m) => m.AdminCoursework),
      },
      {
        path: 'admin/progress',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-progress').then((m) => m.AdminProgress),
      },
      {
        path: 'admin/progress/:course/:email',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-progress-student').then((m) => m.AdminProgressStudent),
      },
      {
        path: 'admin/tests',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-tests').then((m) => m.AdminTests),
      },
      {
        path: 'admin/tests/:id/results',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-test-results').then((m) => m.AdminTestResults),
      },
      {
        path: 'admin/questions',
        canActivate: [signedInGuard, adminGuard],
        loadComponent: () => import('./pages/admin-questions').then((m) => m.AdminQuestions),
      },
      {
        // My Learning: coursework, tests and results as tabs of one page.
        path: 'learning',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-learning').then((m) => m.StudentLearning),
        children: [
          { path: '', pathMatch: 'full', loadComponent: () => import('./pages/student-coursework').then((m) => m.StudentCourseworkPage) },
          { path: 'live', loadComponent: () => import('./pages/student-live-classes').then((m) => m.StudentLiveClasses) },
          { path: 'tests', loadComponent: () => import('./pages/student-tests').then((m) => m.StudentTests) },
          { path: 'topics', loadComponent: () => import('./pages/topic-tests').then((m) => m.TopicTests) },
          { path: 'results', loadComponent: () => import('./pages/student-results').then((m) => m.StudentResults) },
        ],
      },
      {
        path: 'analyse/topic-tests',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-analyse').then((m) => m.StudentAnalyse),
        data: { view: 'topic' },
      },
      {
        path: 'analyse/sectionals',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-analyse').then((m) => m.StudentAnalyse),
        data: { view: 'sectional' },
      },
      {
        path: 'analyse/mocks',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-analyse').then((m) => m.StudentAnalyse),
        data: { view: 'mock' },
      },
      {
        path: 'swot',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-swot').then((m) => m.StudentSwot),
      },
      {
        path: 'interview/question-bank',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-pi-bank').then((m) => m.StudentPiBank),
      },
      {
        path: 'tools/eligibility',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-eligibility').then((m) => m.StudentEligibility),
      },
      {
        path: 'tools/cutoffs',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-cutoffs').then((m) => m.StudentCutoffs),
      },
      {
        path: 'applications',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-applications').then((m) => m.StudentApplications),
      },
      {
        path: 'past-papers',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-past-papers').then((m) => m.StudentPastPapers),
        data: { view: 'attempt' },
      },
      {
        path: 'past-papers/explore',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-past-papers').then((m) => m.StudentPastPapers),
        data: { view: 'explore' },
      },
      {
        path: 'syllabus',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-syllabus').then((m) => m.StudentSyllabus),
      },
      {
        path: 'filter-topics',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-filter-topics').then((m) => m.StudentFilterTopics),
      },
      {
        path: 'vocabulary',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-vocab').then((m) => m.StudentVocab),
        data: { kind: 'vocabulary' },
      },
      {
        path: 'idioms',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-vocab').then((m) => m.StudentVocab),
        data: { kind: 'idioms' },
      },
      {
        path: 'daily-rc',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-release').then((m) => m.StudentRelease),
        data: { kind: 'daily_rc' },
      },
      {
        path: 'weekly-dilr',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-release').then((m) => m.StudentRelease),
        data: { kind: 'weekly_dilr' },
      },
      {
        path: 'feedback',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-feedback').then((m) => m.StudentFeedback),
      },
      {
        path: 'help',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-help').then((m) => m.StudentHelp),
      },
      {
        path: 'sectionals',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-sectionals').then((m) => m.StudentSectionals),
      },
      {
        path: 'mocks',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-mocks').then((m) => m.StudentMocks),
      },
      // The earlier addresses still work, so saved links don't break.
      { path: 'tests', pathMatch: 'full', redirectTo: 'learning/tests' },
      { path: 'results', pathMatch: 'full', redirectTo: 'learning/results' },
      { path: 'coursework', pathMatch: 'full', redirectTo: 'learning' },
      { path: 'courses', pathMatch: 'full', redirectTo: 'learning' },
      {
        path: 'tests/:id',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-test').then((m) => m.StudentTest),
      },
      {
        path: 'tests/:id/attempts/:number',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-attempt').then((m) => m.StudentAttempt),
      },
      { path: '**', loadComponent: () => import('./pages/not-found').then((m) => m.NotFound) },
    ],
  },
];

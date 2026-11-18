import { Routes } from '@angular/router';
import { adminGuard, platformGuard, signedInGuard, tenantGuard } from './core/guards';

// Every page belongs to an institute, named in the address: /aaptprep/login, /aaptprep/register, and so on.
// Once the platform has a domain, the institute will come from the web address instead.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/landing').then((m) => m.Landing),
  },
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
        path: 'tests',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-tests').then((m) => m.StudentTests),
      },
      {
        path: 'results',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/student-results').then((m) => m.StudentResults),
      },
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
      {
        path: 'courses',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/my-courses').then((m) => m.MyCourses),
      },
      { path: '**', loadComponent: () => import('./pages/not-found').then((m) => m.NotFound) },
    ],
  },
];

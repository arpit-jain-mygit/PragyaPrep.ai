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
      { path: '**', loadComponent: () => import('./pages/not-found').then((m) => m.NotFound) },
    ],
  },
];

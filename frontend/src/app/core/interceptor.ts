import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { SessionService } from './session.service';
import { TenantService } from './tenant.service';

/**
 * Adds two things to every call to our API:
 *  - X-Tenant, so the API knows which institute the page is for;
 *  - the signed-in person's token, if there is one for this institute.
 * If the API says the session is no longer valid, the saved session is cleared and the person goes to the login page.
 */
export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(environment.apiBase)) return next(request);

  const tenants = inject(TenantService);
  const sessions = inject(SessionService);
  const router = inject(Router);

  const slug = tenants.slug();
  const token = sessions.token(slug);

  const headers: Record<string, string> = {};
  if (slug) headers['X-Tenant'] = slug;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return next(request.clone({ setHeaders: headers })).pipe(
    catchError((error) => {
      if (token && slug && error instanceof HttpErrorResponse && error.status === 401) {
        sessions.clear(slug);
        router.navigate(['/', slug, 'login'], { queryParams: { ended: '1' } });
      }
      return throwError(() => error);
    }),
  );
};

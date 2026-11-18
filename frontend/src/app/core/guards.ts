import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';
import { TenantService } from './tenant.service';

/** Loads the institute named in the address before any of its pages open. The page itself shows an error if it fails. */
export const tenantGuard: CanActivateFn = async (route) => {
  const slug = route.paramMap.get('tenant') ?? '';
  await inject(TenantService).load(slug);
  return true;
};

/** Only people who are signed in may open the page. Everyone else goes to the login page. */
export const signedInGuard: CanActivateFn = () => {
  const tenants = inject(TenantService);
  const slug = tenants.slug();
  if (slug && inject(SessionService).get(slug)) return true;
  return inject(Router).createUrlTree(['/', slug ?? '', 'login']);
};

/** Only the institute's admin may open the page. Others go to their own home page. */
export const adminGuard: CanActivateFn = () => {
  const slug = inject(TenantService).slug();
  const member = inject(SessionService).member(slug);
  if (member?.role === 'tenant_admin') return true;
  return inject(Router).createUrlTree(['/', slug ?? '', member ? 'home' : 'login']);
};

/** Only a parent may open the page. Others go to their own home page. */
export const parentGuard: CanActivateFn = () => {
  const slug = inject(TenantService).slug();
  const member = inject(SessionService).member(slug);
  if (member?.role === 'parent') return true;
  const where = !member ? ['login'] : member.role === 'tenant_admin' ? ['admin', 'home'] : ['home'];
  return inject(Router).createUrlTree(['/', slug ?? '', ...where]);
};

/**
 * The platform admin's page. It belongs to the platform's own institute, so this loads that institute,
 * and only a signed-in platform admin may open it. Everyone else goes to the platform login page.
 */
export const platformGuard: CanActivateFn = async () => {
  // Angular only lets inject() run before the first await, so everything needed is fetched first.
  const tenants = inject(TenantService);
  const sessions = inject(SessionService);
  const router = inject(Router);

  await tenants.load('platform');
  if (sessions.member('platform')?.role === 'platform_admin') return true;
  return router.createUrlTree(['/', 'platform', 'login']);
};


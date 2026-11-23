import { TenantService } from '../core/tenant.service';

/** The learning address for this institute, for example /aaptprep/learning. */
export function learnBase(tenants: TenantService): string {
  return `/${tenants.slug()}/learning`;
}

// Shared helpers for the tests. Not part of the app itself.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../environments/environment';
import { Member, Registration, Session, TenantInfo } from './core/models';
import { SessionService } from './core/session.service';
import { TenantService } from './core/tenant.service';

export const API = environment.apiBase;

export const DEMO: TenantInfo = {
  slug: 'demo',
  name: 'Demo Institute',
  branding: { display_name: 'Demo Institute', primary_color: '#2563eb', logo_url: null },
};

export function memberOf(role: Member['role'], email = 'asha@example.com'): Member {
  return { email, first_name: 'Asha', last_name: 'Rao', role, status: 'approved' };
}

export function sessionFor(role: Member['role'], tenant = 'demo', token = 'token-1'): Session {
  return { access_token: token, token_type: 'bearer', expires_in: 3600, tenant, member: memberOf(role) };
}

export function registration(overrides: Partial<Registration> = {}): Registration {
  return {
    email: 'meera@example.com', first_name: 'Meera', last_name: 'Kapoor', birth_date: '2004-08-21', gender: 'female',
    mobile: '9876543210', whatsapp: '9876543210', address: 'B-14, Sector 62', city: 'Noida', pin_code: '201309',
    course_id: 'c1', course_name: 'CLAT', course_ids: ['c1'], course_names: ['CLAT'], status: 'pending', created_at: '2027-01-15T08:00:00+00:00',
    decided_by: '', decided_at: '', reason: '', ...overrides,
  };
}

/** Set up the test module the way the real app is wired, without the interceptor so the tests stay simple. */
export function setupTestBed(options: { queryParams?: Record<string, string>; params?: Record<string, string>; tenant?: boolean } = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: convertToParamMap(options.queryParams ?? {}),
            paramMap: convertToParamMap(options.params ?? {}),
          },
        },
      },
    ],
  });
  localStorage.clear();
  const tenants = TestBed.inject(TenantService);
  if (options.tenant !== false) {
    tenants.slug.set('demo');
    tenants.info.set(DEMO);
  }
  return {
    http: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
    sessions: TestBed.inject(SessionService),
    tenants,
    navigate: vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true),
  };
}

/**
 * Let all waiting work finish and redraw the page. It waits through a run of small steps instead of using
 * timers, so it also works when a test has switched on fake timers.
 */
export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  for (let step = 0; step < 25; step++) await Promise.resolve();
  fixture.detectChanges();
  await fixture.whenStable();
}

export function text(fixture: ComponentFixture<unknown>): string {
  return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
}

export function el<T extends HTMLElement = HTMLElement>(fixture: ComponentFixture<unknown>, selector: string): T {
  const found = (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  if (!found) throw new Error(`Nothing on the page matches ${selector}`);
  return found;
}

export function all<T extends HTMLElement = HTMLElement>(fixture: ComponentFixture<unknown>, selector: string): T[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<T>(selector));
}

/** Type into a field the way a person would, so the form picks it up. */
export function type(fixture: ComponentFixture<unknown>, selector: string, value: string): void {
  const field = el<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(fixture, selector);
  field.value = value;
  field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input'));
}

/** Click the button with this label. */
export function clickButton(fixture: ComponentFixture<unknown>, label: string): void {
  const button = all<HTMLElement>(fixture, 'button, a.btn').find((b) => b.textContent?.trim() === label);
  if (!button) throw new Error(`No button labelled "${label}". Buttons: ${all(fixture, 'button').map((b) => b.textContent?.trim())}`);
  button.click();
}

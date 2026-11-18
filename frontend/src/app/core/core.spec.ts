import { HttpClient, HttpErrorResponse, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API, DEMO, sessionFor } from '../testing';
import { toApiError } from './api.service';
import { formatDate, formatFee, formatSize, describeAccess } from './format';
import { adminGuard, parentGuard, platformGuard, signedInGuard } from './guards';
import { apiInterceptor } from './interceptor';
import { SessionService } from './session.service';
import { TenantService, readableTextColor } from './tenant.service';
import { UploadService } from './upload.service';

describe('SessionService', () => {
  let sessions: SessionService;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    sessions = TestBed.inject(SessionService);
  });

  it('remembers a session for the institute it belongs to', () => {
    sessions.save(sessionFor('student', 'demo', 'abc'));
    expect(sessions.token('demo')).toBe('abc');
    expect(sessions.member('demo')?.role).toBe('student');
  });

  it('keeps sessions for different institutes apart', () => {
    sessions.save(sessionFor('student', 'demo', 'abc'));
    expect(sessions.get('aaptprep')).toBeNull();
    expect(sessions.token('aaptprep')).toBeNull();
  });

  it('forgets a session once it has ended', () => {
    sessions.save({ ...sessionFor('student'), expires_in: -1 });
    expect(sessions.get('demo')).toBeNull();
  });

  it('clears a session', () => {
    sessions.save(sessionFor('student'));
    sessions.clear('demo');
    expect(sessions.get('demo')).toBeNull();
  });

  it('copes with damaged saved data', () => {
    localStorage.setItem('pragyaprep.session.demo', '{not json');
    expect(sessions.get('demo')).toBeNull();
  });

  it('has no member or token when no institute is known', () => {
    expect(sessions.member(null)).toBeNull();
    expect(sessions.token(null)).toBeNull();
  });
});

describe('readableTextColor', () => {
  it('uses white on dark colours and dark on light colours', () => {
    expect(readableTextColor('#2563eb')).toBe('#ffffff');
    expect(readableTextColor('#000000')).toBe('#ffffff');
    expect(readableTextColor('#ffffff')).toBe('#111827');
    expect(readableTextColor('#fde047')).toBe('#111827');
  });

  it('falls back to white for something that is not a colour', () => {
    expect(readableTextColor('blue')).toBe('#ffffff');
  });
});

describe('TenantService', () => {
  let tenants: TenantService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    tenants = TestBed.inject(TenantService);
    http = TestBed.inject(HttpTestingController);
    document.documentElement.removeAttribute('style');
  });

  it('loads an institute and applies its colour and name', async () => {
    const loading = tenants.load(' DEMO ');
    http.expectOne(`${API}/api/tenant`).flush({
      ...DEMO,
      branding: { display_name: 'Demo Institute', primary_color: '#fde047', logo_url: null },
    });
    await loading;

    expect(tenants.slug()).toBe('demo');
    expect(tenants.info()?.name).toBe('Demo Institute');
    expect(document.documentElement.style.getPropertyValue('--brand')).toBe('#fde047');
    expect(document.documentElement.style.getPropertyValue('--brand-text')).toBe('#111827');
    expect(document.title).toBe('Demo Institute');
  });

  it('does not load the same institute twice', async () => {
    const first = tenants.load('demo');
    http.expectOne(`${API}/api/tenant`).flush(DEMO);
    await first;
    await tenants.load('demo');
    http.expectNone(`${API}/api/tenant`);
  });

  it('records why an institute could not be loaded and removes its colours', async () => {
    document.documentElement.style.setProperty('--brand', '#123456');
    const loading = tenants.load('nobody');
    http.expectOne(`${API}/api/tenant`).flush({ detail: "We couldn't find that institute." }, { status: 404, statusText: 'Not Found' });
    await loading;

    expect(tenants.info()).toBeNull();
    expect(tenants.error()?.status).toBe(404);
    expect(tenants.error()?.detail).toBe("We couldn't find that institute.");
    expect(document.documentElement.style.getPropertyValue('--brand')).toBe('');
  });
});

describe('toApiError', () => {
  it('keeps a message and the field errors of a form', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: { detail: 'Please correct the marked fields.', errors: { mobile: 'Bad number' } },
    });
    expect(toApiError(error)).toMatchObject({ status: 422, detail: 'Please correct the marked fields.', errors: { mobile: 'Bad number' } });
  });

  it('keeps how long to wait', () => {
    const error = new HttpErrorResponse({ status: 429, error: { detail: 'Slow down.' }, headers: new HttpHeaders({ 'Retry-After': '20' }) });
    expect(toApiError(error).retryAfter).toBe(20);
  });

  it('explains a lost connection in plain words', () => {
    expect(toApiError(new HttpErrorResponse({ status: 0 })).detail).toContain("couldn't reach the server");
  });

  it('does not show a raw server error', () => {
    const detail = toApiError(new HttpErrorResponse({ status: 500, error: 'Internal Server Error' })).detail;
    expect(detail).toContain('Something went wrong on our side');
  });

  it('copes with anything else', () => {
    expect(toApiError(new Error('boom')).detail).toBe('Something went wrong. Please try again.');
  });
});

describe('apiInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let router: Router;
  let sessions: SessionService;
  let tenants: TenantService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([apiInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    sessions = TestBed.inject(SessionService);
    tenants = TestBed.inject(TenantService);
    tenants.slug.set('demo');
  });

  it('tells the API which institute the page is for', () => {
    http.get(`${API}/api/courses`).subscribe();
    expect(ctrl.expectOne(`${API}/api/courses`).request.headers.get('X-Tenant')).toBe('demo');
  });

  it('sends the sign-in token for this institute only', () => {
    sessions.save(sessionFor('student', 'demo', 'tok-demo'));
    sessions.save(sessionFor('student', 'other', 'tok-other'));
    http.get(`${API}/api/auth/me`).subscribe();
    expect(ctrl.expectOne(`${API}/api/auth/me`).request.headers.get('Authorization')).toBe('Bearer tok-demo');
  });

  it('sends no sign-in when nobody is signed in', () => {
    http.get(`${API}/api/courses`).subscribe();
    expect(ctrl.expectOne(`${API}/api/courses`).request.headers.has('Authorization')).toBe(false);
  });

  it('leaves calls to other websites alone', () => {
    sessions.save(sessionFor('student', 'demo', 'tok'));
    http.get('https://example.com/data').subscribe();
    const request = ctrl.expectOne('https://example.com/data').request;
    expect(request.headers.has('X-Tenant')).toBe(false);
    expect(request.headers.has('Authorization')).toBe(false);
  });

  it('signs the person out and sends them to the login page when the session is refused', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    sessions.save(sessionFor('student', 'demo', 'tok'));

    http.get(`${API}/api/auth/me`).subscribe({ error: () => undefined });
    ctrl.expectOne(`${API}/api/auth/me`).flush({ detail: 'Sign in first.' }, { status: 401, statusText: 'Unauthorized' });

    expect(sessions.get('demo')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/', 'demo', 'login'], { queryParams: { ended: '1' } });
  });

  it('does not treat a refused login attempt as an ended session', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    http.post(`${API}/api/auth/verify-code`, {}).subscribe({ error: () => undefined });
    ctrl.expectOne(`${API}/api/auth/verify-code`).flush({ detail: 'wrong' }, { status: 400, statusText: 'Bad Request' });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('guards', () => {
  let tenants: TenantService;
  let sessions: SessionService;
  const run = (guard: typeof signedInGuard) => TestBed.runInInjectionContext(() => guard({} as never, {} as never));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    tenants = TestBed.inject(TenantService);
    sessions = TestBed.inject(SessionService);
    tenants.slug.set('demo');
  });

  it('lets a signed-in person through', () => {
    sessions.save(sessionFor('student'));
    expect(run(signedInGuard)).toBe(true);
  });

  it('sends someone who is not signed in to the login page', () => {
    const result = run(signedInGuard);
    expect(String(result)).toBe('/demo/login');
  });

  it('lets the admin into admin pages', () => {
    sessions.save(sessionFor('tenant_admin'));
    expect(run(adminGuard)).toBe(true);
  });

  it('sends a student away from admin pages to their own home', () => {
    sessions.save(sessionFor('student'));
    expect(String(run(adminGuard))).toBe('/demo/home');
  });

  it('sends a signed-out person away from admin pages to the login page', () => {
    expect(String(run(adminGuard))).toBe('/demo/login');
  });

  it('lets a parent into parent pages and sends everyone else to their own home or the login page', () => {
    sessions.save(sessionFor('parent'));
    expect(run(parentGuard)).toBe(true);
    sessions.save(sessionFor('student'));
    expect(String(run(parentGuard))).toBe('/demo/home');
    sessions.save(sessionFor('tenant_admin'));
    expect(String(run(parentGuard))).toBe('/demo/admin/home');
    sessions.clear('demo');
    expect(String(run(parentGuard))).toBe('/demo/login');
  });
});

describe('format helpers', () => {
  it('shows fees with Indian digit grouping', () => {
    expect(formatFee(10000)).toBe('₹10,000');
    expect(formatFee(1250000)).toBe('₹12,50,000');
    expect(formatFee(0)).toBe('₹0');
  });

  it('describes how long access lasts', () => {
    expect(describeAccess({ type: 'unlimited' })).toBe('Unlimited');
    expect(describeAccess({ type: 'days', days: 365 })).toBe('365 days after payment');
    expect(describeAccess({ type: 'days', days: 1 })).toBe('1 day after payment');
    expect(describeAccess({ type: 'until_date', until: '2027-06-30' })).toBe('Until 30 Jun 2027');
  });

  it('shows a date in a readable way and leaves nonsense as it is', () => {
    expect(formatDate('2005-03-14')).toBe('14 Mar 2005');
    expect(formatDate('')).toBe('');
    expect(formatDate('not a date')).toBe('not a date');
  });
});

describe('formatSize', () => {
  it('shows sizes in plain units', () => {
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatSize(300 * 1024 * 1024)).toBe('300 MB');
    expect(formatSize(3 * 1024 ** 3)).toBe('3 GB');
    expect(formatSize(null)).toBe('');
  });
});

describe('UploadService', () => {
  /** A stand-in for the browser's request object, so the test can decide how storage answers. */
  class FakeRequest {
    static last: FakeRequest;
    upload: { onprogress?: (event: unknown) => void } = {};
    onload?: () => void;
    onerror?: () => void;
    status = 204;
    method = '';
    url = '';
    body?: FormData;
    constructor() { FakeRequest.last = this; }
    open(method: string, url: string) { this.method = method; this.url = url; }
    send(body: FormData) { this.body = body; }
  }

  const form = { url: 'https://s3.example/upload', fields: { key: 'k', policy: 'p' } };

  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeRequest);
    TestBed.configureTestingModule({});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts the fields first and the file last, and reports progress', async () => {
    const progress: number[] = [];
    const sending = TestBed.inject(UploadService).send(form, new File(['x'], 'a.pdf'), (p) => progress.push(p));
    const request = FakeRequest.last;
    expect(request.method).toBe('POST');
    expect(request.url).toBe(form.url);
    expect([...request.body!.keys()]).toEqual(['key', 'policy', 'file']);
    request.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 200 });
    request.onload?.();
    await sending;
    expect(progress).toEqual([25]);
  });

  it('rejects with a plain message when storage refuses', async () => {
    const sending = TestBed.inject(UploadService).send(form, new File(['x'], 'a.pdf'), () => undefined);
    FakeRequest.last.status = 403;
    FakeRequest.last.onload?.();
    await expect(sending).rejects.toMatchObject({ status: 403, detail: 'The upload was refused. Please try again.' });
  });

  it('rejects with a plain message when the connection fails', async () => {
    const sending = TestBed.inject(UploadService).send(form, new File(['x'], 'a.pdf'), () => undefined);
    FakeRequest.last.onerror?.();
    await expect(sending).rejects.toMatchObject({ status: 0 });
  });
});

describe('platformGuard', () => {
  let sessions: SessionService;
  const run = () => TestBed.runInInjectionContext(() => platformGuard({} as never, {} as never));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const tenants = TestBed.inject(TenantService);
    // The platform institute is already loaded, so the guard doesn't need to ask the API.
    tenants.slug.set('platform');
    tenants.info.set({ ...DEMO, slug: 'platform', name: 'PragyaPrep Platform' });
    sessions = TestBed.inject(SessionService);
  });

  it('lets a signed-in platform admin through', async () => {
    sessions.save(sessionFor('platform_admin', 'platform'));
    expect(await run()).toBe(true);
  });

  it('sends a signed-out person to the platform login page', async () => {
    expect(String(await run())).toBe('/platform/login');
  });

  it('does not let anyone who is not a platform admin through', async () => {
    sessions.save(sessionFor('tenant_admin', 'platform'));
    expect(String(await run())).toBe('/platform/login');
  });

  it('is not fooled by a platform admin session for another institute', async () => {
    sessions.save(sessionFor('platform_admin', 'demo'));
    expect(String(await run())).toBe('/platform/login');
  });
});

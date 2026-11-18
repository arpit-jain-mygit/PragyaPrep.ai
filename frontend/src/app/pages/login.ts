import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ApiError, CodeResult, Member } from '../core/models';
import { SessionService } from '../core/session.service';
import { TenantService } from '../core/tenant.service';

const RESEND_SECONDS = 30;

/** Where each kind of person lands after signing in. */
export function homeFor(member: Member, slug: string): string[] {
  if (member.role === 'platform_admin') return ['/', 'platform-admin'];
  return member.role === 'tenant_admin' ? ['/', slug, 'admin', 'home'] : member.role === 'parent' ? ['/', slug, 'parent'] : ['/', slug, 'home'];
}

/**
 * Log in with an emailed code. The page tells the person straight away if their email is not registered,
 * is waiting for approval, was not approved, or is paused. Only an approved email is sent a code.
 */
@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="card narrow" style="margin-inline: auto">
      <h1>Log in</h1>

      @if (ended()) {
        <div class="alert info" role="status">Your session ended. Please log in again.</div>
      }

      @if (step() === 'email') {
        <p class="muted">Enter the email address you registered with. We'll email you a 6-digit code.</p>

        @if (result(); as r) {
          <div class="alert" [class.info]="r.status === 'pending'" [class.warn]="r.status !== 'pending'" role="status" id="status-message">
            <p>{{ r.message }}</p>
            @if (!isPlatform() && (r.status === 'not_registered' || r.status === 'rejected')) {
              <a class="btn small" [routerLink]="['/', tenants.slug(), 'register']" [queryParams]="{ email: email.trim() }">
                {{ r.status === 'rejected' ? 'Register again' : 'Register' }}
              </a>
            }
          </div>
        }
        @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

        <form (ngSubmit)="sendCode()" novalidate>
          <div class="field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" [(ngModel)]="email" autocomplete="email" autofocus />
          </div>
          <button class="btn" type="submit" [disabled]="busy() || !email.trim()">{{ busy() ? 'Checking…' : 'Send me a code' }}</button>
        </form>
        @if (!isPlatform()) {
          <p class="hint" style="margin-top: 1rem">
            New here? <a [routerLink]="['/', tenants.slug(), 'register']">Register</a>
          </p>
        }
      } @else {
        <div class="alert ok" role="status">{{ result()?.message }} Sent to <strong>{{ email.trim() }}</strong>. It works for 10 minutes.</div>
        @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

        <form (ngSubmit)="verify()" novalidate>
          <div class="field">
            <label for="code">6-digit code</label>
            <input id="code" name="code" type="text" class="code-input" [(ngModel)]="code" inputmode="numeric"
                   autocomplete="one-time-code" maxlength="7" autofocus />
          </div>
          <button class="btn" type="submit" [disabled]="busy() || code.trim().length < 6">{{ busy() ? 'Checking…' : 'Log in' }}</button>
        </form>

        <div class="row" style="margin-top: 1rem">
          <button class="linklike" type="button" (click)="resend()" [disabled]="busy() || cooldown() > 0">
            {{ cooldown() > 0 ? 'Send a new code in ' + cooldown() + 's' : 'Send a new code' }}
          </button>
          <button class="linklike" type="button" (click)="startOver()">Use a different email</button>
        </div>
        <p class="hint">Can't find the email? Check your spam folder.</p>
      }
    </div>
  `,
})
export class Login implements OnInit {
  private readonly api = inject(ApiService);
  private readonly sessions = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly tenants = inject(TenantService);
  /** The platform's own login has no registration: its people are set up by the owner. */
  readonly isPlatform = computed(() => this.tenants.slug() === 'platform');

  email = '';
  code = '';
  readonly step = signal<'email' | 'code'>('email');
  readonly busy = signal(false);
  readonly result = signal<CodeResult | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly cooldown = signal(0);
  readonly ended = signal(false);

  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const slug = this.tenants.slug()!;
    const member = this.sessions.member(slug);
    if (member) {
      this.router.navigate(homeFor(member, slug), { replaceUrl: true });
      return;
    }
    const query = this.route.snapshot.queryParamMap;
    this.email = query.get('email') ?? '';
    this.ended.set(query.get('ended') === '1');
    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  async sendCode(): Promise<void> {
    if (this.busy() || !this.email.trim()) return;
    this.busy.set(true);
    this.error.set(null);
    this.result.set(null);
    try {
      const result = await this.api.requestCode(this.email.trim());
      this.result.set(result);
      if (result.status === 'code_sent') {
        this.code = '';
        this.step.set('code');
        this.startCooldown(RESEND_SECONDS);
      }
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async resend(): Promise<void> {
    await this.sendCode();
  }

  async verify(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const session = await this.api.verifyCode(this.email.trim(), this.code.trim());
      this.sessions.save(session);
      this.router.navigate(homeFor(session.member, session.tenant));
    } catch (error) {
      const problem = error as ApiError;
      this.error.set(problem);
      if (problem.status === 403) this.startOver(); // no longer approved: show the plain message on the first step
    } finally {
      this.busy.set(false);
    }
  }

  startOver(): void {
    this.stopTimer();
    this.cooldown.set(0);
    this.step.set('email');
    this.code = '';
  }

  private startCooldown(seconds: number): void {
    this.stopTimer();
    this.cooldown.set(seconds);
    this.timer = setInterval(() => {
      this.cooldown.update((n) => Math.max(0, n - 1));
      if (this.cooldown() === 0) this.stopTimer();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

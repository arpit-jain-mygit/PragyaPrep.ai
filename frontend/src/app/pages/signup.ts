import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ApiError, SignupForm } from '../core/models';
import { PERSONAS, Persona, loadPersona, savePersona } from '../core/persona';
import { SessionService } from '../core/session.service';
import { Icon } from '../ui/icon';
import { PersonaPicker } from '../ui/persona-picker';
import { PublicBar } from '../ui/public-bar';

/**
 * First-time sign-up with no one's approval. Pick who you are, fill a short form, type the 6-digit code emailed to you, and you are in.
 * An institute gets its own page on the Free plan; a student or parent gets the free plan with no institute.
 */
@Component({
  selector: 'app-signup',
  imports: [FormsModule, RouterLink, PublicBar, Icon, PersonaPicker],
  template: `
    <app-public-bar />
    <main class="page">
      <div class="signup-card">
        <div class="signup-head">
          <h1>Start free</h1>
          <p>No card, no waiting for approval.</p>
          <ol class="steps" aria-label="Progress">
            <li [class.now]="step() === 'form'" [class.done]="step() === 'code'"><span>1</span> Your details</li>
            <li [class.now]="step() === 'code'"><span>2</span> Verify email</li>
          </ol>
        </div>
        <div class="signup-body">
        @if (step() === 'form') {
          <p class="label">I am</p>
          <app-persona-picker [current]="kind()" (choose)="choose($event)" />
          <p class="hint" id="what"><app-icon name="check" [size]="15" /> {{ kind() === 'institute' ? 'Your own page on the Free plan. You can add one student and one parent to try it.' : 'Pick a course and open its free sub-topic. No institute needed.' }}</p>
          @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
          <form (ngSubmit)="sendCode()" novalidate>
            <div class="field"><label for="name">Your name</label><input id="name" name="name" type="text" placeholder="Full name" [(ngModel)]="name" autocomplete="name" /></div>
            <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" placeholder="you@example.com" [(ngModel)]="email" autocomplete="email" /></div>
            @if (kind() === 'institute') {
              <div class="field"><label for="institute">Institute name</label><input id="institute" name="institute" type="text" placeholder="NITA Coaching" [(ngModel)]="instituteName" /></div>
              <div class="field">
                <label for="slug">Short name for your page</label>
                <input id="slug" name="slug" type="text" placeholder="nita-coaching" [(ngModel)]="slug" autocapitalize="none" autocomplete="off" />
                <p class="hint">Students will open it at <strong>/{{ slug || 'nita-coaching' }}</strong>. Letters, digits and hyphens.</p>
              </div>
              <div class="field"><label for="color">Brand colour</label><input id="color" name="color" type="color" [(ngModel)]="color" /></div>
            }
            <button class="btn wide" type="submit" id="send" [disabled]="busy() || !name.trim() || !email.trim()">{{ busy() ? 'Sending…' : 'Email me a code' }}</button>
          </form>
          <p class="hint center" style="margin-top: 1rem">Already have an account? Use <strong>Log in</strong> at the top.</p>
        } @else {
          <div class="alert ok" role="status">We've emailed a 6-digit code to <strong>{{ email.trim() }}</strong>. It works for 10 minutes.</div>
          @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
          <form (ngSubmit)="finish()" novalidate>
            <div class="field"><label for="code">6-digit code</label><input id="code" name="code" type="text" class="code-input" [(ngModel)]="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" /></div>
            <button class="btn wide" type="submit" id="finish" [disabled]="busy() || code.trim().length < 6">{{ busy() ? 'Creating…' : 'Create my account' }}</button>
          </form>
          <p class="center" style="margin-top: 1rem"><button class="linklike" type="button" (click)="step.set('form')">Change my details</button></p>
        }
        </div>
      </div>
      <p class="center"><a routerLink="/pricing">Back to pricing</a></p>
    </main>
  `,
})
export class Signup implements OnInit {
  private readonly api = inject(ApiService);
  private readonly sessions = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly personas = PERSONAS;
  readonly kind = signal<Persona>('student');
  readonly step = signal<'form' | 'code'>('form');
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  name = '';
  email = '';
  instituteName = '';
  slug = '';
  color = '#2563eb';
  code = '';

  ngOnInit(): void {
    const wanted = this.route.snapshot.queryParamMap.get('as');
    const start = PERSONAS.find((p) => p.id === wanted)?.id ?? loadPersona() ?? 'student';
    this.kind.set(start);
  }

  choose(kind: Persona): void {
    this.kind.set(kind);
    savePersona(kind);
    this.error.set(null);
  }

  private form(): SignupForm {
    const base: SignupForm = { kind: this.kind(), email: this.email.trim(), name: this.name.trim() };
    return this.kind() === 'institute'
      ? { ...base, institute_name: this.instituteName.trim(), slug: this.slug.trim().toLowerCase(), primary_color: this.color }
      : base;
  }

  async sendCode(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.signupCode(this.form());
      this.code = '';
      this.step.set('code');
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async finish(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const session = await this.api.signup(this.form(), this.code.trim());
      this.sessions.save(session);
      await this.router.navigate(this.kind() === 'institute' ? ['/', session.tenant, 'admin', 'home'] : ['/', session.tenant, 'home']);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }
}

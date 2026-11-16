import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, Member } from '../core/models';
import { TenantService } from '../core/tenant.service';

/** A student's home page. Courses, payment and content arrive in the next steps. */
@Component({
  selector: 'app-student-home',
  template: `
    <div class="card narrow" style="margin-inline: auto">
      @if (error(); as problem) {
        <div class="alert error" role="alert">{{ problem.detail }}</div>
      }
      @if (member(); as m) {
        <h1>Welcome, {{ m.first_name }}</h1>
        <p class="muted">You are signed in as {{ m.email }}.</p>
        <div class="alert ok" role="status">Your registration with {{ tenants.info()?.branding?.display_name }} is approved.</div>
        <h2>What's next</h2>
        <p>Soon you'll be able to pay for your course here, upload your payment screenshot, and then watch videos and read PDFs.</p>
        <p class="muted small">These parts are being built. For now, you can see that your login works.</p>
      } @else if (!error()) {
        <p class="muted">Loading…</p>
      }
    </div>
  `,
})
export class StudentHome implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);
  readonly member = signal<Member | null>(null);
  readonly error = signal<ApiError | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.member.set(await this.api.me());
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }
}

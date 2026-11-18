import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ApiError, Member } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { StudentScheduleCard } from './student-schedule-card';

/** A student's home page, with a way into their courses. Payment arrives in a later step. */
@Component({
  selector: 'app-student-home',
  imports: [RouterLink, StudentScheduleCard],
  template: `
    <div class="card narrow" style="margin-inline: auto">
      @if (error(); as problem) {
        <div class="alert error" role="alert">{{ problem.detail }}</div>
      }
      @if (member(); as m) {
        <h1>Welcome, {{ m.first_name }}</h1>
        <p class="muted">You are signed in as {{ m.email }}.</p>
        <div class="alert ok" role="status">Your registration with {{ tenants.info()?.branding?.display_name }} is approved.</div>
        <h2>Your courses</h2>
        <p>Watch videos and read PDFs for the courses you have access to.</p>
        <a class="btn" [routerLink]="['/', tenants.slug(), 'courses']">Go to my courses</a>
        <p class="muted small" style="margin-top: 1rem">Paying for a course from here is coming soon. Until then, your institute gives you access.</p>
      } @else if (!error()) {
        <p class="muted">Loading…</p>
      }
    </div>
    @if (member()) { <app-student-schedule-card /> }
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

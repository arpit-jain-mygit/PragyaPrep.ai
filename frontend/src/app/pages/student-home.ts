import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, Member } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { StudentTiles } from './student-tiles';

/** A student's home page: a greeting and action tiles. Payment arrives in a later step. */
@Component({
  selector: 'app-student-home',
  imports: [StudentTiles],
  template: `
    @if (error(); as problem) {
      <div class="alert error" role="alert">{{ problem.detail }}</div>
    }
    @if (member(); as m) {
      <div class="page-head">
        <h1>Welcome, {{ m.first_name }}</h1>
        <span class="muted small">{{ m.email }}</span>
      </div>
      <app-student-tiles />
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
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

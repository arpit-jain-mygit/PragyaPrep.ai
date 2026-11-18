import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ApiError, AttemptResult, AttemptView } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';
import { TakeTest } from './take-test';
import { TestResult } from './test-result';

/** One attempt: the test being taken while it is in progress, or the result once it is finished. */
@Component({
  selector: 'app-student-attempt',
  imports: [RouterLink, Icon, TakeTest, TestResult],
  template: `
    @if (error(); as problem) {
      <div class="alert error" role="alert">{{ problem.detail }}</div>
      <a class="btn secondary small" [routerLink]="['/', tenants.slug(), 'learning', 'tests']"><app-icon name="arrow-left" [size]="16" /> Tests</a>
    }
    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (view(); as shown) {
      @if (shown.status === 'in_progress') {
        <app-take-test [attempt]="shown" (finished)="view.set($event)" />
      } @else {
        <app-test-result [result]="shown" />
      }
    }
  `,
})
export class StudentAttempt implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly tenants = inject(TenantService);

  readonly view = signal<AttemptView | AttemptResult | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const id = this.route.snapshot.paramMap.get('id') ?? '';
      const number = Number(this.route.snapshot.paramMap.get('number'));
      this.view.set(await this.api.attempt(id, number));
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }
}

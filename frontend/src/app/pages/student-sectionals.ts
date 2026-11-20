import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ApiError, StudentTestCard } from '../core/models';
import { TenantService } from '../core/tenant.service';

/**
 * Sectionals: tests on one section of the exam, from the institute's published sectionals. Each one opens the normal test page.
 */
@Component({
  selector: 'app-student-sectionals',
  imports: [RouterLink],
  template: `
    <div class="page-head"><h1>Sectionals</h1></div>
    <p class="hint">Practise one section at a time, under test conditions.</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="sectionals-error">{{ problem.detail }}</div> }
    @if (loaded()) {
      <ul class="plain-list">
        @for (test of tests(); track test.id) {
          <li class="card test-row" [attr.data-test]="test.id">
            <a [routerLink]="['/', tenants.slug(), 'tests', test.id]">{{ test.title }}</a>
            <span class="muted small">{{ test.question_count }} questions · {{ test.total_marks }} marks</span>
          </li>
        } @empty {
          <li class="muted" id="no-sectionals">No sectionals are open to you yet.</li>
        }
      </ul>
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class StudentSectionals implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);

  readonly tests = signal<StudentTestCard[]>([]);
  readonly loaded = signal(false);
  readonly error = signal<ApiError | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.tests.set(await this.api.myTests('sectional'));
      this.loaded.set(true);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }
}

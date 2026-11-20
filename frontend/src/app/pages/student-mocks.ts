import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ApiError, StudentTestCard } from '../core/models';
import { TenantService } from '../core/tenant.service';

/**
 * Mocks: full-length mocks in a grid, with the institute's free mock first. Each one opens the normal test page.
 */
@Component({
  selector: 'app-student-mocks',
  imports: [RouterLink],
  template: `
    <div class="page-head"><h1>Mocks</h1></div>
    <p class="hint">Full-length mocks. One of them is free for everyone.</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="mocks-error">{{ problem.detail }}</div> }
    @if (loaded()) {
      <div class="mock-grid">
        @for (mock of mocks(); track mock.id) {
          <a class="card mock-tile" [attr.data-test]="mock.id" [routerLink]="['/', tenants.slug(), 'tests', mock.id]">
            @if (mock.free) { <span class="tag">Free</span> }
            <strong>{{ mock.title }}</strong>
            <span class="muted small">{{ mock.question_count }} questions · {{ mock.total_marks }} marks</span>
          </a>
        } @empty {
          <p class="muted" id="no-mocks">No mocks are open to you yet.</p>
        }
      </div>
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
  styles: `
    .mock-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: 0.75rem; }
    .mock-tile { display: flex; flex-direction: column; gap: 0.35rem; border-bottom: 0; color: inherit; }
  `,
})
export class StudentMocks implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);

  readonly tests = signal<StudentTestCard[]>([]);
  readonly loaded = signal(false);
  readonly error = signal<ApiError | null>(null);

  /** The free mock first, then the rest in the order the institute listed them. */
  readonly mocks = computed(() => [...this.tests()].sort((a, b) => Number(!!b.free) - Number(!!a.free)));

  async ngOnInit(): Promise<void> {
    try {
      this.tests.set(await this.api.myTests('mock'));
      this.loaded.set(true);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }
}

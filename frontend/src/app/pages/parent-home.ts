import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { timeAgo } from '../core/format';
import { ApiError, ChildSummary, ProgressStatus } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Avatar } from '../ui/avatar';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

const STATUS: Record<ProgressStatus, string> = { behind: 'Behind', not_started: 'Not started', on_track: 'On track' };

/** A parent's home: each of their children with how they are doing in each course. */
@Component({
  selector: 'app-parent-home',
  imports: [RouterLink, Avatar, Icon, InfoTip],
  template: `
    <div class="page-head"><h1>Your children <app-info text="How each child is getting on with coursework and tests. Open a child to see what is overdue and where they need practice." /></h1></div>
    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (!children().length && !error()) {
      <div class="empty-state" id="no-children"><app-icon name="users" [size]="32" /><p>No child is linked to your account yet. Please ask your institute.</p></div>
    }
    @for (child of children(); track child.email) {
      <article class="card" [attr.data-child]="child.email">
        <div class="row q-head">
          <app-avatar [url]="child.avatar_url" [first]="child.name.split(' ')[0]" [last]="child.name.split(' ')[1] ?? ''" [email]="child.email" [size]="44" />
          <strong>{{ child.name }}</strong>
          <a class="btn small" style="margin-left: auto" [routerLink]="['/', tenants.slug(), 'parent', child.email]"><app-icon name="chart" [size]="16" /> Details</a>
        </div>
        @for (course of child.courses; track course.id) {
          <div class="parent-course" [attr.data-course]="course.name">
            <div class="row q-head">
              <strong>{{ course.name }}</strong>
              <span class="status" [class.bad]="course.row.status === 'behind'" [class.ok]="course.row.status === 'on_track'">{{ label(course.row.status) }}</span>
              @if (course.row.overdue) { <span class="status bad" title="Overdue items">{{ course.row.overdue }} overdue</span> }
            </div>
            <p class="soft" style="margin: 0.2rem 0 0">
              Coursework {{ course.row.cw_done }} of {{ course.row.cw_total }} · tests {{ course.row.tests_taken }} of {{ course.row.tests_available }}@if (course.row.avg_percent !== null) { · average {{ course.row.avg_percent }}% } · last active {{ ago(course.row.last_active) }}
            </p>
          </div>
        } @empty {
          <p class="soft">Not enrolled in a course yet.</p>
        }
      </article>
    }
  `,
})
export class ParentHome implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);

  readonly children = signal<ChildSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  ago = timeAgo;

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.children.set(await this.api.myChildren());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  label(status: ProgressStatus): string {
    return STATUS[status];
  }
}

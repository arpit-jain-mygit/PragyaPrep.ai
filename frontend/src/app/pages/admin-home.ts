import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AdminBehind, AdminHomeCounts } from '../core/models';
import { SessionService } from '../core/session.service';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';

/**
 * The admin's home: a tile for each thing that needs looking at, each a count that opens the screen that deals with it.
 * The simple counts arrive at once. "Behind" reads every student's records, so it loads on its own and the tile shows … until then.
 */
@Component({
  selector: 'app-admin-home',
  imports: [RouterLink, Icon],
  template: `
    <div class="page-head">
      <h1>Welcome, {{ name() }}</h1>
      <span class="muted small">{{ tenants.info()?.branding?.display_name }}</span>
    </div>

    <div class="tiles">
      <a class="tile" id="tile-pending" [class.alert-tile]="(counts()?.pending ?? 0) > 0" [routerLink]="[base(), 'admin', 'registrations']" [queryParams]="{ status: 'pending' }">
        <span class="tile-head"><app-icon name="users" [size]="22" /> Pending</span>
        <span class="tile-num" data-pending>{{ counts()?.pending ?? '…' }}</span>
      </a>

      <a class="tile" id="tile-students" [routerLink]="[base(), 'admin', 'registrations']" [queryParams]="{ status: 'approved' }">
        <span class="tile-head"><app-icon name="check" [size]="22" /> Students</span>
        <span class="tile-num" data-students>{{ counts()?.students ?? '…' }}</span>
      </a>

      <a class="tile" id="tile-behind" [class.alert-tile]="(behind()?.students ?? 0) > 0" [routerLink]="[base(), 'admin', 'progress']">
        <span class="tile-head"><app-icon name="flag" [size]="22" /> Behind</span>
        <span class="tile-num" data-behind>{{ behindFailed() ? '-' : (behind()?.students ?? '…') }}</span>
        @if (behind(); as b) { @if (b.students > 0) { <span class="tchips"><span class="tchip" data-behind-courses>in {{ b.courses }} {{ b.courses === 1 ? 'course' : 'courses' }}</span></span> } }
      </a>

      <a class="tile" id="tile-tests" [routerLink]="[base(), 'admin', 'tests']">
        <span class="tile-head"><app-icon name="clipboard" [size]="22" /> Tests open</span>
        <span class="tile-num" data-tests>{{ counts()?.tests_open ?? '…' }}</span>
      </a>

      <a class="tile" id="tile-questions" [routerLink]="[base(), 'admin', 'questions']">
        <span class="tile-head"><app-icon name="help" [size]="22" /> Questions</span>
        <span class="tile-num" data-questions>{{ counts()?.questions?.published ?? '…' }}</span>
        @if (counts(); as c) { @if (c.questions.draft > 0) { <span class="tchips"><span class="tchip" data-drafts>{{ c.questions.draft }} drafts</span></span> } }
      </a>

      <a class="tile" id="tile-courses" [routerLink]="[base(), 'admin', 'courses']">
        <span class="tile-head"><app-icon name="book" [size]="22" /> Courses</span>
        <span class="tile-num" data-courses>{{ counts()?.courses ?? '…' }}</span>
      </a>
    </div>
  `,
})
export class AdminHome implements OnInit {
  private readonly api = inject(ApiService);
  private readonly sessions = inject(SessionService);
  readonly tenants = inject(TenantService);

  readonly counts = signal<AdminHomeCounts | null>(null);
  readonly behind = signal<AdminBehind | null>(null);
  readonly behindFailed = signal(false);

  base(): string {
    return `/${this.tenants.slug()}`;
  }

  name(): string {
    return this.sessions.member(this.tenants.slug())?.first_name || 'admin';
  }

  ngOnInit(): void {
    // Each count loads on its own, so a slow or failing one leaves only its own tile waiting.
    void this.api.adminHome().then((counts) => this.counts.set(counts), () => undefined);
    void this.api.adminBehind().then((behind) => this.behind.set(behind), () => this.behindFailed.set(true));
  }
}

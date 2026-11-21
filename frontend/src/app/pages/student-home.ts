import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, Member, MyBatch } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Avatar } from '../ui/avatar';
import { BatchList } from '../ui/batch-list';
import { Icon } from '../ui/icon';
import { FreeHome } from './free-home';
import { StudentTiles } from './student-tiles';
import { WordOfDay } from './word-of-day';
import { DashboardProgress } from './dashboard-progress';
import { LeaderboardCard } from './leaderboard';
import { YesterdayWinnersCard } from './yesterday-winners';
import { TodaysPassages } from './todays-passages';

/** A student's home page: a greeting and action tiles. Payment arrives in a later step. */
@Component({
  selector: 'app-student-home',
  imports: [Avatar, BatchList, Icon, StudentTiles, FreeHome, WordOfDay, DashboardProgress, LeaderboardCard, YesterdayWinnersCard, TodaysPassages],
  template: `
    @if (error(); as problem) {
      <div class="alert error" role="alert">{{ problem.detail }}</div>
    }
    @if (tenants.slug() === 'free') {
      <app-free-home />
    } @else if (member(); as m) {
      <div class="page-head">
        <h1 class="greeting"><app-avatar [url]="m.avatar_url" [first]="m.first_name" [last]="m.last_name" [email]="m.email" [size]="76" /> Welcome, {{ m.first_name }}</h1>
        <span class="muted small">{{ m.email }}</span>
      </div>
      <app-dashboard-progress />
      <app-leaderboard />
      <app-yesterday-winners />
      <app-todays-passages />
      <app-student-tiles />
      <app-word-of-day />
      @if (batches().length) {
        <section class="card" id="my-batches"><h2><app-icon name="layers" [size]="18" /> My {{ batches().length === 1 ? 'batch' : 'batches' }}</h2><app-batch-list [batches]="batches()" /></section>
      }
      @if (contact(); as c) {
        <section class="card" id="contact-institute">
          <h2><app-icon name="building" [size]="18" /> Contact your institute</h2>
          @if (c.description) { <p class="muted">{{ c.description }}</p> }
          @if (c.exam_categories.length) { <p class="row">@for (x of c.exam_categories; track x) { <span class="chip approved">{{ x }}</span> }</p> }
          <ul class="plain-list">
            @if (c.city) { <li><app-icon name="flag" [size]="16" /> {{ c.city }}</li> }
            @if (c.contact_phone) { <li><app-icon name="clock" [size]="16" /> <a [href]="'tel:' + c.contact_phone">{{ c.contact_phone }}</a></li> }
            @if (c.contact_email) { <li><app-icon name="mail" [size]="16" /> <a [href]="'mailto:' + c.contact_email">{{ c.contact_email }}</a></li> }
            @if (c.website) { <li><app-icon name="link" [size]="16" /> <a [href]="c.website" target="_blank" rel="noopener noreferrer">{{ c.website }}</a></li> }
          </ul>
        </section>
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class StudentHome implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);
  readonly member = signal<Member | null>(null);
  readonly batches = signal<MyBatch[]>([]);
  /** What the institute chose to show, or nothing when it has filled in none of it. */
  readonly contact = computed(() => {
    const p = this.tenants.info()?.profile;
    return p && (p.description || p.city || p.contact_email || p.contact_phone || p.website || p.exam_categories.length) ? p : null;
  });
  readonly error = signal<ApiError | null>(null);

  async ngOnInit(): Promise<void> {
    if (this.tenants.slug() === 'free') return;
    try {
      this.member.set(await this.api.me());
    } catch (error) {
      this.error.set(error as ApiError);
      return;
    }
    // Batches are a bonus on the page: if they cannot be loaded the page works without them.
    try {
      this.batches.set(await this.api.myBatches());
    } catch {
      this.batches.set([]);
    }
  }
}

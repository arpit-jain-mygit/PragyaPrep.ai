import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { TodayPassage, TodayReleases } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';

/**
 * The Free Daily RC and Free Weekly DILR cards on the home page: today's passage and this week's set.
 * Each one shows its title and date, and the passage text opens when the student asks for it.
 * A card that the institute has switched off, or that has nothing released, is not shown.
 */
@Component({
  selector: 'app-todays-passages',
  imports: [Icon, DatePipe],
  template: `
    @if (today().daily_rc; as d) {
      <section class="card passage-card" id="daily-rc-card">
        <h2><app-icon name="book" [size]="18" /> Daily RC</h2>
        <p class="muted small">{{ d.date | date: 'd MMM yyyy' }}</p>
        <p><strong data-title>{{ d.title }}</strong></p>
        <button class="btn secondary small" type="button" data-toggle-daily (click)="dailyOpen.set(!dailyOpen())">{{ dailyOpen() ? 'Hide passage' : 'Read passage' }}</button>
        @if (dailyOpen()) { <div class="passage-text" data-text-daily style="white-space:pre-line">{{ d.text }}</div> }
      </section>
    }
    @if (today().weekly_dilr; as w) {
      <section class="card passage-card" id="weekly-dilr-card">
        <h2><app-icon name="layers" [size]="18" /> Weekly DILR</h2>
        <p class="muted small">Week from {{ w.date | date: 'd MMM yyyy' }}</p>
        <p><strong data-title>{{ w.title }}</strong></p>
        <button class="btn secondary small" type="button" data-toggle-weekly (click)="weeklyOpen.set(!weeklyOpen())">{{ weeklyOpen() ? 'Hide set' : 'Read set' }}</button>
        @if (weeklyOpen()) { <div class="passage-text" data-text-weekly style="white-space:pre-line">{{ w.text }}</div> }
      </section>
    }
  `,
})
export class TodaysPassages implements OnInit {
  private readonly api = inject(ApiService);
  private readonly tenants = inject(TenantService);

  readonly today = signal<TodayReleases>({ daily_rc: null, weekly_dilr: null });
  readonly dailyOpen = signal(false);
  readonly weeklyOpen = signal(false);

  async ngOnInit(): Promise<void> {
    if (!this.tenants.isOn('daily_rc') && !this.tenants.isOn('weekly_dilr')) return;
    try {
      this.today.set(await this.api.myReleasesToday());
    } catch {
      /* the cards stay hidden */
    }
  }
}

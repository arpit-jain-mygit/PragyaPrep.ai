import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { Oranges } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';

/**
 * Today's progress on the home page: the student's oranges for today against the institute's daily target,
 * and how many days in a row they have reached it. Shows nothing when the institute has oranges switched off.
 */
@Component({
  selector: 'app-dashboard-progress',
  imports: [Icon],
  template: `
    @if (oranges(); as o) {
      <section class="card dashboard-progress" id="todays-progress">
        <h2><app-icon name="flag" [size]="18" /> Today's progress</h2>
        <p><strong data-collected>{{ o.collected_today }}</strong> of <span data-target>{{ o.target }}</span> oranges today</p>
        <div role="progressbar" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="percent()" style="height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;margin:8px 0">
          <span data-bar [style.width.%]="percent()" style="display:block;height:100%;background:#f97316"></span>
        </div>
        <p class="muted small" data-streak>{{ o.days_strong }} {{ o.days_strong === 1 ? 'day' : 'days' }} strong in a row · {{ o.collected_total }} oranges so far</p>
      </section>
    }
  `,
})
export class DashboardProgress implements OnInit {
  private readonly api = inject(ApiService);
  private readonly tenants = inject(TenantService);

  readonly oranges = signal<Oranges | null>(null);

  /** How far today's count has got towards the target, up to 100. */
  readonly percent = computed(() => {
    const o = this.oranges();
    if (!o || o.target <= 0) return 0;
    return Math.min(100, Math.round((o.collected_today / o.target) * 100));
  });

  async ngOnInit(): Promise<void> {
    if (!this.tenants.isOn('dashboard_points')) return;
    try {
      this.oranges.set((await this.api.myOranges()).oranges);
    } catch {
      /* the card stays hidden */
    }
  }
}

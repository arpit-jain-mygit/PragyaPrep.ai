import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { YesterdayWinners } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';

/**
 * Yesterday's winners on the home page: the top three students by oranges on yesterday's day, and whether
 * the student was one of them. Shows nothing when the institute has it switched off, or nobody collected any.
 */
@Component({
  selector: 'app-yesterday-winners',
  imports: [Icon],
  template: `
    @if (winners(); as w) {
      <section class="card yesterday-winners" id="yesterday-winners">
        <h2><app-icon name="layers" [size]="18" /> Yesterday's winners</h2>
        @if (!w.top.length) {
          <p class="muted" id="no-winners">Nobody collected oranges yesterday.</p>
        } @else {
          <ol class="plain-list" id="winners">
            @for (row of w.top; track row.rank) {
              <li [attr.data-rank]="row.rank" [class.me]="row.me"><strong>{{ row.rank }}.</strong> {{ row.name }}{{ row.me ? ' (you)' : '' }} <span class="muted">{{ row.oranges }}</span></li>
            }
          </ol>
          @if (!w.me_in_top) {
            <p class="small muted" id="not-in-winners">Collect oranges today to be on tomorrow's list.</p>
          }
        }
      </section>
    }
  `,
})
export class YesterdayWinnersCard implements OnInit {
  private readonly api = inject(ApiService);
  private readonly tenants = inject(TenantService);

  readonly winners = signal<YesterdayWinners | null>(null);

  async ngOnInit(): Promise<void> {
    if (!this.tenants.isOn('yesterday_winners')) return;
    try {
      this.winners.set((await this.api.myYesterdayWinners()).yesterday_winners);
    } catch {
      /* the card stays hidden */
    }
  }
}

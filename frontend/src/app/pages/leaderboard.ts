import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { Leaderboard } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';

/**
 * The leaderboard on the home page: the students who collected the most oranges in the last seven days,
 * and where the student stands. Shows nothing when the institute has it switched off.
 */
@Component({
  selector: 'app-leaderboard',
  imports: [Icon],
  template: `
    @if (board(); as b) {
      <section class="card leaderboard" id="leaderboard">
        <h2><app-icon name="layers" [size]="18" /> Leaderboard</h2>
        <p class="muted small">Oranges collected in the last {{ b.days }} days</p>
        @if (!b.top.length) {
          <p class="muted" id="no-leaders">No oranges collected yet.</p>
        } @else {
          <ol class="plain-list" id="leaders">
            @for (row of b.top; track row.rank) {
              <li [attr.data-rank]="row.rank" [class.me]="row.me"><strong>{{ row.rank }}.</strong> {{ row.name }}{{ row.me ? ' (you)' : '' }} <span class="muted">{{ row.oranges }}</span></li>
            }
          </ol>
        }
        @if (b.me; as me) {
          @if (!b.top.some((row) => row.me)) {
            <p class="small" id="my-rank" data-my-rank>You are {{ me.rank }}{{ suffix(me.rank) }} with {{ me.oranges }} {{ me.oranges === 1 ? 'orange' : 'oranges' }}.</p>
          }
        }
      </section>
    }
  `,
})
export class LeaderboardCard implements OnInit {
  private readonly api = inject(ApiService);
  private readonly tenants = inject(TenantService);

  readonly board = signal<Leaderboard | null>(null);

  suffix(rank: number): string {
    if (rank % 100 >= 11 && rank % 100 <= 13) return 'th';
    return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[rank % 10] ?? 'th';
  }

  async ngOnInit(): Promise<void> {
    if (!this.tenants.isOn('leaderboard')) return;
    try {
      this.board.set((await this.api.myLeaderboard()).leaderboard);
    } catch {
      /* the card stays hidden */
    }
  }
}

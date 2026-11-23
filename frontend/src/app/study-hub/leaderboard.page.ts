import { Component, OnInit, inject, signal } from '@angular/core';
import { TenantService } from '../core/tenant.service';
import { learnBase } from './base';
import { RouterLink } from '@angular/router';
import { StudyHubApi } from './api';
import { LeaderRow } from './models';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>🏆 Global leaderboard</h1>
    <p class="sub">Everyone's points, all in one board. Play a level to climb.</p>

    @if (loading()) {
      <p class="sub">Counting points...</p>
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else if (rows().length === 0) {
      <p class="sub">No wizards yet. <a [routerLink]="hub">Start your spellbook</a> to be first!</p>
    } @else {
      <ol class="board">
        @for (row of rows(); track $index; let i = $index) {
          <li>
            <span class="rank">{{ i < 3 ? medals[i] : i + 1 }}</span>
            <span class="who">{{ row.name }}</span>
            <span class="pts">{{ row.points }} pts</span>
          </li>
        }
      </ol>
    }
  `,
  styles: [`
    h1 { font-family: var(--display); font-size: 30px; margin: 8px 0 4px; }
    .sub { color: var(--muted); }
    .error { color: var(--retry); }
    .board { list-style: none; padding: 0; margin: 12px 0 0; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
    .board li { display: grid; grid-template-columns: 48px 1fr auto; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
    .board li:last-child { border-bottom: 0; }
    .rank { font-family: var(--display); font-weight: 800; font-size: 20px; text-align: center; }
    .who { font-weight: 600; font-size: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pts { font-weight: 700; font-variant-numeric: tabular-nums; }
  `],
})
export class LeaderboardPage implements OnInit {
  readonly learn = learnBase(inject(TenantService));
  readonly hub = this.learn + '/study-hub';
  private api = inject(StudyHubApi);
  medals = ['🥇', '🥈', '🥉'];
  rows = signal<LeaderRow[]>([]);
  loading = signal(true);
  error = signal('');

  ngOnInit() {
    this.api.leaderboard(20).subscribe({
      next: (r) => {
        this.rows.set(r.rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load the leaderboard.');
        this.loading.set(false);
      },
    });
  }
}

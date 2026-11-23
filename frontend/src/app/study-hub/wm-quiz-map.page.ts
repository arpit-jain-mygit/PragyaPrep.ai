import { Component, OnInit, inject, signal } from '@angular/core';
import { TenantService } from '../core/tenant.service';
import { learnBase } from './base';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { StudyHubApi } from './api';
import { PlayerService } from './player';
import { WmChapter } from './models';

@Component({
  selector: 'app-wm-quiz-map',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>🎯 Quiz</h1>
    <p class="sub">Pick a chapter. Answer every question. Right answers earn points and candies.</p>

    @if (loading()) {
      <p class="sub">Loading the chapters...</p>
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else {
      @if (!code()) {
        <p class="hint">Start your wizard on <a [routerLink]="learn + '/vocabulary'">Word Wizard</a> to save your points.</p>
      }
      <div class="list">
        @for (ch of chapters(); track ch.chapter) {
          <a class="row" [routerLink]="[hub + '/wren-martin/quiz', ch.chapter]">
            <span class="num">Ch {{ ch.chapter }}</span>
            <span class="title">{{ ch.title }}</span>
            <span class="progress" [class.complete]="doneCount(ch.chapter) === ch.count">
              {{ doneCount(ch.chapter) }}/{{ ch.count }}
            </span>
          </a>
        }
      </div>
    }
  `,
  styles: [`
    h1 { font-family: var(--display); font-size: 30px; margin: 8px 0 4px; }
    .sub, .hint { color: var(--muted); margin: 0 0 16px; }
    .list { display: grid; gap: 8px; }
    .row { display: grid; grid-template-columns: 56px 1fr auto; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); color: var(--fg); text-decoration: none; min-height: 52px; }
    .row:hover { border-color: var(--accent); }
    .num { font-size: 13px; color: var(--accent); font-weight: 700; }
    .title { font-weight: 600; }
    .progress { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 14px; white-space: nowrap; }
    .progress.complete { color: var(--correct); font-weight: 700; }
    .error { color: var(--retry); }
  `],
})
export class WmQuizMapPage implements OnInit {
  readonly learn = learnBase(inject(TenantService));
  readonly hub = this.learn + '/study-hub';
  private api = inject(StudyHubApi);
  private player = inject(PlayerService);
  chapters = signal<WmChapter[]>([]);
  done = signal<Record<string, number>>({});
  loading = signal(true);
  error = signal('');

  code(): string | null {
    return this.player.profile()?.code ?? this.player.savedCode();
  }

  doneCount(chapter: number): number {
    return this.done()[String(chapter)] ?? 0;
  }

  ngOnInit() {
    const code = this.code();
    const onError = () => {
      this.error.set('Could not load the quiz. Please try again.');
      this.loading.set(false);
    };
    if (code) {
      forkJoin({ chapters: this.api.wmChapters(), progress: this.api.wmProgress(code) }).subscribe({
        next: (r) => {
          this.chapters.set(r.chapters.chapters);
          this.done.set(r.progress.done);
          this.loading.set(false);
        },
        error: onError,
      });
    } else {
      this.api.wmChapters().subscribe({
        next: (r) => {
          this.chapters.set(r.chapters);
          this.loading.set(false);
        },
        error: onError,
      });
    }
  }
}

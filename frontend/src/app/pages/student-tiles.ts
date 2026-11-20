import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { MyNotices, MyResults, StudentCoursework, StudentTestCard } from '../core/models';
import { ToTake, toTake } from '../core/schedule';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';

const none = { overdue: 0, thisWeek: 0, later: 0, next: null } satisfies ToTake;

/**
 * The student's home as action tiles: each shows a count and goes straight to the screen that deals with it.
 * Every tile loads on its own, so one failing call leaves a quiet tile, not a broken page.
 */
@Component({
  selector: 'app-student-tiles',
  imports: [RouterLink, Icon],
  template: `
    @if (loaded()) {
      <section class="card today" id="today">
        <h2><app-icon name="calendar" [size]="18" /> Today</h2>
        <ul class="plain-list">
          @if (tenants.isOn('tests') && running(); as test) { <li data-today="running"><app-icon name="play" [size]="18" /> <a [routerLink]="[base(), 'tests', test.id]">Carry on with {{ test.title }}</a></li> }
          @if (overdue() > 0) { <li data-today="overdue"><app-icon name="flag" [size]="18" /> <a [routerLink]="learningLink()" [queryParams]="courseworkLeft() > 0 ? { show: 'overdue' } : null">{{ overdue() }} overdue {{ overdue() === 1 ? 'item' : 'items' }} to catch up on</a></li> }
          @if (tenants.isOn('coursework') && (coursework()?.summary?.this_week ?? 0) > 0) { <li data-today="week"><app-icon name="book" [size]="18" /> <a [routerLink]="[base(), 'learning']" [queryParams]="{ show: 'week' }">{{ coursework()!.summary.this_week }} coursework {{ coursework()!.summary.this_week === 1 ? 'item' : 'items' }} due this week</a></li> }
          @if (tenants.isOn('tests') && take().thisWeek > 0) { <li data-today="tests"><app-icon name="clipboard" [size]="18" /> <a [routerLink]="[base(), 'learning', 'tests']">{{ take().thisWeek }} {{ take().thisWeek === 1 ? 'test' : 'tests' }} to take this week</a></li> }
          @if (tenants.isOn('notices') && (notices()?.action_unread ?? 0) > 0) { <li data-today="notices"><app-icon name="bell" [size]="18" /> <a [routerLink]="[base(), 'notices']">{{ notices()!.action_unread }} {{ notices()!.action_unread === 1 ? 'notice needs' : 'notices need' }} your action</a></li> }
          @if (caughtUp()) { <li class="caught-up" data-today="clear"><app-icon name="check" [size]="18" /> You are all caught up. Nothing is due.</li> }
        </ul>
      </section>
    }

  `,
})
export class StudentTiles implements OnInit {
  private readonly api = inject(ApiService);
  private readonly tenants = inject(TenantService);

  readonly take = signal<ToTake>(none);
  readonly running = signal<StudentTestCard | null>(null);
  readonly runningCount = signal(0);
  readonly results = signal<MyResults | null>(null);
  readonly coursework = signal<StudentCoursework | null>(null);
  readonly notices = signal<MyNotices | null>(null);
  readonly weak = signal({ count: 0, name: '', accuracy: '' });

  /** True once the lists that feed the Today card have arrived (or failed), so it never flashes "all caught up" while loading. */
  readonly loaded = signal(false);
  readonly caughtUp = computed(() =>
    (!this.tenants.isOn('tests') || !this.running()) && this.overdue() === 0
    && (!this.tenants.isOn('coursework') || (this.coursework()?.summary?.this_week ?? 0) === 0)
    && (!this.tenants.isOn('tests') || this.take().thisWeek === 0)
    && (!this.tenants.isOn('notices') || (this.notices()?.action_unread ?? 0) === 0));

  /** Whether any of the My Learning screens is on. When none is, the My Learning tile is hidden. */
  learningOn(): boolean {
    return this.tenants.isOn('coursework') || this.tenants.isOn('live_classes') || this.tenants.isOn('tests') || this.tenants.isOn('results');
  }

  readonly testsToTake = computed(() => (this.tenants.isOn('tests') ? this.take().overdue + this.take().thisWeek + this.take().later : 0));
  readonly courseworkLeft = computed(() => (this.tenants.isOn('coursework') ? this.coursework()?.summary.left ?? 0 : 0));
  readonly total = computed(() => this.testsToTake() + this.courseworkLeft());
  /** Overdue coursework and overdue tests together. */
  readonly overdue = computed(() => (this.tenants.isOn('tests') ? this.take().overdue : 0) + (this.tenants.isOn('coursework') ? this.coursework()?.summary.overdue ?? 0 : 0));

  /** Opens the Coursework tab, or the Tests tab when there is no coursework left to do. */
  learningLink(): string[] {
    return this.courseworkLeft() > 0 ? [this.base(), 'learning'] : [this.base(), 'learning', 'tests'];
  }

  base(): string {
    return `/${this.tenants.slug()}`;
  }

  ngOnInit(): void {
    const loads = [
      this.run(async () => {
        const tests = await this.api.myTests();
        this.take.set(toTake(tests));
        const going = tests.filter((t) => t.in_progress);
        this.running.set(going[0] ?? null);
        this.runningCount.set(going.length);
      }),
      this.run(async () => this.coursework.set(await this.api.myCoursework())),
      this.run(async () => this.notices.set(await this.api.myNotices())),
      this.run(async () => {
        const results = await this.api.myResults();
        this.results.set(results);
        const weak = results.subjects.filter((s) => Number(s.accuracy) < 50);
        if (weak.length) this.weak.set({ count: weak.length, name: weak[0].name, accuracy: weak[0].accuracy });
      }),
    ];
    void Promise.all(loads).then(() => this.loaded.set(true));
  }

  /** One tile's data failing must not spoil the others. */
  private async run(load: () => Promise<unknown>): Promise<void> {
    try {
      await load();
    } catch {
      /* the tile keeps its empty state */
    }
  }
}

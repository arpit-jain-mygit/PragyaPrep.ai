import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { MyCourse, MyResults, StudentCoursework, StudentTestCard } from '../core/models';
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
    <div class="tiles">
      <a class="tile" id="tile-tests" [class.alert-tile]="take().overdue > 0" [routerLink]="[base(), 'tests']">
        <span class="tile-head"><app-icon name="clipboard" [size]="22" /> To take</span>
        <span class="tile-num" data-total>{{ take().overdue + take().thisWeek + take().later }}</span>
        <span class="tchips">
          @if (take().overdue > 0) { <span class="tchip bad" data-overdue>{{ take().overdue }} overdue</span> }
          <span class="tchip" data-week>{{ take().thisWeek }} this week</span>
          <span class="tchip" data-later>{{ take().later }} later</span>
        </span>
      </a>

      @if (running(); as test) {
        <a class="tile" id="tile-continue" [attr.title]="test.title" [routerLink]="[base(), 'tests', test.id]">
          <span class="tile-head"><app-icon name="play" [size]="22" /> In progress</span>
          <span class="tile-num" data-running>{{ runningCount() }}</span>
          <span class="tchips"><span class="tchip">Tap to continue</span></span>
        </a>
      }

      @if (coursework(); as work) {
        @if (work.summary.total > 0) {
          <a class="tile" id="tile-coursework" [class.alert-tile]="work.summary.overdue > 0" [routerLink]="[base(), 'coursework']">
            <span class="tile-head"><app-icon name="layers" [size]="22" /> Coursework</span>
            <span class="tile-num" data-left>{{ work.summary.left }}</span>
            <span class="tchips">
              @if (work.summary.left === 0) { <span class="tchip" data-alldone>all done</span> }
              @if (work.summary.overdue > 0) { <span class="tchip bad" data-cw-overdue>{{ work.summary.overdue }} overdue</span> }
              @if (work.summary.left > 0) { <span class="tchip" data-cw-week>{{ work.summary.this_week }} this week</span> }
            </span>
          </a>
        }
      }

      <a class="tile" id="tile-courses" [routerLink]="[base(), 'courses']">
        <span class="tile-head"><app-icon name="book" [size]="22" /> Courses</span>
        <span class="tile-num" data-courses>{{ courses().length }}</span>
      </a>

      <a class="tile" id="tile-results" [routerLink]="[base(), 'results']">
        <span class="tile-head"><app-icon name="chart" [size]="22" /> Attempts</span>
        <span class="tile-num" data-attempts>{{ results()?.summary?.attempts ?? 0 }}</span>
        @if (results()?.summary?.attempts) {
          <span class="tchips">
            <span class="tchip">{{ results()!.summary.average }}% avg</span>
            <span class="tchip">{{ results()!.summary.tests_passed }} of {{ results()!.summary.tests_taken }} passed</span>
          </span>
        }
      </a>

      @if (weak().count > 0) {
        <a class="tile" id="tile-weak" [attr.title]="'Weakest: ' + weak().name" [routerLink]="[base(), 'results']">
          <span class="tile-head"><app-icon name="flag" [size]="22" /> Weak subjects</span>
          <span class="tile-num" data-weak>{{ weak().count }}</span>
        </a>
      }
    </div>
  `,
})
export class StudentTiles implements OnInit {
  private readonly api = inject(ApiService);
  private readonly tenants = inject(TenantService);

  readonly take = signal<ToTake>(none);
  readonly running = signal<StudentTestCard | null>(null);
  readonly runningCount = signal(0);
  readonly courses = signal<MyCourse[]>([]);
  readonly results = signal<MyResults | null>(null);
  readonly coursework = signal<StudentCoursework | null>(null);
  readonly weak = signal({ count: 0, name: '', accuracy: '' });

  base(): string {
    return `/${this.tenants.slug()}`;
  }

  ngOnInit(): void {
    void this.run(async () => {
      const tests = await this.api.myTests();
      this.take.set(toTake(tests));
      const going = tests.filter((t) => t.in_progress);
      this.running.set(going[0] ?? null);
      this.runningCount.set(going.length);
    });
    void this.run(async () => this.courses.set(await this.api.myCourses()));
    void this.run(async () => this.coursework.set(await this.api.myCoursework()));
    void this.run(async () => {
      const results = await this.api.myResults();
      this.results.set(results);
      const weak = results.subjects.filter((s) => Number(s.accuracy) < 50);
      if (weak.length) this.weak.set({ count: weak.length, name: weak[0].name, accuracy: weak[0].accuracy });
    });
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

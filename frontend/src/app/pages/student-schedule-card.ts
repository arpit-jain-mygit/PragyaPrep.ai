import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { StudentTestCard } from '../core/models';
import { dueLabel, isUrgent, scheduleGroups } from '../core/schedule';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';

/** On a student's home page: what is overdue, what closes soon, and what opens next. Left out if there are no tests. */
@Component({
  selector: 'app-student-schedule-card',
  imports: [RouterLink, Icon],
  template: `
    @if (shown().length) {
      <section class="card narrow schedule-card" style="margin: 1rem auto 0" aria-label="Your test schedule">
        <div class="row q-head">
          <h2 style="margin: 0"><app-icon name="clock" [size]="18" /> Your tests</h2>
          <div class="q-actions"><a class="btn small secondary" [routerLink]="['/', tenants.slug(), 'tests']">All tests</a></div>
        </div>
        @if (overdue() > 0) {
          <p class="alert error" role="status" data-overdue>
            <app-icon name="flag" [size]="16" /> {{ overdue() === 1 ? '1 test is overdue' : overdue() + ' tests are overdue' }}
          </p>
        }
        <ul class="schedule-list">
          @for (test of shown(); track test.id) {
            <li [attr.data-test]="test.title">
              <a [routerLink]="['/', tenants.slug(), 'tests', test.id]">{{ test.title }}</a>
              <span class="status" [class.warn]="urgent(test) || test.state === 'upcoming'" [class.ok]="test.state === 'open' && !urgent(test)" [class.bad]="test.overdue">{{ due(test) }}</span>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class StudentScheduleCard implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenants = inject(TenantService);

  readonly shown = signal<StudentTestCard[]>([]);
  readonly overdue = signal(0);

  async ngOnInit(): Promise<void> {
    try {
      const groups = scheduleGroups(await this.api.myTests());
      const part = (key: string) => groups.find((g) => g.key === key)?.tests ?? [];
      this.overdue.set(part('overdue').length);
      // The most pressing first: tests to finish, then the ones closing soonest, then what opens next. No more than five lines.
      this.shown.set([...part('overdue').slice(0, 2), ...part('open').slice(0, 3), ...part('upcoming').slice(0, 2)].slice(0, 5));
    } catch {
      this.shown.set([]);
    }
  }

  due(test: StudentTestCard): string {
    return test.overdue ? 'Overdue' : dueLabel(test);
  }

  urgent(test: StudentTestCard): boolean {
    return isUrgent(test);
  }
}

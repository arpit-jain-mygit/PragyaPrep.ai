import { Component, input } from '@angular/core';
import { formatDate } from '../core/format';
import { MyBatch } from '../core/models';
import { Icon } from './icon';

/** A student's batches (or a child's, for a parent): name, courses, dates, faculty and timetable. Nothing about other students. */
@Component({
  selector: 'app-batch-list',
  imports: [Icon],
  template: `
    @for (b of batches(); track b.id) {
      <div class="batch-line" [attr.data-my-batch]="b.name">
        <strong>{{ b.name }}</strong>
        <span class="row">@for (n of b.course_names; track n) { <span class="chip approved">{{ n }}</span> }</span>
        <span class="soft small">
          @if (b.start_date) { <app-icon name="calendar" [size]="14" /> {{ date(b.start_date) }}@if (b.end_date) { to {{ date(b.end_date) }} } }
          @if (b.faculty) { · {{ b.faculty }} }
        </span>
        @if (b.schedule) { <span class="soft small"><app-icon name="clock" [size]="14" /> {{ b.schedule }}</span> }
      </div>
    }
  `,
  styles: `:host { display: block; } .batch-line { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.5rem 0; border-top: 1px solid var(--line); } .batch-line:first-child { border-top: 0; }`,
})
export class BatchList {
  readonly batches = input<MyBatch[]>([]);
  readonly date = formatDate;
}

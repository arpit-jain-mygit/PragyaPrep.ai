import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, SyllabusTable } from '../core/models';

/**
 * Syllabus: each topic down the side, with how many of its questions came up in each year's past paper, and a total.
 */
@Component({
  selector: 'app-student-syllabus',
  template: `
    <div class="page-head"><h1>Syllabus</h1></div>
    <p class="hint">Topics by year. The numbers show how many questions from each topic came up in that year's paper.</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="syllabus-error">{{ problem.detail }}</div> }
    @if (table(); as t) {
      @if (t.rows.length) {
        <div class="table-wrap">
          <table class="compact" id="syllabus-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Topic</th>
                @for (year of t.years; track year) { <th>{{ year }}</th> }
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              @for (row of t.rows; track row.paper + row.topic) {
                <tr [attr.data-topic]="row.topic">
                  <td>{{ row.paper }}</td>
                  <td>{{ row.topic }}</td>
                  @for (year of t.years; track year) { <td>{{ row.counts[year] ?? 0 }}</td> }
                  <td><strong>{{ row.total }}</strong></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="muted" id="no-syllabus">No past papers have questions yet.</p>
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class StudentSyllabus implements OnInit {
  private readonly api = inject(ApiService);
  readonly table = signal<SyllabusTable | null>(null);
  readonly error = signal<ApiError | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.table.set(await this.api.mySyllabus());
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }
}

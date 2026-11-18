import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { formatDateTime } from '../core/format';
import { ApiError, StudentTestCard } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';
import { Modal } from '../ui/modal';

/** Before a test: what it holds and how it is marked, the student's earlier attempts, and the Start button. */
@Component({
  selector: 'app-student-test',
  imports: [RouterLink, Icon, Modal],
  template: `
    <div class="page-head">
      <h1>{{ test()?.title ?? 'Test' }}@if (test()?.set_by) { <span class="chip parent-tag" id="set-by-parent"> Set by your parent</span> }</h1>
      <a class="btn secondary small" [routerLink]="back()"><app-icon name="arrow-left" [size]="16" /> {{ tenants.slug() === 'free' ? 'Home' : 'Tests' }}</a>
    </div>

    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (instructions() && test(); as t) {
      <app-modal title="Before you begin" boxId="instructions" (close)="instructions.set(false)">
        <ul class="plain-list rules">
          <li><app-icon name="clock" [size]="16" /> You have <strong>{{ t.duration_minutes }} minutes</strong>. The clock starts now and keeps running even if you leave the page.</li>
          <li><app-icon name="check" [size]="16" /> {{ t.question_count }} questions, {{ sign(t.marks_correct) }} for a correct answer, {{ t.marks_incorrect === '0' ? 'nothing' : t.marks_incorrect }} for a wrong one, nothing if left blank.</li>
          <li><app-icon name="flag" [size]="16" /> Your answers are saved as you go. You can mark a question for review and come back to it.</li>
          <li><app-icon name="lock" [size]="16" /> When the time ends, the test is submitted for you with the answers saved so far.</li>
          <li><app-icon name="rotate" [size]="16" /> You have {{ t.attempts_left }} attempt{{ t.attempts_left === 1 ? '' : 's' }} left, and this uses one.</li>
        </ul>
        <ng-container slot="footer">
          <button class="btn secondary" type="button" id="instructions-cancel" (click)="instructions.set(false)">Not yet</button>
          <button class="btn" type="button" id="begin-test" [disabled]="starting()" (click)="start()">{{ starting() ? 'Starting…' : 'I am ready, start' }}</button>
        </ng-container>
      </app-modal>
    }
    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (test(); as t) {
      <div class="card" id="test-intro">
        @if (t.description) { <p id="test-description" style="white-space: pre-wrap">{{ t.description }}</p> }
        <dl class="details">
          <dt>Questions</dt><dd>{{ t.question_count }}</dd>
          <dt>Total marks</dt><dd>{{ t.total_marks }}</dd>
          <dt>Marking</dt><dd>{{ sign(t.marks_correct) }} for a correct answer, {{ t.marks_incorrect === '0' ? 'nothing' : t.marks_incorrect }} for a wrong one, nothing if left blank</dd>
          <dt>Time</dt><dd>{{ t.duration_minutes }} minutes</dd>
          <dt>Pass mark</dt><dd>{{ t.pass_percentage }}%</dd>
          <dt>Open</dt><dd>{{ window(t) }}</dd>
          <dt>Attempts</dt><dd>{{ t.attempts_used }} used, {{ t.attempts_left }} left</dd>
          <dt>Answers</dt><dd>{{ t.show_answers ? 'You can see the correct answers after you submit.' : 'Correct answers are not shown after you submit.' }}</dd>
        </dl>

        <div class="form-actions" style="margin-top: 1rem">
          @if (t.in_progress) {
            <button class="btn" type="button" id="start-test" [disabled]="starting()" (click)="start()"><app-icon name="play" /> Resume attempt {{ t.in_progress }}</button>
          } @else if (t.state === 'upcoming') {
            <span class="soft">This test isn't open yet.</span>
          } @else if (t.state === 'ended') {
            <span class="soft">This test has ended.</span>
          } @else if (t.attempts_left === 0) {
            <span class="soft">You have used all your attempts.</span>
          } @else {
            <button class="btn" type="button" id="start-test" [disabled]="starting()" (click)="instructions.set(true)"><app-icon name="play" /> Start test</button>
            <span class="soft">The clock starts when you click.</span>
          }
        </div>
      </div>

      @if (t.attempts.length) {
        <h2>Your attempts</h2>
        <div class="table-wrap">
          <table class="compact" id="attempts-table">
            <thead><tr><th>#</th><th>Started</th><th>Score</th><th>Result</th><th><span class="sr-only">Open</span></th></tr></thead>
            <tbody>
              @for (a of t.attempts; track a.number) {
                <tr [attr.data-attempt]="a.number">
                  <td>{{ a.number }}</td>
                  <td class="soft">{{ when(a.started_at) }}</td>
                  @if (a.status === 'submitted') {
                    <td>{{ a.marks }} / {{ a.total_marks }} ({{ a.percentage }}%)</td>
                    <td><span class="status" [class.ok]="a.passed" [class.bad]="!a.passed">{{ a.passed ? 'passed' : 'not passed' }}</span>@if (a.auto_submitted) { <span class="soft"> · time ran out</span> }</td>
                  } @else {
                    <td class="soft" colspan="2">In progress</td>
                  }
                  <td class="actions-cell"><a class="btn secondary small" [routerLink]="['/', tenants.slug(), 'tests', t.id, 'attempts', a.number]">{{ a.status === 'submitted' ? 'Result' : 'Resume' }}</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
})
export class StudentTest implements OnInit {
  /** Where the back button goes: a free learner has no tests list, so it goes home. */
  back(): string[] {
    return this.tenants.slug() === 'free' ? ['/', 'free', 'home'] : ['/', this.tenants.slug() ?? '', 'learning', 'tests'];
  }

  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly tenants = inject(TenantService);

  readonly test = signal<StudentTestCard | null>(null);
  readonly loading = signal(false);
  readonly starting = signal(false);
  readonly instructions = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly when = formatDateTime;

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.test.set(await this.api.myTest(this.route.snapshot.paramMap.get('id') ?? ''));
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  sign(marks: string): string {
    return marks.startsWith('-') ? marks : `+${marks}`;
  }

  window(t: StudentTestCard): string {
    if (!t.start_at && !t.end_at) return 'Any time';
    const from = t.start_at ? formatDateTime(t.start_at) : 'now';
    return t.end_at ? `${from} to ${formatDateTime(t.end_at)}` : `From ${from}`;
  }

  /** Start a new attempt, or carry on with the one in progress, then go to it. */
  async start(): Promise<void> {
    const t = this.test();
    if (!t || this.starting()) return;
    this.starting.set(true);
    this.error.set(null);
    try {
      const attempt = await this.api.startTest(t.id);
      await this.router.navigate(['/', this.tenants.slug(), 'tests', t.id, 'attempts', attempt.number]);
    } catch (error) {
      this.error.set(error as ApiError);
      this.starting.set(false);
      this.instructions.set(false);
    }
  }
}

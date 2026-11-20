import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ApiError, TopicTestsOverview } from '../core/models';
import { TenantService } from '../core/tenant.service';

/**
 * Topic tests: the subjects and topics a student can practise. Each topic says how many published questions it has.
 * Start makes a short practice test on that topic and opens it. A student who is not enrolled sees the list but can't start.
 */
@Component({
  selector: 'app-topic-tests',
  template: `
    <p class="hint">Practise one topic at a time. Each one makes a short test from the questions your institute has published.</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="topic-error">{{ problem.detail }}</div> }
    @if (data(); as d) {
      @if (!d.enrolled) { <div class="alert" id="not-enrolled">Topic tests open once you are enrolled in a course.</div> }
      @for (subject of d.subjects; track subject.id) {
        <section class="card subject" [attr.data-subject]="subject.id">
          <h2>{{ subject.name }}</h2>
          <ul class="plain-list">
            @for (topic of subject.topics; track topic.name) {
              <li class="topic-row" [attr.data-topic]="topic.name">
                <span>{{ topic.name }}</span>
                <span class="muted small">{{ topic.count }} {{ topic.count === 1 ? 'question' : 'questions' }}</span>
                <button class="btn small" type="button" [disabled]="!d.enrolled || busy()" (click)="start(subject.id, topic.name)">Start</button>
              </li>
            }
          </ul>
        </section>
      } @empty {
        <p class="muted" id="no-topics">No topics have published questions yet.</p>
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class TopicTests implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly tenants = inject(TenantService);

  readonly data = signal<TopicTestsOverview | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly busy = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.data.set((await this.api.myTopicTests()).topic_tests);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async start(paper: string, topic: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const made = await this.api.makePractice({ paper, topic, count: 10 });
      await this.router.navigate(['/', this.tenants.slug(), 'tests', made.id]);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ApiError, FilterTopicGroup } from '../core/models';
import { TenantService } from '../core/tenant.service';

/**
 * Filter topics: each subject's topics that appear in the past papers, with how many questions each has.
 * Practise makes a short practice test on that topic, the same way as Topic tests.
 */
@Component({
  selector: 'app-student-filter-topics',
  template: `
    <div class="page-head"><h1>Filter topics</h1></div>
    <p class="hint">Pick a topic from the past papers and practise it.</p>

    @if (error(); as problem) { <div class="alert error" role="alert" id="filter-error">{{ problem.detail }}</div> }
    @for (group of groups(); track group.paper) {
      <section class="card" [attr.data-paper]="group.paper">
        <h2>{{ group.paper }}</h2>
        <ul class="plain-list">
          @for (topic of group.topics; track topic.name) {
            <li class="topic-row" [attr.data-topic]="topic.name">
              <span>{{ topic.name }}</span>
              <span class="muted small">{{ topic.count }} {{ topic.count === 1 ? 'question' : 'questions' }}</span>
              <button class="btn small" type="button" [disabled]="busy()" (click)="practise(group.paper, topic.name)">Practise</button>
            </li>
          }
        </ul>
      </section>
    } @empty {
      @if (loaded()) { <p class="muted" id="no-filter-topics">No topics from the past papers yet.</p> }
    }
  `,
})
export class StudentFilterTopics implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly tenants = inject(TenantService);

  readonly groups = signal<FilterTopicGroup[]>([]);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.groups.set(await this.api.myFilterTopics());
      this.loaded.set(true);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async practise(paper: string, topic: string): Promise<void> {
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

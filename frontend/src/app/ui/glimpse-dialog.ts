import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { Icon } from './icon';

interface Outline { name: string; subjects: { name: string; topics: { title: string; subtopics: string[] }[] }[] }

/** A popup that shows what is inside the courses: course, subject, topic, sub-topic. Only the free sub-topic of each course is open. */
@Component({
  selector: 'app-glimpse-dialog',
  host: { '(document:keydown.escape)': 'close.emit()' },
  imports: [Icon],
  template: `
    <div class="dialog-backdrop" (click)="close.emit()"></div>
    <section class="card dialog" role="dialog" aria-label="Peek inside the courses" id="glimpse">
      <div class="row" style="justify-content: space-between">
        <h2 style="margin: 0">Peek inside</h2>
        <button class="icon-btn" type="button" title="Close" (click)="close.emit()"><app-icon name="x" /><span class="sr-only">Close</span></button>
      </div>
      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (!courses().length) {
        <p class="muted" id="glimpse-empty">Courses will show here soon.</p>
      } @else {
        <div class="glimpse-tabs" role="tablist">
          @for (c of courses(); track c.name) {
            <button type="button" role="tab" class="chip-btn" [class.on]="c.name === course()?.name" [attr.data-course]="c.name" (click)="chosen.set(c.name)">{{ c.name }}</button>
          }
        </div>
        @for (subject of course()?.subjects ?? []; track subject.name) {
          <div class="glimpse-subject" [attr.data-subject]="subject.name">
            <h3>{{ subject.name }}</h3>
            @for (topic of subject.topics; track topic.title) {
              <details [attr.data-topic]="topic.title">
                <summary>{{ topic.title }} <span class="soft">{{ topic.subtopics.length }}</span></summary>
                <ul class="plain-list">
                  @for (sub of topic.subtopics; track sub) {
                    <li [attr.data-sub]="sub">
                      @if (isFree(subject.name, topic.title, sub)) { <app-icon name="eye" [size]="15" class="ok-icon" /> {{ sub }} <span class="chip approved">Free</span> }
                      @else { <app-icon name="lock" [size]="15" class="soft-icon" /> <span class="soft">{{ sub }}</span> }
                    </li>
                  }
                </ul>
              </details>
            }
          </div>
        }
        <p class="soft">Free plan: one sub-topic per course is open. The rest unlocks with Popular.</p>
      }
    </section>
  `,
})
export class GlimpseDialog implements OnInit {
  private readonly api = inject(ApiService);
  readonly close = output<void>();
  readonly courses = signal<Outline[]>([]);
  readonly loading = signal(true);
  readonly chosen = signal<string | null>(null);
  readonly course = computed(() => this.courses().find((c) => c.name === this.chosen()) ?? this.courses()[0] ?? null);

  async ngOnInit(): Promise<void> {
    try {
      this.courses.set((await this.api.glimpse()).courses);
    } catch {
      this.courses.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  /** The open sub-topic of a course is its first one. */
  isFree(subject: string, topic: string, sub: string): boolean {
    const first = this.course()?.subjects[0];
    return first?.name === subject && first.topics[0]?.title === topic && first.topics[0].subtopics[0] === sub;
  }
}

import { Component, OnInit, inject, input, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, Passage, Release } from '../core/models';
import { Icon } from '../ui/icon';

type Kind = 'daily_rc' | 'weekly_dilr';

/**
 * One kind's section on the Releases page: the schedule (self or bulk), the add form, and the list of what is released.
 * Self: pick one passage and its date. Bulk: tick many passages, and they are released one per day (Daily RC)
 * or one per week (Weekly DILR) from the start date or after the last one already queued.
 */
@Component({
  selector: 'app-release-kind',
  imports: [],
  template: `
    <section class="card release-kind" [attr.data-kind]="kind()">
      <h2>{{ label() }}</h2>
      <p class="hint">{{ kind() === 'daily_rc' ? 'One passage a day.' : 'One set a week, shown for seven days.' }}</p>

      @if (loadError(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
      @if (error(); as problem) { <div class="alert error" role="alert" [attr.data-error]="kind()">{{ problem.detail }}</div> }
      @if (saved()) { <div class="alert ok" role="status" [attr.data-saved]="kind()">Saved.</div> }

      <fieldset>
        <legend>How to add them</legend>
        <label><input type="radio" name="mode-{{ kind() }}" value="self" [checked]="mode() === 'self'" (change)="mode.set('self')" /> Self: I choose the passage and its date</label>
        <label><input type="radio" name="mode-{{ kind() }}" value="queue" [checked]="mode() === 'queue'" (change)="mode.set('queue')" /> Bulk: release them in order, one per {{ kind() === 'daily_rc' ? 'day' : 'week' }}</label>
        @if (mode() === 'queue') {
          <label>Start from (optional) <input type="date" [attr.data-start]="kind()" [value]="start()" (input)="start.set(read($event))" /></label>
        }
        <button class="btn secondary small" type="button" [attr.data-save-schedule]="kind()" (click)="saveSchedule()">Save how to add</button>
      </fieldset>

      @if (mode() === 'self') {
        <fieldset>
          <legend>Add one</legend>
          <label>Passage
            <select [attr.data-pick-one]="kind()" [value]="one()" (change)="one.set(read($event))">
              <option value="">Choose a passage</option>
              @for (p of passages(); track p.id) { <option [value]="p.id">{{ p.title }}</option> }
            </select>
          </label>
          <label>{{ kind() === 'daily_rc' ? 'Day it goes live' : 'Week it starts' }} <input type="date" [attr.data-date]="kind()" [value]="day()" (input)="day.set(read($event))" /></label>
          <button class="btn small" type="button" [attr.data-add-one]="kind()" (click)="addOne()">Add</button>
        </fieldset>
      } @else {
        <fieldset>
          <legend>Add many, in order</legend>
          <ul class="plain-list">
            @for (p of passages(); track p.id) {
              <li><label><input type="checkbox" [attr.data-pick]="kind()" [checked]="chosen().includes(p.id)" (change)="toggle(p.id, $any($event.target).checked)" /> {{ p.title }}</label></li>
            }
          </ul>
          <button class="btn small" type="button" [attr.data-add-queue]="kind()" (click)="addQueue()">Add to the queue ({{ chosen().length }})</button>
        </fieldset>
      }

      <h3>Released</h3>
      @if (list(); as l) {
        @if (!l.items.length) { <p class="muted" [attr.data-empty]="kind()">Nothing released yet.</p> }
        <ul class="plain-list" [attr.data-list]="kind()">
          @for (row of l.items; track row.id) {
            <li [attr.data-release-id]="row.id"><strong>{{ row.date }}</strong> {{ row.title }} <button class="btn secondary small" type="button" (click)="remove(row)">Remove</button></li>
          }
        </ul>
      }
    </section>
  `,
})
export class ReleaseKind implements OnInit {
  private readonly api = inject(ApiService);

  readonly kind = input.required<Kind>();
  readonly label = input.required<string>();
  readonly passages = input.required<Passage[]>();

  readonly list = signal<{ items: Release[]; schedule: { mode: 'self' | 'queue'; start: string | null } } | null>(null);
  readonly mode = signal<'self' | 'queue'>('self');
  readonly start = signal('');
  readonly one = signal('');
  readonly day = signal('');
  readonly chosen = signal<string[]>([]);
  readonly loadError = signal<ApiError | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly saved = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const answer = await this.api.releases(this.kind());
      this.list.set(answer);
      this.mode.set(answer.schedule.mode);
      this.start.set(answer.schedule.start ?? '');
    } catch (error) {
      this.loadError.set(error as ApiError);
    }
  }

  read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  toggle(id: string, on: boolean): void {
    this.chosen.set(on ? [...this.chosen(), id] : this.chosen().filter((item) => item !== id));
  }

  async saveSchedule(): Promise<void> {
    this.reset();
    try {
      const body = this.mode() === 'queue' ? { mode: 'queue' as const, start: this.start() || null } : { mode: 'self' as const, start: null };
      await this.api.saveReleaseSchedule(this.kind(), body);
      this.saved.set(true);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async addOne(): Promise<void> {
    this.reset();
    try {
      await this.api.addReleases({ kind: this.kind(), passage_ids: this.one() ? [this.one()] : [], date: this.day() });
      await this.refresh();
      this.one.set('');
      this.day.set('');
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async addQueue(): Promise<void> {
    this.reset();
    try {
      await this.api.addReleases({ kind: this.kind(), passage_ids: this.chosen() });
      await this.refresh();
      this.chosen.set([]);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async remove(row: Release): Promise<void> {
    if (!window.confirm(`Take "${row.title}" off the ${row.date} release?`)) return;
    this.reset();
    try {
      await this.api.removeRelease(row.id);
      await this.refresh();
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  private async refresh(): Promise<void> {
    this.list.set(await this.api.releases(this.kind()));
  }

  private reset(): void {
    this.error.set(null);
    this.saved.set(false);
  }
}

/** The admin's Daily RC and Weekly DILR release page: each kind has its own schedule and list. */
@Component({
  selector: 'app-admin-releases',
  imports: [ReleaseKind, Icon],
  template: `
    <div class="page-head"><h1><app-icon name="calendar" /> Daily RC and Weekly DILR</h1></div>
    <p class="hint">Choose the passage or set each student sees, and when it goes live. Pick how you add them: one at a time with a date (self), or many at once released in order (bulk).</p>
    @if (loadError(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
    <app-release-kind kind="daily_rc" label="Daily RC" [passages]="passages()" />
    <app-release-kind kind="weekly_dilr" label="Weekly DILR" [passages]="passages()" />
  `,
})
export class AdminReleasesPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly passages = signal<Passage[]>([]);
  readonly loadError = signal<ApiError | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.passages.set(await this.api.passages());
    } catch (error) {
      this.loadError.set(error as ApiError);
    }
  }
}

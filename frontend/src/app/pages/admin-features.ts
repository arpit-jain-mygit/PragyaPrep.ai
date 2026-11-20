import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, FeatureRow } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';

/**
 * The institute admin's Features & labels page. The admin chooses which screens students see, what each one is called,
 * and the order they appear in. Screens that are not built yet are listed, but can't be switched on.
 */
@Component({
  selector: 'app-admin-features',
  imports: [Icon],
  template: `
    <div class="page-head"><h1><app-icon name="layers" /> Features and labels</h1></div>
    <p class="hint" id="features-intro">Choose which screens your students see, what each one is called, and the order they appear in. A screen marked <strong>Coming later</strong> is not built yet, so it can't be switched on.</p>

    @if (loadError(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
    @if (error(); as problem) { <div class="alert error" role="alert" id="save-error">{{ problem.detail }}</div> }
    @if (saved()) { <div class="alert ok" role="status" id="saved"><app-icon name="check" [size]="16" /> Saved. Students see the new names and order at their next page load.</div> }

    @for (section of sections(); track section.group) {
      <section class="card features-group" [attr.data-group]="section.group">
        <h2>{{ section.group }}</h2>
        <ul class="plain-list features-list">
          @for (row of section.rows; track row.key) {
            <li class="feature-row" [class.planned]="!row.built" [attr.data-key]="row.key">
              <label class="switch">
                <input type="checkbox" [checked]="row.enabled" [disabled]="!row.built" [attr.aria-label]="'Show ' + row.default_label" (change)="toggle(row.key, $any($event.target).checked)" />
                <span class="sr-only">Show {{ row.default_label }}</span>
              </label>
              <div class="feature-name">
                <input type="text" maxlength="40" [value]="row.label" [attr.aria-label]="'Name for ' + row.default_label" [disabled]="!row.built" (input)="rename(row.key, $any($event.target).value)" />
                @if (row.label !== row.default_label) {
                  <button class="btn secondary small" type="button" (click)="rename(row.key, row.default_label)">Use default name</button>
                }
              </div>
              @if (!row.built) { <span class="tag planned-tag">Coming later</span> }
              <div class="move">
                <button class="icon-btn" type="button" aria-label="Move up" title="Move up" [disabled]="row.position === 0" (click)="move(row.key, -1)"><app-icon name="chevron-up" [size]="16" /></button>
                <button class="icon-btn" type="button" aria-label="Move down" title="Move down" [disabled]="row.position === last()" (click)="move(row.key, 1)"><app-icon name="chevron" [size]="16" /></button>
              </div>
            </li>
          }
        </ul>
      </section>
    }

    <div class="actions">
      <button class="btn" type="button" id="save-features" [disabled]="busy()" (click)="save()">Save</button>
    </div>
  `,
})
export class AdminFeaturesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly tenants = inject(TenantService);

  readonly rows = signal<FeatureRow[]>([]);
  readonly loadError = signal<ApiError | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly saved = signal(false);
  readonly busy = signal(false);

  /** The rows grouped by area, in the order the institute chose. */
  readonly sections = computed(() => {
    const groups = new Map<string, FeatureRow[]>();
    for (const row of this.rows()) {
      if (!groups.has(row.group)) groups.set(row.group, []);
      groups.get(row.group)!.push(row);
    }
    return [...groups].map(([group, rows]) => ({ group, rows }));
  });

  readonly last = computed(() => this.rows().length - 1);

  async ngOnInit(): Promise<void> {
    try {
      const answer = await this.api.features();
      this.rows.set(answer.features);
    } catch (error) {
      this.loadError.set(error as ApiError);
    }
  }

  toggle(key: string, enabled: boolean): void {
    this.edit(key, (row) => ({ ...row, enabled }));
  }

  rename(key: string, label: string): void {
    this.edit(key, (row) => ({ ...row, label }));
  }

  /** Move a row up (-1) or down (1) in the whole list. The areas on screen follow the list. */
  move(key: string, step: number): void {
    const list = [...this.rows()];
    const from = list.findIndex((row) => row.key === key);
    const to = from + step;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    this.rows.set(list.map((row, position) => ({ ...row, position })));
    this.saved.set(false);
  }

  async save(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      const answer = await this.api.saveFeatures(this.rows().map((row) => ({ key: row.key, enabled: row.enabled, label: row.label.trim() })));
      this.rows.set(answer.features);
      // Refresh the institute's public details, so the student menu picks up the change straight away.
      this.tenants.update(await this.api.tenant());
      this.saved.set(true);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  private edit(key: string, change: (row: FeatureRow) => FeatureRow): void {
    this.rows.set(this.rows().map((row) => (row.key === key ? change(row) : row)));
    this.saved.set(false);
  }
}

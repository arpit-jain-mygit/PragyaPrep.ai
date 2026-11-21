import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, FeatureRow } from '../core/models';
import { MENU_ICONS } from '../ui/icon';
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
    <p class="hint" id="features-intro">Choose which screens your students see, what each one is called, and the order they appear in. A screen marked <strong>Coming later</strong> is not built yet, so it can't be switched on, but you can name it now.</p>

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
                <select class="feature-icon" [attr.aria-label]="'Icon for ' + row.default_label" [value]="row.icon ?? 'list'" (change)="setIcon(row.key, $any($event.target).value)">
                  @for (name of icons; track name) { <option [value]="name">{{ name }}</option> }
                </select>
                <app-icon [name]="row.icon ?? 'list'" [size]="18" />
                <input type="text" maxlength="40" [value]="row.label" [attr.aria-label]="'Name for ' + row.default_label" (input)="rename(row.key, $any($event.target).value)" />
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

    <section class="card" id="oranges-target">
      <h2>Daily target for oranges</h2>
      <p class="hint">Each coursework item a student marks done gives one orange. The target is how many a day makes a strong day (1 to 100).</p>
      <label class="field">Oranges a day <input id="target-input" type="number" min="1" max="100" [value]="target()" (input)="target.set(read($event))" /></label>
      <button class="btn secondary" type="button" id="save-target" [disabled]="busy()" (click)="saveTarget()">Save target</button>
      @if (targetError(); as problem) { <div class="alert error" role="alert" id="target-error">{{ problem.detail }}</div> }
      @if (targetSaved()) { <span class="muted small" id="target-saved" role="status">Saved.</span> }
    </section>

    <section class="card" id="menu-headings">
      <h2>Menu headings</h2>
      <p class="hint">The group headings in the student's left menu, and the Dashboard link. Each one shows the icon chosen here.</p>
      <ul class="plain-list features-list">
        @for (name of headingNames; track name) {
          <li class="feature-row" [attr.data-heading]="name">
            <div class="feature-name">
              <select class="feature-icon" [attr.aria-label]="'Icon for heading ' + name" [value]="headings()[name] ?? 'list'" (change)="setHeadingIcon(name, $any($event.target).value)">
                @for (icon of icons; track icon) { <option [value]="icon">{{ icon }}</option> }
              </select>
              <app-icon [name]="headings()[name] ?? 'list'" [size]="18" />
              <span>{{ name }}</span>
            </div>
          </li>
        }
      </ul>
      <button class="btn secondary" type="button" id="save-headings" [disabled]="busy()" (click)="saveHeadings()">Save headings</button>
      @if (headingsError(); as problem) { <div class="alert error" role="alert" id="headings-error">{{ problem.detail }}</div> }
      @if (headingsSaved()) { <span class="muted small" id="headings-saved" role="status">Saved.</span> }
    </section>

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
  readonly icons = MENU_ICONS;
  readonly busy = signal(false);
  readonly target = signal(10);
  readonly targetError = signal<ApiError | null>(null);
  readonly targetSaved = signal(false);
  readonly headingNames = ['Dashboard', 'Vocab builder', 'Overview', 'Learn', 'Practice', 'Past papers', 'Analyse', 'Forum', 'Interview', 'Tools', 'Help', 'My learning'];
  readonly headings = signal<Record<string, string>>({});
  readonly headingsError = signal<ApiError | null>(null);
  readonly headingsSaved = signal(false);

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
      this.target.set(answer.oranges_target ?? 10);
      this.headings.set((await this.api.menuHeadings()).headings);
    } catch (error) {
      this.loadError.set(error as ApiError);
    }
  }

  read(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  setHeadingIcon(name: string, icon: string): void {
    this.headings.set({ ...this.headings(), [name]: icon });
    this.headingsSaved.set(false);
  }

  /** Save the menu heading icons on their own, so they don't need the feature list to be saved too. */
  async saveHeadings(): Promise<void> {
    this.headingsError.set(null);
    this.headingsSaved.set(false);
    try {
      this.headings.set((await this.api.saveMenuHeadings(this.headings())).headings);
      this.headingsSaved.set(true);
    } catch (error) {
      this.headingsError.set(error as ApiError);
    }
  }

  /** Save the daily target for oranges on its own, so it doesn't need the feature list to be saved too. */
  async saveTarget(): Promise<void> {
    this.targetError.set(null);
    this.targetSaved.set(false);
    try {
      const saved = await this.api.setOrangesTarget(this.target());
      this.target.set(saved.target);
      this.targetSaved.set(true);
    } catch (error) {
      this.targetError.set(error as ApiError);
    }
  }

  toggle(key: string, enabled: boolean): void {
    this.edit(key, (row) => ({ ...row, enabled }));
  }

  rename(key: string, label: string): void {
    this.edit(key, (row) => ({ ...row, label }));
  }

  /** Choose the icon a menu item shows to students. */
  setIcon(key: string, icon: string): void {
    this.edit(key, (row) => ({ ...row, icon }));
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
      const answer = await this.api.saveFeatures(this.rows().map((row) => ({ key: row.key, enabled: row.enabled, label: row.label.trim(), icon: row.icon ?? 'list' })));
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

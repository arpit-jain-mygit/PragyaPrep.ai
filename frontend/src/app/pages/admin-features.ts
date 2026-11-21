import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
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
  imports: [Icon, NgTemplateOutlet],
  styles: [`
    .swatches { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.6rem 0; }
    .swatch { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.4rem 0.7rem; border: 1px solid var(--line); border-radius: 999px; background: var(--card, #fff); color: var(--ink); font: inherit; cursor: pointer; }
    .swatch.on { border-color: var(--ink); font-weight: 600; box-shadow: 0 0 0 2px var(--ink) inset; }
    .swatch-dot { display: inline-block; width: 1rem; height: 1rem; border-radius: 50%; }
    .colour-preview { display: flex; flex-wrap: wrap; gap: 1.2rem; margin-bottom: 0.8rem; padding: 0.8rem; border: 1px dashed var(--line); border-radius: 10px; background: #fff; color: #0f172a; }
    .design-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.6rem; margin: 0.6rem 0; }
    .design-choice { display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start; padding: 0.8rem; text-align: left; border: 1px solid var(--line); border-radius: 12px; background: var(--card, #fff); color: var(--ink); font: inherit; cursor: pointer; }
    .design-choice.on { border-color: var(--ink); box-shadow: 0 0 0 2px var(--ink) inset; }
    .design-choice strong { font-size: 1rem; }
    .design-preview { margin: 0.6rem 0 0.9rem; padding: 0.8rem; border: 1px solid var(--line); border-radius: 12px; background: var(--page, #f5f6f8); }
    /* A small drawing of a student's home page in each design. The same drawing is used for the thumbnails and the big preview. */
    .mock { display: flex; flex-direction: column; width: 100%; height: 6rem; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; font-size: 0; }
    .mock.big { height: 17rem; }
    .mock-top { display: block; height: 14%; }
    .mock-body { display: flex; flex: 1; min-height: 0; }
    .mock-side { display: flex; flex-direction: column; gap: 5px; width: 22%; padding: 6px 5px; }
    .mock-side i { display: block; height: 5px; border-radius: 3px; background: currentColor; opacity: 0.35; }
    .mock-main { display: flex; flex: 1; flex-direction: column; gap: 6px; min-width: 0; padding: 6px; }
    .mock-hero { display: block; height: 32%; border-radius: 6px; }
    .mock-cards { display: grid; flex: 1; grid-template-columns: 1fr 1fr; gap: 5px; }
    .mock-cards i { display: block; border-radius: 5px; border: 1px solid #e5e7eb; }
    .mock-tabs { display: none; }
    .mock-tabs i { display: block; flex: 1; height: 5px; margin: 0 4px; border-radius: 3px; background: #9ca3af; }
    .mock[data-look='exam'] { background: #0b1220; color: #94a3b8; }
    .mock[data-look='exam'] .mock-top { background: #2563eb; }
    .mock[data-look='exam'] .mock-side { background: #0f172a; }
    .mock[data-look='exam'] .mock-hero { background: #2563eb; }
    .mock[data-look='exam'] .mock-cards i { background: #111a2e; border-color: #1e293b; }
    .mock[data-look='warm'] { background: #fbf8f3; color: #57534e; }
    .mock[data-look='warm'] .mock-top { background: #b45309; }
    .mock[data-look='warm'] .mock-side { background: #ffffff; border-right: 1px solid #e7e1d8; }
    .mock[data-look='warm'] .mock-hero { background: #1c1917; }
    .mock[data-look='warm'] .mock-cards i { background: #ffffff; }
    .mock[data-look='mentor'] { background: #fff7f0; color: #6b7280; }
    .mock[data-look='mentor'] .mock-top { background: #0f766e; }
    .mock[data-look='mentor'] .mock-side { display: none; }
    .mock[data-look='mentor'] .mock-hero { background: #0f766e; }
    .mock[data-look='mentor'] .mock-cards i { background: #ffffff; }
    .mock[data-look='mentor'] .mock-tabs { display: flex; align-items: center; padding: 6px 0; background: #ffffff; border-top: 1px solid #f3e8dc; }
    .mock[data-look='mentor'] .mock-tabs i:first-child { background: #c2410c; }
    .mock[data-look='study'] { background: #f8fafc; color: #475569; }
    .mock[data-look='study'] .mock-top { background: #3730a3; }
    .mock[data-look='study'] .mock-side { background: #ffffff; border-right: 1px solid #e2e8f0; }
    .mock[data-look='study'] .mock-hero { background: #3730a3; }
    .mock[data-look='study'] .mock-cards i { background: #ffffff; border-color: #e2e8f0; }
    .mock[data-look='arena'] { background: #f5f3ff; color: #4c4a6b; }
    .mock[data-look='arena'] .mock-top { background: #2e1065; }
    .mock[data-look='arena'] .mock-side { background: #ffffff; border-right: 2px solid #1e1b4b; }
    .mock[data-look='arena'] .mock-hero { background: #2e1065; border: 2px solid #1e1b4b; }
    .mock[data-look='arena'] .mock-cards i { background: #ffffff; border: 2px solid #1e1b4b; }
    .mock[data-look='arena'] .mock-cards i:first-child { background: #bef264; }
    .mock.big[data-look='mentor'] { width: 12rem; margin: 0 auto; border-radius: 18px; }
    .preview-item { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 600; }
    .preview-item app-icon { color: var(--menu-icon, #4f46e5); }
  `],
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

    <section class="card" id="icon-colour">
      <h2>Menu icon colour</h2>
      <p class="hint">The colour of the icons in the student's left menu. Pale colours look dull on white, so use a strong one. The first colour is recommended.</p>
      <div class="swatches" role="radiogroup" aria-label="Menu icon colour">
        @for (option of colourOptions(); track option.hex) {
          <button type="button" class="swatch" role="radio" [class.on]="colour() === option.hex" [attr.aria-checked]="colour() === option.hex" [attr.data-colour]="option.hex" (click)="pickColour(option.hex)">
            <span class="swatch-dot" [style.background]="option.hex"></span>
            <span>{{ option.name }}</span>
            @if (option.hex === recommendedColour()) { <span class="tag">Recommended</span> }
          </button>
        }
      </div>
      <div class="colour-preview" id="colour-preview" aria-label="Preview of the menu icons" [style.--menu-icon]="colour()">
        <span class="preview-item"><app-icon name="book-open" [size]="18" /> Learn</span>
        <span class="preview-item"><app-icon name="play" [size]="18" /> Videos</span>
        <span class="preview-item"><app-icon name="clipboard" [size]="18" /> Topic tests</span>
      </div>
      <button class="btn secondary" type="button" id="save-colour" (click)="saveColour()">Save colour</button>
      @if (colourError(); as problem) { <div class="alert error" role="alert" id="colour-error">{{ problem.detail }}</div> }
      @if (colourSaved()) { <span class="muted small" id="colour-saved" role="status">Saved.</span> }
    </section>

    <section class="card" id="student-design">
      <h2>Student view design</h2>
      <p class="hint">Choose how the student's home page looks. Students see the design you pick here after you save it and they next load the site.</p>
      <div class="design-choices" role="radiogroup" aria-label="Student view design">
        @for (option of designOptions(); track option.key) {
          <button type="button" class="design-choice" role="radio" [class.on]="design() === option.key" [attr.aria-checked]="design() === option.key" [attr.data-choice]="option.key" (click)="pickDesign(option.key)">
            <ng-container *ngTemplateOutlet="drawing; context: { key: option.key, big: false }" />
            <strong>{{ option.name }}</strong>
            <span class="muted small">{{ option.text }}</span>
          </button>
        }
      </div>
      <div class="design-preview" id="design-preview" [attr.data-look]="design()"aria-label="Preview of the student home page in the chosen design">
        <p class="muted small">Student home page in <strong>{{ designName() }}</strong></p>
        <ng-container *ngTemplateOutlet="drawing; context: { key: design(), big: true }" />
      </div>
      <button class="btn secondary" type="button" id="save-design" (click)="saveDesign()">Save design</button>
      @if (designError(); as problem) { <div class="alert error" role="alert" id="design-error">{{ problem.detail }}</div> }
      @if (designSaved()) { <span class="muted small" id="design-saved" role="status">Saved.</span> }
    </section>

    <!-- The drawing of a student's home page, in the design named by key. Used for the thumbnails and the big preview. -->
    <ng-template #drawing let-key="key" let-big="big">
      <span class="mock" [class.big]="big" [attr.data-look]="key" aria-hidden="true">
        <span class="mock-top"></span>
        <span class="mock-body">
          <span class="mock-side"><i></i><i></i><i></i><i></i></span>
          <span class="mock-main">
            <span class="mock-hero"></span>
            <span class="mock-cards"><i></i><i></i><i></i><i></i></span>
          </span>
        </span>
        <span class="mock-tabs"><i></i><i></i><i></i><i></i></span>
      </span>
    </ng-template>

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
  /** The colours the admin can pick for the menu icons, recommended first. */
  readonly colourOptions = signal<{ hex: string; name: string }[]>([]);
  readonly colour = signal('#4f46e5');
  readonly colourError = signal<ApiError | null>(null);
  readonly colourSaved = signal(false);
  readonly recommendedColour = computed(() => this.colourOptions()[0]?.hex ?? '');
  /** The three student-view designs the admin can pick from, and the one in use. */
  readonly designOptions = signal<{ key: string; name: string; text: string }[]>([]);
  readonly design = signal('exam');
  readonly designError = signal<ApiError | null>(null);
  readonly designSaved = signal(false);
  readonly designName = computed(() => this.designOptions().find((option) => option.key === this.design())?.name ?? '');

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
      const icons = await this.api.iconColour();
      this.colourOptions.set(icons.options);
      this.colour.set(icons.colour);
      const designs = await this.api.studentDesign();
      this.designOptions.set(designs.options);
      this.design.set(designs.design);
    } catch (error) {
      this.loadError.set(error as ApiError);
    }
  }

  read(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  pickColour(hex: string): void {
    this.colour.set(hex);
    this.colourSaved.set(false);
  }

  /** Save the menu icon colour on its own, so it doesn't need the other settings to be saved too. */
  async saveColour(): Promise<void> {
    this.colourError.set(null);
    this.colourSaved.set(false);
    try {
      const saved = await this.api.saveIconColour(this.colour());
      this.colour.set(saved.colour);
      this.colourSaved.set(true);
    } catch (error) {
      this.colourError.set(error as ApiError);
    }
  }

  pickDesign(key: string): void {
    this.design.set(key);
    this.designSaved.set(false);
  }

  /** Save the student-view design on its own. Students see the saved design on their next visit or refresh. */
  async saveDesign(): Promise<void> {
    this.designError.set(null);
    this.designSaved.set(false);
    try {
      const saved = await this.api.saveStudentDesign(this.design());
      this.design.set(saved.design);
      this.designSaved.set(true);
    } catch (error) {
      this.designError.set(error as ApiError);
    }
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

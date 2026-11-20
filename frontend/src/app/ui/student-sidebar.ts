import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NoticeService } from '../core/notice.service';
import { TenantService } from '../core/tenant.service';
import { Icon } from './icon';

/**
 * Where each menu item leads. A built screen with no entry here has no page to open yet, so it is left out of the menu.
 * Paths are after the institute's name in the address, for example ['learning', 'topics'] for /demo/learning/topics.
 */
const PAGES: Record<string, string[]> = {
  coursework: ['learning'],
  topic_tests: ['learning', 'topics'],
  // Daily RC and Weekly DILR have no page of their own yet, so they are left out of the menu until they do.
  live_classes: ['learning', 'live'],
  tests: ['learning', 'tests'],
  results: ['learning', 'results'],
  notices: ['notices'],
};

interface MenuItem {
  key: string;
  label: string;
  link: string[];
}

interface MenuGroup {
  name: string;
  items: MenuItem[];
}

/**
 * The student's left menu. Its headings and items come from the institute's Features and labels page, so the
 * institute chooses what shows, what each item is called, and in what order. Headings can be folded away.
 */
@Component({
  selector: 'app-student-sidebar',
  imports: [RouterLink, RouterLinkActive, Icon],
  styles: `
    :host { display: block; color: inherit; }
    .side-nav { display: flex; flex-direction: column; gap: 0.25rem; }
    .side-item { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem 0.65rem; border-radius: 8px; color: inherit; border-bottom: 0; font-size: 0.95rem; }
    .side-item:hover { background: rgba(127, 127, 127, 0.12); }
    .side-item.active { background: var(--brand); color: var(--brand-text); font-weight: 600; }
    .side-home { font-weight: 600; }
    .side-heading { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 0.6rem; padding: 0.35rem 0.65rem; border: 0; background: none; color: inherit; opacity: 0.7; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; cursor: pointer; }
    .side-heading app-icon { transition: transform 0.15s; }
    .side-heading[aria-expanded='true'] app-icon { transform: rotate(90deg); }
    .side-items { list-style: none; margin: 0; padding: 0 0 0 0.4rem; display: flex; flex-direction: column; gap: 0.15rem; }
    .side-badge { min-width: 1.4rem; padding: 0 0.4rem; border-radius: 999px; background: var(--danger, #b91c1c); color: #fff; font-size: 0.75rem; text-align: center; }
  `,
  template: `
    <nav class="side-nav" aria-label="Student menu">
      <a class="side-item side-home" id="side-home" [routerLink]="['/', slug(), 'home']" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
        <span>Dashboard</span>
      </a>
      @for (group of groups(); track group.name) {
        <section class="side-group" [attr.data-group]="group.name">
          <button class="side-heading" type="button" [attr.aria-expanded]="!isFolded(group.name)" (click)="toggle(group.name)">
            <span>{{ group.name }}</span>
            <app-icon name="chevron-right" [size]="14" />
          </button>
          @if (!isFolded(group.name)) {
            <ul class="side-items">
              @for (item of group.items; track item.key) {
                <li>
                  <a class="side-item" [attr.data-key]="item.key" [routerLink]="item.link" routerLinkActive="active">
                    <span>{{ item.label }}</span>
                    @if (item.key === 'notices' && notices.unread() > 0) { <span class="side-badge" id="side-notice-badge">{{ notices.unread() }}</span> }
                  </a>
                </li>
              }
            </ul>
          }
        </section>
      }
    </nav>
  `,
})
export class StudentSidebar {
  private readonly tenants = inject(TenantService);
  readonly notices = inject(NoticeService);

  /** The institute's address part, used to build each link. */
  readonly slug = computed(() => this.tenants.slug() ?? '');

  /** The headings folded away by the student. Unfolded by default. */
  private readonly folded = signal<ReadonlySet<string>>(new Set());

  /**
   * The menu: one heading per group, in the order the institute chose. Only switched-on built items with a page appear.
   */
  readonly groups = computed<MenuGroup[]>(() => {
    const groups: MenuGroup[] = [];
    for (const row of this.tenants.info()?.features ?? []) {
      const page = PAGES[row.key];
      if (!row.enabled || !page) continue;
      let group = groups.find((existing) => existing.name === row.group);
      if (!group) {
        group = { name: row.group, items: [] };
        groups.push(group);
      }
      group.items.push({ key: row.key, label: row.label, link: ['/', this.slug(), ...page] });
    }
    return groups;
  });

  isFolded(name: string): boolean {
    return this.folded().has(name);
  }

  toggle(name: string): void {
    const next = new Set(this.folded());
    if (next.has(name)) next.delete(name);
    else next.add(name);
    this.folded.set(next);
  }
}

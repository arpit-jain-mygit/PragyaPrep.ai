import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AdminBehind, AdminHomeCounts } from '../core/models';
import { SessionService } from '../core/session.service';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';
import { Ring } from '../ui/ring';
import { StudentDrawer } from '../ui/student-drawer';
import { Registration } from '../core/models';

/**
 * The admin's home: a tile for each thing that needs looking at, each a count that opens the screen that deals with it.
 * The simple counts arrive at once. "Behind" reads every student's records, so it loads on its own and the tile shows … until then.
 */
@Component({
  selector: 'app-admin-home',
  imports: [RouterLink, FormsModule, Icon, Ring, StudentDrawer],
  template: `
    <div class="page-head">
      <h1>Welcome, {{ name() }}</h1>
    </div>

    @if (quick(); as who) { <app-student-drawer [email]="who" (close)="quick.set(null)" /> }
    <div class="find-student" id="find-student">
      <app-icon name="search" [size]="18" />
      <input id="find-input" name="find" type="search" placeholder="Find a student by name, email or mobile" autocomplete="off" [ngModel]="find()" (ngModelChange)="typed($event)" (focus)="loadStudents()" />
    </div>
    @if (find().trim()) {
      <div class="card find-results" id="find-results">
        @for (s of matches(); track s.email) {
          <button type="button" class="find-row" [attr.data-found]="s.email" (click)="open(s.email)">
            <strong>{{ s.first_name }} {{ s.last_name }}</strong> <span class="soft small">{{ s.email }} · {{ s.status }}</span>
          </button>
        } @empty { <p class="muted">{{ studentsLoaded() ? 'No one matches.' : 'Looking…' }}</p> }
      </div>
    }

    @if (steps(); as list) {
      @if (!hideChecklist() && doneCount() < list.length) {
        <section class="card checklist" id="checklist">
          <div class="row q-head">
            <app-ring [done]="doneCount()" [total]="list.length" [size]="52" />
            <div><strong>Set up your institute</strong><div class="soft small">{{ doneCount() }} of {{ list.length }} done</div></div>
            <button class="btn secondary small" type="button" id="checklist-hide" style="margin-left: auto" (click)="hideList()">Hide</button>
          </div>
          <ul class="plain-list steps">
            @for (step of list; track step.id) {
              <li [class.done]="step.done" [attr.data-step]="step.id">
                <app-icon [name]="step.done ? 'check' : step.icon" [size]="18" />
                <a [routerLink]="step.link">{{ step.text }}</a>
              </li>
            }
          </ul>
        </section>
      }
    }

    <div class="tiles">
      <a class="tile" id="tile-pending" [class.alert-tile]="(counts()?.pending ?? 0) > 0" [routerLink]="[base(), 'admin', 'registrations']" [queryParams]="{ status: 'pending' }">
        <span class="tile-head"><app-icon name="users" [size]="22" /> Pending</span>
        <span class="tile-num" data-pending>{{ counts()?.pending ?? '…' }}</span>
      </a>

      <a class="tile" id="tile-students" [routerLink]="[base(), 'admin', 'registrations']" [queryParams]="{ status: 'approved' }">
        <span class="tile-head"><app-icon name="check" [size]="22" /> Students</span>
        <span class="tile-num" data-students>{{ counts()?.students ?? '…' }}</span>
      </a>

      <a class="tile" id="tile-behind" [class.alert-tile]="(behind()?.students ?? 0) > 0" [routerLink]="[base(), 'admin', 'progress']">
        <span class="tile-head"><app-icon name="flag" [size]="22" /> Behind</span>
        <span class="tile-num" data-behind>{{ behindFailed() ? '-' : (behind()?.students ?? '…') }}</span>
        @if (behind(); as b) { @if ((b.students ?? 0) > 0) { <span class="tchips"><span class="tchip" data-behind-courses>in {{ b.courses }} {{ b.courses === 1 ? 'course' : 'courses' }}</span></span> } }
        @if (updating()) { <span class="tchips"><span class="tchip" data-behind-updating>updating…</span></span> }
      </a>

      <a class="tile" id="tile-tests" [routerLink]="[base(), 'admin', 'tests']">
        <span class="tile-head"><app-icon name="clipboard" [size]="22" /> Tests open</span>
        <span class="tile-num" data-tests>{{ counts()?.tests_open ?? '…' }}</span>
      </a>

      <a class="tile" id="tile-questions" [routerLink]="[base(), 'admin', 'questions']">
        <span class="tile-head"><app-icon name="help" [size]="22" /> Questions</span>
        <span class="tile-num" data-questions>{{ counts()?.questions?.published ?? '…' }}</span>
        @if (counts(); as c) { @if (c.questions.draft > 0) { <span class="tchips"><span class="tchip" data-drafts>{{ c.questions.draft }} drafts</span></span> } }
      </a>

      <a class="tile" id="tile-courses" [routerLink]="[base(), 'admin', 'courses']">
        <span class="tile-head"><app-icon name="book" [size]="22" /> Courses</span>
        <span class="tile-num" data-courses>{{ counts()?.courses ?? '…' }}</span>
      </a>
    </div>
  `,
})
export class AdminHome implements OnInit {
  private readonly api = inject(ApiService);
  private readonly sessions = inject(SessionService);
  readonly tenants = inject(TenantService);

  readonly counts = signal<AdminHomeCounts | null>(null);
  readonly behind = signal<AdminBehind | null>(null);
  readonly behindFailed = signal(false);
  /** True while the saved answer is being worked out again in the background. */
  readonly updating = signal(false);
  readonly quick = signal<string | null>(null);
  readonly find = signal('');
  readonly students = signal<Registration[]>([]);
  readonly studentsLoaded = signal(false);
  readonly hideChecklist = signal(this.readHidden());

  /** Matches for the search box: name, email or mobile, up to six. */
  readonly matches = computed(() => {
    const q = this.find().trim().toLowerCase();
    if (!q) return [];
    return this.students().filter((s) => `${s.first_name} ${s.last_name} ${s.email} ${s.mobile}`.toLowerCase().includes(q)).slice(0, 6);
  });

  /** The first-time set-up steps, each done once the thing exists. Nothing until the counts have arrived. */
  readonly steps = computed(() => {
    const c = this.counts();
    if (!c) return null;
    const p = this.tenants.info()?.profile;
    const b = this.base();
    return [
      { id: 'profile', icon: 'building', text: 'Add your institute details and logo', done: !!(p && (p.description || p.city || p.contact_email || p.contact_phone)) || !!this.tenants.info()?.branding.logo_url, link: [b, 'admin', 'institute'] },
      { id: 'course', icon: 'book', text: 'Add your first course', done: c.courses > 0, link: [b, 'admin', 'courses'] },
      { id: 'students', icon: 'users', text: 'Add or import your students', done: c.students + c.pending > 0, link: [b, 'admin', 'registrations'] },
      { id: 'questions', icon: 'help', text: 'Add questions to the question bank', done: c.questions.published > 0, link: [b, 'admin', 'questions'] },
      { id: 'test', icon: 'clipboard', text: 'Open a test for your students', done: c.tests_open > 0, link: [b, 'admin', 'tests'] },
    ];
  });
  readonly doneCount = computed(() => (this.steps() ?? []).filter((x) => x.done).length);

  private hiddenKey(): string {
    return `pragyaprep.checklist.${this.tenants.slug()}`;
  }

  private readHidden(): boolean {
    try {
      return localStorage.getItem(this.hiddenKey()) === '1';
    } catch {
      return false;
    }
  }

  hideList(): void {
    this.hideChecklist.set(true);
    try {
      localStorage.setItem(this.hiddenKey(), '1');
    } catch {
      /* nothing to do */
    }
  }

  typed(value: string): void {
    this.find.set(value);
    this.loadStudents();
  }

  /** The student list is fetched the first time the search is used, not on every visit to the home page. */
  loadStudents(): void {
    if (this.studentsLoaded() || this.students().length) return;
    void this.api.registrations('all').then((list) => {
      this.students.set(list);
      this.studentsLoaded.set(true);
    }, () => this.studentsLoaded.set(true));
  }

  open(email: string): void {
    this.quick.set(email);
  }

  base(): string {
    return `/${this.tenants.slug()}`;
  }

  name(): string {
    return this.sessions.member(this.tenants.slug())?.first_name || 'admin';
  }

  /** Show the saved answer at once; if it is missing or over 15 minutes old, work it out again behind the scenes and swap the number in. */
  private async loadBehind(): Promise<void> {
    try {
      const saved = await this.api.adminBehind();
      this.behind.set(saved.students === null ? null : saved);
      if (saved.fresh !== false) return;
    } catch {
      this.behindFailed.set(true);
      return;
    }
    this.updating.set(true);
    try {
      this.behind.set(await this.api.refreshBehind());
    } catch {
      // The saved number (if any) stays; with none, the tile shows a dash.
      if (this.behind() === null) this.behindFailed.set(true);
    } finally {
      this.updating.set(false);
    }
  }

  ngOnInit(): void {
    // Each count loads on its own, so a slow or failing one leaves only its own tile waiting.
    void this.api.adminHome().then((counts) => this.counts.set(counts), () => undefined);
    void this.loadBehind();
  }
}

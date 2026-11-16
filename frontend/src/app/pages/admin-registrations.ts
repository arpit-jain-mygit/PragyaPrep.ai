import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { GENDER_LABELS, formatDate, formatDateTime } from '../core/format';
import { ApiError, DecisionAction, Registration } from '../core/models';

const TABS = ['pending', 'approved', 'rejected', 'suspended', 'all'] as const;

interface Notice {
  kind: 'ok' | 'warn' | 'error';
  text: string;
}

/** The admin's review queue: look at each registration, then approve, reject, suspend or reactivate it. */
@Component({
  selector: 'app-admin-registrations',
  imports: [FormsModule],
  template: `
    <h1>Registrations</h1>
    <p class="muted">Review who has registered, and decide who may log in.</p>

    <div class="tabs" role="tablist" aria-label="Registration status">
      @for (tab of tabs; track tab) {
        <button class="tab" role="tab" type="button" [attr.aria-selected]="tab === active()" (click)="show(tab)">{{ tab }}</button>
      }
    </div>

    @if (notice(); as n) {
      <div class="alert" [class]="'alert ' + n.kind" [attr.role]="n.kind === 'error' ? 'alert' : 'status'">{{ n.text }}</div>
    }
    @if (loadError(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (items().length === 0 && !loadError()) {
      <div class="empty">No {{ active() === 'all' ? '' : active() }} registrations.</div>
    }

    @for (person of items(); track person.email) {
      <article class="item" [attr.data-email]="person.email">
        <div class="item-head">
          <div>
            <div class="item-title">{{ person.first_name }} {{ person.last_name }}</div>
            <div class="muted small">{{ person.email }}</div>
            <div class="small">{{ person.course_name }} &middot; registered {{ when(person.created_at) }}</div>
          </div>
          <span class="chip" [class]="'chip ' + person.status">{{ person.status }}</span>
        </div>

        @if (isOpen(person.email)) {
          <dl class="details">
            <dt>Birth date</dt><dd>{{ date(person.birth_date) }}</dd>
            <dt>Gender</dt><dd>{{ gender(person.gender) }}</dd>
            <dt>Mobile</dt><dd>{{ person.mobile }}</dd>
            <dt>WhatsApp</dt><dd>{{ person.whatsapp }}</dd>
            <dt>Address</dt><dd>{{ person.address }}, {{ person.city }} {{ person.pin_code }}</dd>
            @if (person.decided_by) {
              <dt>Last decision</dt><dd>by {{ person.decided_by }}, {{ when(person.decided_at) }}</dd>
            }
            @if (person.reason) { <dt>Reason given</dt><dd>{{ person.reason }}</dd> }
          </dl>
        }

        @if (rejecting() === person.email) {
          <div class="field" style="margin-top: 0.75rem">
            <label [attr.for]="'reason-' + person.email">Reason (optional, included in the email to the student)</label>
            <textarea [id]="'reason-' + person.email" name="reason" [(ngModel)]="reason" maxlength="300"></textarea>
          </div>
          <div class="actions">
            <button class="btn danger small" type="button" [disabled]="busy() === person.email" (click)="confirmReject(person)">Reject registration</button>
            <button class="btn secondary small" type="button" (click)="rejecting.set(null)">Cancel</button>
          </div>
        } @else {
          <div class="actions">
            <button class="btn secondary small" type="button" (click)="toggle(person.email)">{{ isOpen(person.email) ? 'Hide details' : 'Show details' }}</button>
            @if (person.status === 'pending' || person.status === 'rejected') {
              <button class="btn small" type="button" [disabled]="busy() === person.email" (click)="act('approve', person)">Approve</button>
            }
            @if (person.status === 'pending') {
              <button class="btn danger small" type="button" [disabled]="busy() === person.email" (click)="startReject(person.email)">Reject</button>
            }
            @if (person.status === 'approved') {
              <button class="btn danger small" type="button" [disabled]="busy() === person.email" (click)="act('suspend', person)">Suspend</button>
            }
            @if (person.status === 'suspended') {
              <button class="btn small" type="button" [disabled]="busy() === person.email" (click)="act('reactivate', person)">Reactivate</button>
            }
          </div>
        }
      </article>
    }
  `,
})
export class AdminRegistrations implements OnInit {
  private readonly api = inject(ApiService);

  readonly tabs = TABS;
  readonly active = signal<string>('pending');
  readonly items = signal<Registration[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<ApiError | null>(null);
  readonly notice = signal<Notice | null>(null);
  readonly busy = signal<string | null>(null);
  readonly rejecting = signal<string | null>(null);
  readonly open = signal<Set<string>>(new Set());
  reason = '';

  readonly date = formatDate;
  readonly when = formatDateTime;
  readonly gender = (value: string) => GENDER_LABELS[value] ?? value;

  ngOnInit(): void {
    void this.load();
  }

  async show(tab: string): Promise<void> {
    this.active.set(tab);
    this.notice.set(null);
    this.rejecting.set(null);
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.items.set(await this.api.registrations(this.active()));
    } catch (error) {
      this.items.set([]);
      this.loadError.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  isOpen(email: string): boolean {
    return this.open().has(email);
  }

  toggle(email: string): void {
    const next = new Set(this.open());
    next.has(email) ? next.delete(email) : next.add(email);
    this.open.set(next);
  }

  startReject(email: string): void {
    this.reason = '';
    this.rejecting.set(email);
  }

  async confirmReject(person: Registration): Promise<void> {
    await this.act('reject', person, this.reason);
  }

  async act(action: DecisionAction, person: Registration, reason?: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(person.email);
    this.notice.set(null);
    const name = `${person.first_name} ${person.last_name}`.trim();
    try {
      const result = await this.api.decide(action, person.email, reason);
      this.rejecting.set(null);
      const done = { approve: 'Approved', reject: 'Rejected', suspend: 'Suspended', reactivate: 'Reactivated' }[action];
      const emailed = action === 'approve' || action === 'reject';
      if (emailed && !result.email_sent) {
        this.notice.set({
          kind: 'warn',
          text: `${done} ${name}, but the email could not be sent. You may want to tell them yourself.`,
        });
      } else {
        this.notice.set({ kind: 'ok', text: `${done} ${name}.${emailed ? ' We emailed them.' : ''}` });
      }
    } catch (error) {
      // The most common cause is someone else changing the same registration, so show what happened and refresh.
      this.notice.set({ kind: 'error', text: (error as ApiError).detail });
    } finally {
      this.busy.set(null);
    }
    await this.load();
  }
}

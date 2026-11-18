import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { formatDate } from '../core/format';
import { ApiError, StudentQuick } from '../core/models';
import { Avatar } from './avatar';
import { Icon } from './icon';
import { Modal } from './modal';

/** The admin's side drawer: one student at a glance (details, courses open, batches, parents) without leaving the list. */
@Component({
  selector: 'app-student-drawer',
  imports: [Avatar, Icon, Modal],
  template: `
    <app-modal [title]="q() ? q()!.first_name + ' ' + q()!.last_name : 'Student'" [side]="true" boxId="student-drawer" (close)="close.emit()">
      @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
      @if (q(); as s) {
        <div class="row">
          <app-avatar [url]="s.avatar_url" [first]="s.first_name" [last]="s.last_name" [email]="s.email" [size]="56" />
          <div>
            <div id="quick-email">{{ s.email }}</div>
            <span class="status" [class.ok]="s.status === 'approved'" [class.warn]="s.status === 'pending'" [class.bad]="s.status === 'rejected'">{{ s.status }}</span>
          </div>
        </div>
        <dl class="details" style="margin-top: 0.8rem">
          <dt>Mobile</dt><dd>{{ s.mobile || '-' }}</dd>
          <dt>City</dt><dd>{{ s.city || '-' }}</dd>
          <dt>Joined</dt><dd>{{ s.created_at ? date(s.created_at) : '-' }}</dd>
          @if (s.target_exams.length) { <dt>Aiming for</dt><dd>{{ s.target_exams.join(', ') }}@if (s.exam_date) { , on {{ date(s.exam_date) }} }</dd> }
        </dl>
        <h3>Courses open</h3>
        @for (c of s.courses; track c.name) {
          <p class="row" [attr.data-quick-course]="c.name"><strong>{{ c.name }}</strong>
            <span class="status" [class.ok]="c.active">{{ c.active ? 'active' : 'ended' }}</span>
            <span class="soft small">{{ c.expires_at ? (c.active ? 'ends ' : 'ended ') + date(c.expires_at) : 'no end date' }}{{ c.source === 'batch' ? ' · from a batch' : '' }}</span></p>
        } @empty { <p class="muted">None yet.</p> }
        <h3>Batches</h3>
        <p class="row">@for (b of s.batches; track b) { <span class="chip approved">{{ b }}</span> } @empty { <span class="muted">Not in a batch.</span> }</p>
        <h3>Parents</h3>
        @for (p of s.parents; track p.email) { <p class="row"><app-icon name="users" [size]="16" /> {{ p.name }} <span class="soft small">{{ p.email }}</span></p> } @empty { <p class="muted">No parent linked.</p> }
        @if (s.deletion_requested) { <div class="alert warn" id="quick-deletion" role="note">This student has asked for their account to be deleted.</div> }
      } @else if (!error()) {
        <p class="muted">Loading…</p>
      }
    </app-modal>
  `,
})
export class StudentDrawer implements OnInit {
  private readonly api = inject(ApiService);
  readonly email = input.required<string>();
  readonly close = output<void>();
  readonly q = signal<StudentQuick | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly date = formatDate;

  async ngOnInit(): Promise<void> {
    try {
      this.q.set(await this.api.studentQuick(this.email()));
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }
}

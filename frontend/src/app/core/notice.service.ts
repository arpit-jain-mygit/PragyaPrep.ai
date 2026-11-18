import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

/** How many notices the signed-in student has not read yet, kept here so the top bar and the home page agree. */
@Injectable({ providedIn: 'root' })
export class NoticeService {
  private readonly api = inject(ApiService);

  readonly unread = signal(0);
  readonly actionUnread = signal(0);

  /** Ask the server. A failure leaves the numbers as they were: a missing badge must never break a page. */
  async refresh(): Promise<void> {
    try {
      this.set(await this.api.myNotices());
    } catch {
      /* keep the old numbers */
    }
  }

  set(counts: { unread: number; action_unread: number }): void {
    this.unread.set(counts.unread);
    this.actionUnread.set(counts.action_unread);
  }

  clear(): void {
    this.unread.set(0);
    this.actionUnread.set(0);
  }
}

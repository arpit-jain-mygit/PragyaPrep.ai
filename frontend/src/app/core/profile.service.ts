import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

/** The signed-in person's photo link, kept here so the top bar and the home page agree. Links last an hour, so this asks again on each visit. */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly api = inject(ApiService);

  readonly avatarUrl = signal('');

  /** A failure leaves the initials badge: a missing photo must never break a page. */
  async refresh(): Promise<void> {
    try {
      this.avatarUrl.set((await this.api.me()).avatar_url ?? '');
    } catch {
      /* keep what we had */
    }
  }

  clear(): void {
    this.avatarUrl.set('');
  }
}

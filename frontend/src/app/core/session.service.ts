import { Injectable, signal } from '@angular/core';
import { Member, Session } from './models';

interface StoredSession {
  session: Session;
  /** When the session ends, in milliseconds since 1970. */
  expiresAt: number;
}

const KEY_PREFIX = 'pragyaprep.session.';

/**
 * Remembers who is signed in, separately for each institute. A person signed in at one institute
 * is not signed in at another, which matches how the API treats sessions.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  /** Bumped whenever a session is saved or cleared, so screens that show the person can update. */
  private readonly changes = signal(0);

  /** The saved session for an institute, or null if there is none or it has ended. */
  get(tenant: string): Session | null {
    this.changes();
    try {
      const text = localStorage.getItem(KEY_PREFIX + tenant);
      if (!text) return null;
      const stored = JSON.parse(text) as StoredSession;
      if (stored.expiresAt <= Date.now()) {
        localStorage.removeItem(KEY_PREFIX + tenant);
        return null;
      }
      return stored.session;
    } catch {
      return null;
    }
  }

  member(tenant: string | null): Member | null {
    return tenant ? (this.get(tenant)?.member ?? null) : null;
  }

  token(tenant: string | null): string | null {
    return tenant ? (this.get(tenant)?.access_token ?? null) : null;
  }

  save(session: Session): void {
    const stored: StoredSession = { session, expiresAt: Date.now() + session.expires_in * 1000 };
    try {
      localStorage.setItem(KEY_PREFIX + session.tenant, JSON.stringify(stored));
    } catch {
      // Storage can be blocked (for example in a private window). The person just has to sign in again next time.
    }
    this.changes.update((n) => n + 1);
  }

  clear(tenant: string): void {
    try {
      localStorage.removeItem(KEY_PREFIX + tenant);
    } catch {
      // Nothing to remove.
    }
    this.changes.update((n) => n + 1);
  }
}

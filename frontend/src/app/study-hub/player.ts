import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';
import { SessionService } from '../core/session.service';
import { TenantService } from '../core/tenant.service';
import { StudyHubApi } from './api';
import { Profile } from './models';

const KEY = 'studyhub.code';

// Keeps the wizard's code in this browser, so kids come back to their points.
// The code is the only login: no email, no password, nothing personal to store.
@Injectable({ providedIn: 'root' })
export class PlayerService {
  private api = inject(StudyHubApi);
  private sessions = inject(SessionService);
  private tenants = inject(TenantService);
  readonly profile = signal<Profile | null>(null);

  savedCode(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  private remember(code: string) {
    try {
      localStorage.setItem(KEY, code);
    } catch {
      /* storage blocked: the player can still play this visit */
    }
  }

  forget() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    this.profile.set(null);
  }

  // The wizard to play with. A student who has none yet gets one on the spot, named after their first name,
  // so their first quiz already earns points and candies.
  ensure(): Observable<Profile> {
    const current = this.profile();
    if (current) return of(current);
    const saved = this.savedCode();
    if (saved) {
      return this.resume(saved).pipe(catchError(() => this.create(this.studentName())));
    }
    return this.create(this.studentName());
  }

  private studentName(): string {
    const first = (this.sessions.member(this.tenants.slug())?.first_name ?? '').trim().slice(0, 16);
    return first.length >= 2 ? first : 'Wizard';
  }

  create(name: string): Observable<Profile> {
    return this.api.createPlayer(name).pipe(
      tap((p) => {
        this.remember(p.code);
        this.profile.set(p);
      })
    );
  }

  resume(code: string): Observable<Profile> {
    return this.api.getPlayer(code.trim().toUpperCase()).pipe(
      tap((p) => {
        this.remember(p.code);
        this.profile.set(p);
      })
    );
  }

  refresh(): Observable<Profile> {
    const code = this.profile()?.code ?? this.savedCode() ?? '';
    return this.api.getPlayer(code).pipe(tap((p) => this.profile.set(p)));
  }

  update(p: Profile) {
    this.profile.set(p);
  }
}

import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { all, settle, setupTestBed, text } from '../testing';
import { HubPage } from './hub.page';
import { Profile } from './models';
import { PlayerService } from './player';
import { sessionFor } from '../testing';

describe('Study Hub home', () => {
  afterEach(() => localStorage.removeItem('studyhub.code'));

  it('shows the four study areas and no wizard start card when there is none yet', async () => {
    setupTestBed();
    const fixture = TestBed.createComponent(HubPage);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne((r) => r.url.endsWith('/api/my/study-hub/shop')).flush({ items: [] });
    await settle(fixture);

    const names = all(fixture, 'section.choices a.big strong').map((s) => s.textContent?.trim());
    expect(names).toEqual(['Word Wizard', 'Wren & Martin Grammar', 'Cambridge Maths Stage 8', 'Cambridge English Stage 8']);
    expect(text(fixture)).not.toContain('Choose a wizard name');
  });

  it('greets a returning wizard by name and hides the start card', async () => {
    setupTestBed();
    localStorage.setItem('studyhub.code', 'ABC123');
    const fixture = TestBed.createComponent(HubPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const profile: Profile = { code: 'ABC123', name: 'Maya', points: 40, candies: 7, streak: 0, owned: [], equipped: {} };
    http.expectOne((r) => r.url.endsWith('/api/my/study-hub/players/ABC123')).flush(profile);
    http.expectOne((r) => r.url.endsWith('/api/my/study-hub/shop')).flush({ items: [] });
    await settle(fixture);

    expect(text(fixture)).toContain('Hi, Maya!');
    expect(text(fixture)).not.toContain('Choose a wizard name');
  });

  it('makes a wizard named after the student the first time they need one', () => {
    const env = setupTestBed();
    env.sessions.save(sessionFor('student'));
    const http = TestBed.inject(HttpTestingController);
    let made: Profile | undefined;
    TestBed.inject(PlayerService).ensure().subscribe((p) => (made = p));
    const req = http.expectOne((r) => r.url.endsWith('/api/my/study-hub/players'));
    expect(req.request.body).toEqual({ name: 'Asha' });
    req.flush({ code: 'NEW123', name: 'Asha', points: 0, candies: 0, streak: 0, owned: [], equipped: {} });
    expect(made?.code).toBe('NEW123');
    expect(localStorage.getItem('studyhub.code')).toBe('NEW123');
  });
});

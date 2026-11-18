import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { busyInterceptor } from '../core/busy.interceptor';
import { BusyService } from '../core/busy.service';
import { BusyCursor, IIM_BADGES } from './busy-cursor';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('BusyService', () => {
  beforeEach(() => { BusyService.delay = 20; });
  afterEach(() => { BusyService.delay = 300; });

  it('stays hidden for a quick request', async () => {
    const busy = TestBed.inject(BusyService);
    busy.begin();
    await wait(5);
    busy.end();
    await wait(40);
    expect(busy.visible()).toBe(false);
  });

  it('shows after the delay and hides when the last request ends', async () => {
    const busy = TestBed.inject(BusyService);
    busy.begin();
    busy.begin();
    await wait(40);
    expect(busy.visible()).toBe(true);
    busy.end();
    expect(busy.visible()).toBe(true);
    busy.end();
    expect(busy.visible()).toBe(false);
  });

  it('never goes below zero when end is called too often', async () => {
    const busy = TestBed.inject(BusyService);
    busy.end();
    busy.begin();
    await wait(40);
    expect(busy.visible()).toBe(true);
    busy.end();
    expect(busy.visible()).toBe(false);
  });
});

describe('busyInterceptor', () => {
  beforeEach(() => {
    BusyService.delay = 20;
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([busyInterceptor])), provideHttpClientTesting()] });
  });
  afterEach(() => { BusyService.delay = 300; });

  it('counts a request until it finishes, whether it succeeds or fails', async () => {
    const busy = TestBed.inject(BusyService);
    const http = TestBed.inject(HttpClient);
    const controller = TestBed.inject(HttpTestingController);
    http.get('/a').subscribe();
    http.get('/b').subscribe({ error: () => undefined });
    await wait(40);
    expect(busy.visible()).toBe(true);
    controller.expectOne('/a').flush({});
    expect(busy.visible()).toBe(true);
    controller.expectOne('/b').flush('no', { status: 500, statusText: 'Server error' });
    expect(busy.visible()).toBe(false);
  });

  it('stops counting when a request is cancelled', async () => {
    const busy = TestBed.inject(BusyService);
    const sub = TestBed.inject(HttpClient).get('/a').subscribe();
    await wait(40);
    expect(busy.visible()).toBe(true);
    sub.unsubscribe();
    expect(busy.visible()).toBe(false);
  });
});

describe('BusyCursor', () => {
  beforeEach(() => { BusyService.delay = 20; });
  afterEach(() => { BusyService.delay = 300; });

  it('draws nothing until the server is busy, then a ring of IIM badges that follows the pointer', async () => {
    const fixture = TestBed.createComponent(BusyCursor);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.busy-cursor')).toBeNull();

    const busy = TestBed.inject(BusyService);
    busy.begin();
    await wait(40);
    fixture.detectChanges();
    const ring = el.querySelector('.busy-cursor') as HTMLElement;
    expect(ring.getAttribute('role')).toBe('status');
    expect(ring.classList.contains('at-corner')).toBe(true);
    const labels = [...el.querySelectorAll('.busy-label')].map((l) => l.textContent?.trim());
    expect(labels).toEqual(IIM_BADGES.map((b) => b.code));
    expect(IIM_BADGES.length).toBe(8);
    const spots = new Set(IIM_BADGES.map((b) => `${b.x},${b.y}`));
    expect(spots.size).toBe(8);

    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 50, pointerType: 'mouse' }));
    fixture.detectChanges();
    const moved = el.querySelector('.busy-cursor') as HTMLElement;
    expect(moved.classList.contains('at-corner')).toBe(false);
    expect(moved.style.left).toBe('122px');
    expect(moved.style.top).toBe('72px');

    busy.end();
    fixture.detectChanges();
    expect(el.querySelector('.busy-cursor')).toBeNull();
  });

  it('ignores touch, so the ring stays in the corner on a phone', async () => {
    const fixture = TestBed.createComponent(BusyCursor);
    const busy = TestBed.inject(BusyService);
    fixture.detectChanges();
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10, pointerType: 'touch' }));
    busy.begin();
    await wait(40);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.busy-cursor').classList.contains('at-corner')).toBe(true);
    busy.end();
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PhotoService } from '../core/photo.service';
import { API, all, el, sessionFor, settle, setupTestBed, text, type } from '../testing';
import { SupportBox } from './support-box';

async function open(page: string | null = null) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('student'));
  const shrink = vi.spyOn(TestBed.inject(PhotoService), 'screenshotText').mockResolvedValue('QkFTRTY0');
  const shot = vi.spyOn(TestBed.inject(PhotoService), 'pageScreenshot').mockResolvedValue(page);
  const fixture = TestBed.createComponent(SupportBox);
  const closed = vi.fn();
  fixture.componentInstance.close.subscribe(closed);
  fixture.detectChanges();
  await settle(fixture);
  return { ...env, fixture, shrink, closed, shot };
}

function choose(fixture: Parameters<typeof el>[0], name = 'shot.png') {
  const input = el<HTMLInputElement>(fixture, '#support-file');
  Object.defineProperty(input, 'files', { value: [new File(['x'], name, { type: 'image/png' })], configurable: true });
  input.dispatchEvent(new Event('change'));
}

describe('Support box', () => {
  it('sends the message and the page it was written on, then says it was sent', async () => {
    const { fixture, http } = await open();
    type(fixture, '#support-message', 'The video does not play');
    el(fixture, 'form').dispatchEvent(new Event('submit'));
    const request = http.expectOne(`${API}/api/support`);
    expect(request.request.body).toEqual({ message: 'The video does not play', page: '/' });
    request.flush({ sent: true });
    await settle(fixture);
    expect(el(fixture, '#support-sent').textContent).toContain('Sent');
    expect(all(fixture, 'form').length).toBe(0);
  });

  it('attaches a chosen screenshot, and the person can remove it', async () => {
    const { fixture, http, shrink } = await open();
    choose(fixture);
    await settle(fixture);
    expect(shrink).toHaveBeenCalled();
    expect(el(fixture, '#support-picture').textContent).toContain('shot.png');
    el(fixture, 'button[title="Remove screenshot"]').click();
    await settle(fixture);
    expect(all(fixture, '#support-picture').length).toBe(0);
    choose(fixture, 'again.png');
    await settle(fixture);
    type(fixture, '#support-message', 'See picture');
    el(fixture, 'form').dispatchEvent(new Event('submit'));
    expect(http.expectOne(`${API}/api/support`).request.body.screenshot).toBe('QkFTRTY0');
  });

  it('takes a picture pasted into the message as the screenshot, and leaves pasted text alone', async () => {
    const { fixture } = await open();
    const textPaste = Object.assign(new Event('paste', { cancelable: true }), { clipboardData: { files: [] } });
    el(fixture, '#support-message').dispatchEvent(textPaste);
    expect(textPaste.defaultPrevented).toBe(false);
    const picturePaste = Object.assign(new Event('paste', { cancelable: true }), { clipboardData: { files: [new File(['x'], 'image.png', { type: 'image/png' })] } });
    el(fixture, '#support-message').dispatchEvent(picturePaste);
    await settle(fixture);
    expect(picturePaste.defaultPrevented).toBe(true);
    expect(el(fixture, '#support-picture').textContent).toContain('image.png');
  });

  it('shows why a message was refused and keeps the form', async () => {
    const { fixture, http } = await open();
    el(fixture, 'form').dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/api/support`).flush({ detail: 'Write your message first.' }, { status: 422, statusText: 'x' });
    await settle(fixture);
    expect(text(fixture)).toContain('Write your message first.');
    expect(all(fixture, 'form').length).toBe(1);
    expect((el(fixture, '#support-send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows a screenshot that could not be prepared', async () => {
    const { fixture, shrink } = await open();
    shrink.mockRejectedValue({ status: 0, detail: "That file couldn't be read as a picture. Choose a JPG, PNG or WebP." });
    choose(fixture);
    await settle(fixture);
    expect(text(fixture)).toContain("couldn't be read as a picture");
    expect(all(fixture, '#support-picture').length).toBe(0);
  });

  it('closes from the close button and from the backdrop', async () => {
    const { fixture, closed } = await open();
    el(fixture, 'button[title="Close"]').click();
    el(fixture, '.support-backdrop').click();
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('takes a screenshot of the page when it opens, shows it, and sends it with the message', async () => {
    const { fixture, http, shot } = await open('UEFHRQ==');
    expect(shot).toHaveBeenCalledTimes(1);
    expect(el(fixture, '#support-picture').textContent).toContain('Screenshot of this page');
    expect(el<HTMLImageElement>(fixture, '#support-preview').getAttribute('src')).toBe('data:image/jpeg;base64,UEFHRQ==');
    type(fixture, '#support-message', 'Look at this');
    el(fixture, 'form').dispatchEvent(new Event('submit'));
    expect(http.expectOne(`${API}/api/support`).request.body).toEqual({ message: 'Look at this', page: '/', screenshot: 'UEFHRQ==' });
  });

  it('lets the person remove the automatic screenshot, and carries on without it when it cannot be taken', async () => {
    const { fixture, http } = await open('UEFHRQ==');
    el(fixture, 'button[title="Remove screenshot"]').click();
    await settle(fixture);
    expect(all(fixture, '#support-preview').length).toBe(0);
    type(fixture, '#support-message', 'No picture');
    el(fixture, 'form').dispatchEvent(new Event('submit'));
    expect(http.expectOne(`${API}/api/support`).request.body.screenshot).toBeUndefined();
  });

  it('keeps the form out of its own screenshot', async () => {
    const { fixture } = await open();
    expect(el(fixture, '#support-box').classList.contains('no-shot')).toBe(true);
    expect(el(fixture, '.support-backdrop').classList.contains('no-shot')).toBe(true);
  });
});

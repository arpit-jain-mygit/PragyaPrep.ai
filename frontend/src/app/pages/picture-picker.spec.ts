import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { UploadService } from '../core/upload.service';
import { API, all, el, sessionFor, settle, setupTestBed, text } from '../testing';
import { PicturePicker } from './picture-picker';

function open(picture: { id: string; url: string } | null = null) {
  const env = setupTestBed();
  env.sessions.save(sessionFor('tenant_admin'));
  const send = vi.spyOn(TestBed.inject(UploadService), 'send').mockResolvedValue();
  const fixture = TestBed.createComponent(PicturePicker);
  fixture.componentRef.setInput('label', 'Picture for option A');
  fixture.componentRef.setInput('inputId', 'pic-A');
  fixture.componentRef.setInput('picture', picture);
  const changes: unknown[] = [];
  fixture.componentInstance.changed.subscribe((c) => changes.push(c));
  fixture.detectChanges();
  return { ...env, fixture, send, changes };
}

async function choose(fixture: ReturnType<typeof open>['fixture'], name: string, size = 100) {
  const file = new File([new Uint8Array(size)], name);
  const input = el<HTMLInputElement>(fixture, '#pic-A');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
  return file;
}

describe('Picture picker', () => {
  it('uploads a PNG in three steps and reports the new picture', async () => {
    const { fixture, http, send, changes } = open();
    const file = await choose(fixture, 'circuit.png');
    const start = http.expectOne(`${API}/api/admin/question-images`);
    expect(start.request.body).toEqual({ filename: 'circuit.png', size: 100 });
    start.flush({ id: 'p1', upload: { url: 'https://s3.example/up', fields: { key: 'k' } } });
    await settle(fixture);
    expect(send).toHaveBeenCalledWith({ url: 'https://s3.example/up', fields: { key: 'k' } }, file, expect.any(Function));
    http.expectOne(`${API}/api/admin/question-images/p1/complete`).flush({ id: 'p1', url: 'https://s3.example/p1' });
    await settle(fixture);
    expect(changes).toEqual([{ id: 'p1', url: 'https://s3.example/p1' }]);
  });

  it('shows the current picture with a Remove button, and removing reports null', async () => {
    const { fixture, changes } = open({ id: 'p9', url: 'https://s3.example/p9' });
    expect(el<HTMLImageElement>(fixture, 'img').getAttribute('src')).toBe('https://s3.example/p9');
    (all(fixture, 'button').find((b) => b.textContent?.trim() === 'Remove picture') as HTMLButtonElement).click();
    expect(changes).toEqual([null]);
  });

  it('has no picture and no Remove button to begin with', () => {
    const { fixture } = open();
    expect(all(fixture, 'img').length).toBe(0);
    expect(all(fixture, 'button').length).toBe(0);
  });

  it.each([['photo.gif'], ['diagram.svg'], ['notes.pdf'], ['noending']])('refuses %s without asking the server', async (name) => {
    const { fixture, http, changes } = open();
    await choose(fixture, name);
    expect(text(fixture)).toContain('A picture must be a PNG or JPG.');
    http.verify();
    expect(changes).toEqual([]);
  });

  it('refuses a picture over 1 MB without asking the server', async () => {
    const { fixture, http } = open();
    await choose(fixture, 'big.png', 1024 * 1024 + 1);
    expect(text(fixture)).toContain('A picture can be up to 1 MB.');
    http.verify();
  });

  it('shows the server\'s message when the picture is not real', async () => {
    const { fixture, http, changes } = open();
    await choose(fixture, 'fake.png');
    http.expectOne(`${API}/api/admin/question-images`).flush({ id: 'p2', upload: { url: 'u', fields: {} } }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    http.expectOne(`${API}/api/admin/question-images/p2/complete`).flush(
      { detail: "That isn't a real PNG or JPG picture, so it was removed." },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain("That isn't a real PNG or JPG picture, so it was removed.");
    expect(changes).toEqual([]);
  });

  it('shows the upload failure and reports nothing', async () => {
    const { fixture, http, send, changes } = open();
    send.mockRejectedValue({ status: 0, detail: 'The upload failed. Please try again.' });
    await choose(fixture, 'a.jpg');
    http.expectOne(`${API}/api/admin/question-images`).flush({ id: 'p3', upload: { url: 'u', fields: {} } }, { status: 201, statusText: 'Created' });
    await settle(fixture);
    expect(text(fixture)).toContain('The upload failed. Please try again.');
    expect(changes).toEqual([]);
  });
});

import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PhotoService } from '../core/photo.service';
import { all, el, settle, setupTestBed } from '../testing';
import { PhotoPicker, VIEW } from './photo-picker';

@Component({
  imports: [PhotoPicker],
  template: `<app-photo-picker [current]="current()" first="Asha" last="Rao" email="a@example.com" (photo)="got.push($event)" />`,
})
class Host {
  readonly current = signal('');
  got: (Blob | null)[] = [];
}

function picture(width = 800, height = 600) {
  return { image: {} as HTMLImageElement, url: 'blob:picture', width, height, release: vi.fn() };
}

async function open(current = '') {
  setupTestBed();
  const service = TestBed.inject(PhotoService);
  const loaded = picture();
  vi.spyOn(service, 'load').mockResolvedValue(loaded);
  const render = vi.spyOn(service, 'render').mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.current.set(current);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, host: fixture.componentInstance, service, loaded, render };
}

function choose(fixture: ReturnType<typeof TestBed.createComponent<Host>>) {
  const input = el<HTMLInputElement>(fixture, '#photo-file');
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'me.jpg')], configurable: true });
  input.dispatchEvent(new Event('change'));
}

describe('Photo picker', () => {
  it('starts with initials and an Add photo button, and no remove button', async () => {
    const { fixture } = await open();
    expect(el(fixture, '.avatar').textContent!.trim()).toBe('AR');
    expect(el(fixture, '.photo-choose').textContent).toContain('Add photo');
    expect(all(fixture, '#photo-remove').length).toBe(0);
    expect(el<HTMLInputElement>(fixture, '#photo-file').accept).toBe('image/jpeg,image/png,image/webp');
  });

  it('shows the photo they have now, with Change photo and a remove button', async () => {
    const { fixture } = await open('https://files.example/a.jpg');
    expect(el<HTMLImageElement>(fixture, 'img.avatar').getAttribute('src')).toBe('https://files.example/a.jpg');
    expect(el(fixture, '.photo-choose').textContent).toContain('Change photo');
    expect(all(fixture, '#photo-remove').length).toBe(1);
  });

  it('opens a round window with the picture, centred, after a file is chosen', async () => {
    const { fixture } = await open();
    choose(fixture);
    await settle(fixture);
    const window = el(fixture, '.crop-view');
    expect(window.style.width).toBe(`${VIEW}px`);
    const image = el<HTMLImageElement>(fixture, '.crop-view img');
    expect(image.getAttribute('src')).toBe('blob:picture');
    // An 800 x 600 picture is scaled so its short side fills the window: 293 x 220, with the extra width split either side.
    expect(parseFloat(image.style.height)).toBeCloseTo(VIEW);
    expect(parseFloat(image.style.width)).toBeCloseTo((800 / 600) * VIEW);
    expect(parseFloat(image.style.left)).toBeCloseTo(-((800 / 600) * VIEW - VIEW) / 2);
    expect(parseFloat(image.style.top)).toBeCloseTo(0);
  });

  it('zooms in around the middle and keeps the window covered', async () => {
    const { fixture } = await open();
    choose(fixture);
    await settle(fixture);
    const slider = el<HTMLInputElement>(fixture, '#photo-zoom');
    slider.value = '2';
    slider.dispatchEvent(new Event('input'));
    await settle(fixture);
    const image = el<HTMLImageElement>(fixture, '.crop-view img');
    expect(parseFloat(image.style.height)).toBeCloseTo(VIEW * 2);
    const left = parseFloat(image.style.left);
    const top = parseFloat(image.style.top);
    expect(left).toBeLessThanOrEqual(0);
    expect(left + parseFloat(image.style.width)).toBeGreaterThanOrEqual(VIEW - 0.01);
    expect(top).toBeCloseTo(-VIEW / 2);
  });

  it('moves the picture when it is dragged, but never past its edge', async () => {
    const { fixture } = await open();
    choose(fixture);
    await settle(fixture);
    const slider = el<HTMLInputElement>(fixture, '#photo-zoom');
    slider.value = '3';
    slider.dispatchEvent(new Event('input'));
    await settle(fixture);
    const view = el(fixture, '.crop-view');
    const before = parseFloat(el<HTMLImageElement>(fixture, '.crop-view img').style.left);
    view.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
    view.dispatchEvent(new PointerEvent('pointermove', { clientX: 130, clientY: 90, pointerId: 1 }));
    await settle(fixture);
    expect(parseFloat(el<HTMLImageElement>(fixture, '.crop-view img').style.left)).toBeCloseTo(before + 30);
    view.dispatchEvent(new PointerEvent('pointermove', { clientX: 9999, clientY: 9999, pointerId: 1 }));
    await settle(fixture);
    expect(parseFloat(el<HTMLImageElement>(fixture, '.crop-view img').style.left)).toBeLessThanOrEqual(0);
    view.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    view.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0, pointerId: 1 }));
    await settle(fixture);
    expect(parseFloat(el<HTMLImageElement>(fixture, '.crop-view img').style.left)).toBeLessThanOrEqual(0); // no longer dragging
  });

  it('makes the photo from what is in the window and hands it out', async () => {
    const { fixture, host, render, loaded } = await open();
    choose(fixture);
    await settle(fixture);
    el(fixture, '#photo-use').click();
    await settle(fixture);
    expect(render).toHaveBeenCalledTimes(1);
    const crop = render.mock.calls[0][1];
    expect(crop.size).toBeCloseTo(600);
    expect(crop.sx).toBeCloseTo(100);
    expect(crop.sy).toBeCloseTo(0);
    expect(host.got.length).toBe(1);
    expect(host.got[0]).toBeInstanceOf(Blob);
    expect(all(fixture, '.crop-view').length).toBe(0);
    expect(loaded.release).toHaveBeenCalled();
    expect(el(fixture, '.photo-choose').textContent).toContain('Change photo');
    expect(all(fixture, '#photo-remove').length).toBe(1);
  });

  it('closes without a photo on Cancel', async () => {
    const { fixture, host, loaded } = await open();
    choose(fixture);
    await settle(fixture);
    el(fixture, '#photo-cancel').click();
    await settle(fixture);
    expect(host.got).toEqual([]);
    expect(all(fixture, '.crop-view').length).toBe(0);
    expect(loaded.release).toHaveBeenCalled();
  });

  it('tells the person when the file is not a picture, and stays closed', async () => {
    const { fixture, service } = await open();
    vi.spyOn(service, 'load').mockRejectedValue({ status: 0, detail: "That file couldn't be read as a picture. Choose a JPG, PNG or WebP." });
    choose(fixture);
    await settle(fixture);
    expect(el(fixture, '#photo-error').textContent).toContain("couldn't be read as a picture");
    expect(all(fixture, '.crop-view').length).toBe(0);
  });

  it('shows why a photo could not be made and leaves the window open', async () => {
    const { fixture, render } = await open();
    render.mockRejectedValue({ status: 0, detail: 'That picture could not be made small enough.' });
    choose(fixture);
    await settle(fixture);
    el(fixture, '#photo-use').click();
    await settle(fixture);
    expect(all(fixture, '.crop-view').length).toBe(1);
  });

  it('removes the photo and says so', async () => {
    const { fixture, host } = await open('https://files.example/a.jpg');
    el(fixture, '#photo-remove').click();
    await settle(fixture);
    expect(host.got).toEqual([null]);
    expect(all(fixture, 'img.avatar').length).toBe(0);
    expect(el(fixture, '.photo-choose').textContent).toContain('Add photo');
  });
});

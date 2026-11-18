import { describe, expect, it } from 'vitest';
import { avatarGradient, centerCrop, clampOffset, cropFor, initialsOf } from './avatar';

describe('Avatar helpers', () => {
  it('gives the same gradient for the same person every time, and different ones to different people', () => {
    expect(avatarGradient('asha@example.com')).toBe(avatarGradient('asha@example.com'));
    expect(avatarGradient('asha@example.com')).toContain('linear-gradient');
    const many = new Set(Array.from({ length: 40 }, (_, i) => avatarGradient(`student${i}@example.com`)));
    expect(many.size).toBeGreaterThan(3);
  });

  it.each([
    ['Asha', 'Rao', 'a@x.com', 'AR'],
    ['asha', '', 'a@x.com', 'A'],
    ['', '', 'zed@x.com', 'Z'],
    [null, undefined, 'zed@x.com', 'Z'],
    ['', '', '', '?'],
  ])('writes the initials of %s %s (%s) as %s', (first, last, email, expected) => {
    expect(initialsOf(first as string, last as string, email)).toBe(expected);
  });

  it('keeps a picture covering the window and never lets it be dragged off', () => {
    // 800 x 600 picture in a 200 window: at zoom 1 the short side fits, so the scale is 1/3.
    const fit = clampOffset(800, 600, 200, 1, 50, 50);
    expect(fit.scale).toBeCloseTo(1 / 3);
    expect(fit.oy).toBe(0); // no room to move vertically
    expect(fit.ox).toBe(0); // dragged right: pulled back so no gap shows on the left
    expect(clampOffset(800, 600, 200, 1, -9999, 0).ox).toBeCloseTo(200 - 800 / 3);
    const zoomed = clampOffset(800, 600, 200, 2, -9999, -9999);
    expect(zoomed.scale).toBeCloseTo(2 / 3);
    expect(zoomed.oy).toBeCloseTo(200 - 600 * (2 / 3));
  });

  it('works out the square to cut from the picture for what is in the window', () => {
    const middle = cropFor(800, 600, 200, 1, -(800 / 3 - 200) / 2, 0);
    expect(middle.size).toBeCloseTo(600);
    expect(middle.sx).toBeCloseTo(100);
    expect(middle.sy).toBeCloseTo(0);
    const zoomed = cropFor(800, 600, 200, 2, 0, 0);
    expect(zoomed.size).toBeCloseTo(300);
    expect(zoomed.sx).toBeCloseTo(0);
    const clamped = cropFor(800, 600, 200, 1, 500, 500);
    expect(clamped.sx).toBeCloseTo(0);
  });

  it('takes the middle square for pictures nobody is cropping by hand', () => {
    expect(centerCrop(800, 600)).toEqual({ sx: 100, sy: 0, size: 600 });
    expect(centerCrop(300, 500)).toEqual({ sx: 0, sy: 100, size: 300 });
    expect(centerCrop(400, 400)).toEqual({ sx: 0, sy: 0, size: 400 });
  });
});

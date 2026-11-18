/** Helpers for round student photos: the fallback badge, and cropping a picture to a small square JPEG. */

const COLORS = [
  ['#2563eb', '#7c3aed'], ['#ea580c', '#db2777'], ['#059669', '#0891b2'], ['#a21caf', '#e11d48'],
  ['#d97706', '#dc2626'], ['#4f46e5', '#0891b2'], ['#0d9488', '#4f46e5'], ['#be185d', '#7c3aed'],
] as const;

/** A steady gradient for each person, from their email, so a badge never changes between visits. */
export function avatarGradient(key: string): string {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const [from, to] = COLORS[hash % COLORS.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

/** The letters in a badge: first letters of the first and last name, else the start of the email. */
export function initialsOf(first: string | null | undefined, last: string | null | undefined, email: string | null | undefined): string {
  const letters = `${(first ?? '')[0] ?? ''}${(last ?? '')[0] ?? ''}`.toUpperCase();
  return letters || ((email ?? '')[0] ?? '?').toUpperCase();
}

/** The size a stored photo is made, and the most the server accepts. */
export const PHOTO_SIZE = 256;
export const MAX_PHOTO_BYTES = 300 * 1024;

export interface Crop {
  /** The square to cut from the picture, in the picture's own pixels. */
  sx: number;
  sy: number;
  size: number;
}

/** Keep a picture covering the round window: it can be dragged, but never so far that the window shows empty space. */
export function clampOffset(width: number, height: number, view: number, zoom: number, ox: number, oy: number): { ox: number; oy: number; scale: number } {
  const scale = (view / Math.min(width, height)) * zoom;
  return {
    scale,
    ox: Math.min(0, Math.max(view - width * scale, ox)),
    oy: Math.min(0, Math.max(view - height * scale, oy)),
  };
}

/** The part of the picture inside the window: where the window's top-left sits in the picture, and how big the window is there. */
export function cropFor(width: number, height: number, view: number, zoom: number, ox: number, oy: number): Crop {
  const { scale, ox: x, oy: y } = clampOffset(width, height, view, zoom, ox, oy);
  return { sx: -x / scale, sy: -y / scale, size: view / scale };
}

/** The largest square from the middle of a picture, for photos that nobody is cropping by hand. */
export function centerCrop(width: number, height: number): Crop {
  const size = Math.min(width, height);
  return { sx: (width - size) / 2, sy: (height - size) / 2, size };
}

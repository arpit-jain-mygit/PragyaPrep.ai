import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { ApiError, TenantInfo } from './models';

/**
 * A readable text colour (white or dark) for a given background colour.
 * It picks whichever has more contrast, so buttons in any institute's colour stay readable.
 */
export function readableTextColor(background: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(background.trim());
  if (!match) return '#ffffff';
  const value = parseInt(match[1], 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.4 ? '#111827' : '#ffffff';
}

function luminanceOf(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/** The contrast ratio between two colours, from 1 (none) to 21 (black on white). Same sums as the server. */
export function contrastRatio(first: string, second: string): number {
  const [light, dark] = [luminanceOf(first), luminanceOf(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/** The brand colour made darker, step by step, until it reads well on white. Same rule as the server. */
export function suggestedTextColor(brand: string): string {
  const value = parseInt(brand.slice(1), 16);
  const parts = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  for (let step = 0; step <= 100; step++) {
    const keep = 1 - step / 100;
    const hex = '#' + parts.map((part) => Math.round(part * keep).toString(16).padStart(2, '0')).join('');
    if (contrastRatio(hex, '#ffffff') >= 4.5) return hex;
  }
  return '#000000';
}

/** Which institute the page is for, its look, and whether it could be loaded. */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly api = inject(ApiService);

  readonly slug = signal<string | null>(null);
  readonly info = signal<TenantInfo | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly loading = signal(false);

  /** Load an institute by its short name. Does nothing if it is already loaded. */
  async load(slug: string): Promise<void> {
    slug = slug.trim().toLowerCase();
    if (this.slug() === slug && this.info()) return;

    this.slug.set(slug);
    this.info.set(null);
    this.error.set(null);
    this.loading.set(true);
    try {
      const info = await this.api.tenant();
      this.info.set(info);
      this.applyBranding(info);
    } catch (error) {
      this.error.set(error as ApiError);
      this.resetBranding();
    } finally {
      this.loading.set(false);
    }
  }

  /** Take new details (for example after the admin changed the name or colour) without a reload. */
  update(info: TenantInfo): void {
    this.info.set(info);
    this.applyBranding(info);
  }

  private applyBranding(info: TenantInfo): void {
    const root = document.documentElement.style;
    root.setProperty('--brand', info.branding.primary_color);
    const text = readableTextColor(info.branding.primary_color);
    root.setProperty('--brand-text', text);
    // The colour for text and links on white: the admin's choice, or a readable suggestion from the brand colour.
    root.setProperty('--brand-ink', info.branding.text_color || suggestedTextColor(info.branding.primary_color));
    document.documentElement.dataset['bar'] = text.toLowerCase() === '#ffffff' ? 'dark' : 'light';
    document.title = info.branding.display_name;
  }

  private resetBranding(): void {
    const root = document.documentElement.style;
    root.removeProperty('--brand');
    root.removeProperty('--brand-text');
    root.removeProperty('--brand-ink');
    delete document.documentElement.dataset['bar'];
    document.title = 'PragyaPrep';
  }
}

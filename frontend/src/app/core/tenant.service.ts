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
    document.documentElement.dataset['bar'] = text.toLowerCase() === '#ffffff' ? 'dark' : 'light';
    document.title = info.branding.display_name;
  }

  private resetBranding(): void {
    const root = document.documentElement.style;
    root.removeProperty('--brand');
    root.removeProperty('--brand-text');
    delete document.documentElement.dataset['bar'];
    document.title = 'PragyaPrep';
  }
}

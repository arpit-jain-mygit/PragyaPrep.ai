import { Component, OnInit, ViewEncapsulation, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { TenantService } from '../core/tenant.service';
import { learnBase } from './base';
import { PlayerService } from './player';

// The Study Hub frame: the brand, the menu of the section you are in, and the wizard's points and candies.
// Its styles are scoped to .study-hub in study-hub.css, so the rest of PragyaPrep keeps its own look.

type Section = 'hub' | 'wren-martin' | 'cambridge';

interface NavItem {
  label: string;
  link: string;
}

// Links are written after the Study Hub address, so they join it with the institute in the page address.
const NAV: Record<Exclude<Section, 'hub'>, NavItem[]> = {
  cambridge: [
    { label: '📚 Learn', link: '/cambridge/learn' },
    { label: '🎯 Quiz', link: '/cambridge/quiz' },
    { label: '✍️ Tests', link: '/cambridge/tests' },
    { label: '🛍️ Shop', link: '/cambridge/shop' },
    { label: '🏆 Board', link: '/cambridge/board' },
  ],
  'wren-martin': [
    { label: '📚 Learn', link: '/wren-martin/learn' },
    { label: '🎯 Quiz', link: '/wren-martin/quiz' },
    { label: '✍️ Tests', link: '/wren-martin/tests' },
    { label: '🛍️ Shop', link: '/wren-martin/shop' },
    { label: '🏆 Board', link: '/wren-martin/board' },
  ],
};

const BRAND: Record<Section, string> = {
  hub: '✨ Study Hub',
  'wren-martin': '📖 Wren & Martin',
  cambridge: '📐 Cambridge Maths',
};

@Component({
  selector: 'app-study-hub-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./study-hub.css'],
  template: `
    <div class="study-hub">
      <header class="top">
        <a [routerLink]="hub" class="brand">{{ brand() }}</a>
        @if (section() !== 'hub') {
          <nav [attr.aria-label]="brand() + ' menu'">
            @for (item of nav(); track item.link) {
              <a [routerLink]="hub + item.link" routerLinkActive="on">{{ item.label }}</a>
            }
          </nav>
        }
        @if (player.profile(); as p) {
          <div class="wallet" aria-label="Your points and candies">
            <span class="pill star">⭐ {{ p.points }}</span>
            <span class="pill candy">🍬 {{ p.candies }}</span>
          </div>
        }
      </header>
      <main class="page">
        <router-outlet />
      </main>
    </div>
  `,
})
export class StudyHubShell implements OnInit {
  player = inject(PlayerService);
  private router = inject(Router);
  // The address of the Study Hub, for example /aaptprep/learning/study-hub.
  readonly hub = learnBase(inject(TenantService)) + '/study-hub';
  section = signal<Section>(this.sectionFor(this.router.url));

  ngOnInit() {
    // Opening a page straight from its address still shows the wizard's points and candies.
    const saved = this.player.savedCode();
    if (saved && !this.player.profile()) {
      this.player.resume(saved).subscribe({ error: () => this.player.forget() });
    }
  }

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.section.set(this.sectionFor(e.urlAfterRedirects)));
  }

  brand() {
    return BRAND[this.section()];
  }

  nav() {
    const s = this.section();
    return s === 'hub' ? [] : NAV[s];
  }

  // Works out the section from the address. The part after the Study Hub decides it.
  private sectionFor(url: string): Section {
    const path = url.split(/[?#]/)[0];
    if (path.includes('/study-hub/wren-martin')) return 'wren-martin';
    if (path.includes('/study-hub/cambridge')) return 'cambridge';
    return 'hub';
  }
}

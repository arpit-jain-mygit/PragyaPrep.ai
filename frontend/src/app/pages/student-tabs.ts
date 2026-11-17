import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';

/** The switch at the top of a student's test pages: the tests they can take, and their results so far. */
@Component({
  selector: 'app-student-tabs',
  imports: [RouterLink, RouterLinkActive, Icon],
  template: `
    <nav class="tabs" aria-label="Tests">
      <a class="tab with-icon" [routerLink]="['/', tenants.slug(), 'tests']" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"><app-icon name="clipboard" [size]="16" /> Tests</a>
      <a class="tab with-icon" [routerLink]="['/', tenants.slug(), 'results']" routerLinkActive="active"><app-icon name="chart" [size]="16" /> My results</a>
    </nav>
  `,
})
export class StudentTabs {
  readonly tenants = inject(TenantService);
}

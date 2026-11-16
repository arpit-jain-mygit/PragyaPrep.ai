import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TenantService } from '../core/tenant.service';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <div class="card narrow">
      <h1>We couldn't find that page</h1>
      <p class="muted">The address may be mistyped, or the page may have moved.</p>
      <a class="btn" [routerLink]="['/', tenants.slug(), 'login']">Go to the login page</a>
    </div>
  `,
})
export class NotFound {
  readonly tenants = inject(TenantService);
}

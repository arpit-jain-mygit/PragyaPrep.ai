import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';

/** The page at the bare address. Until there is a domain, people reach an institute by its short name. */
@Component({
  selector: 'app-landing',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="page narrow">
      <div class="card">
        <h1>PragyaPrep</h1>
        <p class="muted">Online preparation for competitive exams. Open your institute's page to register or log in.</p>
        <form (ngSubmit)="open()" class="row">
          <label class="label" for="slug" style="width: 100%">Your institute's short name</label>
          <input id="slug" name="slug" type="text" [(ngModel)]="slug" placeholder="for example {{ example }}"
                 autocomplete="off" autocapitalize="none" style="flex: 1 1 12rem" />
          <button class="btn" type="submit" [disabled]="!slug.trim()">Open</button>
        </form>
        <p class="hint">
          Or go straight to <a [routerLink]="['/', example]">{{ example }}</a>.
          @if (sandbox) { <span>(This is the local test version.)</span> }
        </p>
      </div>
    </main>
  `,
})
export class Landing {
  slug = '';
  readonly sandbox = environment.name === 'sandbox';
  readonly example = this.sandbox ? 'demo' : 'aaptprep';

  constructor(private readonly router: Router) {}

  open(): void {
    const slug = this.slug.trim().toLowerCase();
    if (slug) this.router.navigate(['/', slug]);
  }
}

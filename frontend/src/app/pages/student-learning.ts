import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from '../core/api.service';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

/** My Learning: one page for a student's coursework, tests and results, switched by tabs. Each tab has its own address. */
@Component({
  selector: 'app-student-learning',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Icon, InfoTip],
  template: `
    <div class="page-head">
      <h1>My Learning <app-info text="Your coursework, your tests and your results, in one place." /></h1>
    </div>
    <nav class="tabs" aria-label="My Learning">
      @if (tenants.isOn('coursework')) { <a class="tab with-icon" id="tab-coursework" [routerLink]="['/', tenants.slug(), 'learning']" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"><app-icon name="layers" [size]="16" /> {{ tenants.labelOf('coursework', 'Coursework') }}</a> }
      @if (tenants.isOn('live_classes')) { <a class="tab with-icon" id="tab-live" [routerLink]="['/', tenants.slug(), 'learning', 'live']" routerLinkActive="active"><app-icon name="play" [size]="16" /> {{ tenants.labelOf('live_classes', 'Live classes') }}</a> }
      @if (tenants.isOn('tests')) { <a class="tab with-icon" id="tab-tests" [routerLink]="['/', tenants.slug(), 'learning', 'tests']" routerLinkActive="active"><app-icon name="clipboard" [size]="16" /> {{ tenants.labelOf('tests', 'Tests') }}</a> }
      @if (tenants.isOn('topic_tests')) { <a class="tab with-icon" id="tab-topics" [routerLink]="['/', tenants.slug(), 'learning', 'topics']" routerLinkActive="active"><app-icon name="layers" [size]="16" /> Topic tests</a> }
      @if (tenants.isOn('results')) { <a class="tab with-icon" id="tab-results" [routerLink]="['/', tenants.slug(), 'learning', 'results']" routerLinkActive="active"><app-icon name="chart" [size]="16" /> {{ tenants.labelOf('results', 'Results') }}</a> }
      <!-- Opens the English Vocabulary app in a new tab. It is a separate site, so it is a plain link, not a route. Shown only with the course. -->
      @if (showVocabulary()) {
        <a class="tab with-icon" id="tab-vocabulary" [routerLink]="['/', tenants.slug(), 'learning', 'vocabulary']" routerLinkActive="active"><app-icon name="book" [size]="16" /> Vocabulary</a>
      }
    </nav>
    <router-outlet />
  `,
})
export class StudentLearning implements OnInit {
  readonly tenants = inject(TenantService);
  private readonly api = inject(ApiService);
  // The Vocabulary link is shown only when the student has a course with English > Vocabulary. Hidden until the answer arrives.
  readonly showVocabulary = signal(false);

  ngOnInit() {
    this.api.myCoursework()
      .then((plan) => this.showVocabulary.set(!!plan.vocabulary))
      .catch(() => this.showVocabulary.set(false));
  }
}

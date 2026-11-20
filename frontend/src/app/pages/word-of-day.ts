import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { TenantService } from '../core/tenant.service';
import { Icon } from '../ui/icon';

/**
 * The student's word of the day, shown on the home page. It asks for the word only when the institute has the
 * screen switched on, and shows nothing if there is no word or the request fails.
 */
@Component({
  selector: 'app-word-of-day',
  imports: [Icon],
  template: `
    @if (word(); as w) {
      <section class="card word-of-day" id="word-of-day">
        <h2><app-icon name="book" [size]="18" /> Word of the day</h2>
        <p class="word-title"><strong data-word>{{ w.word }}</strong></p>
        <p data-meaning>{{ w.meaning }}</p>
        @if (w.example) { <p class="muted" data-example><em>{{ w.example }}</em></p> }
      </section>
    }
  `,
})
export class WordOfDay implements OnInit {
  private readonly api = inject(ApiService);
  private readonly tenants = inject(TenantService);

  readonly word = signal<{ word: string; meaning: string; example: string } | null>(null);

  async ngOnInit(): Promise<void> {
    if (!this.tenants.isOn('word_of_day')) return;
    try {
      this.word.set((await this.api.myWordOfDay()).word);
    } catch {
      /* the card stays hidden */
    }
  }
}

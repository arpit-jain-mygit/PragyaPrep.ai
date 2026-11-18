import { Component, computed, effect, input, signal } from '@angular/core';
import { avatarGradient, initialsOf } from '../core/avatar';

/** A round photo of a person. Without a photo (or if it cannot load) it is a coloured badge with their initials. */
@Component({
  selector: 'app-avatar',
  template: `
    @if (url() && !failed()) {
      <img class="avatar avatar-photo" [src]="url()" alt="" [style.width.px]="size()" [style.height.px]="size()" (error)="failed.set(true)" />
    } @else {
      <span class="avatar" aria-hidden="true" [style.background]="gradient()" [style.width.px]="size()" [style.height.px]="size()" [style.fontSize.px]="size() * 0.36">{{ initials() }}</span>
    }
  `,
  styles: `:host { display: inline-flex; line-height: 0; flex: none; }`,
})
export class Avatar {
  readonly url = input<string | null | undefined>('');
  readonly first = input<string | null | undefined>('');
  readonly last = input<string | null | undefined>('');
  readonly email = input<string | null | undefined>('');
  readonly size = input(40);

  readonly failed = signal(false);
  readonly initials = computed(() => initialsOf(this.first(), this.last(), this.email()));
  readonly gradient = computed(() => avatarGradient(this.email() || `${this.first()} ${this.last()}`));

  constructor() {
    // A new link gets a fresh try, in case the old one had expired.
    effect(() => {
      this.url();
      this.failed.set(false);
    });
  }
}

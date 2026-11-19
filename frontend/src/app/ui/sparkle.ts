import { Component, input } from '@angular/core';

/**
 * The Ask AI mark: three filled four-point stars, one large, in three colours. It is decorative, so the words next to it
 * say what it means (screen readers skip it).
 */
@Component({
  selector: 'app-sparkle',
  template: `<svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M13 8Q13.6 14.4 19 15Q13.6 15.6 13 22Q12.4 15.6 7 15Q12.4 14.4 13 8Z" fill="#2F5BEA" />
    <path d="M5 2.5Q5.3 4.7 7.5 5Q5.3 5.3 5 7.5Q4.7 5.3 2.5 5Q4.7 4.7 5 2.5Z" fill="#E94F9B" />
    <path d="M19.5 3Q19.7 4.8 21.5 5Q19.7 5.2 19.5 7Q19.3 5.2 17.5 5Q19.3 4.8 19.5 3Z" fill="#F5A524" />
  </svg>`,
  styles: `:host { display: inline-flex; line-height: 0; flex: none; }`,
})
export class Sparkle {
  readonly size = input(24);
}

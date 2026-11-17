import { Component, input } from '@angular/core';
import { Icon } from './icon';

/** A small ⓘ that shows a short explanation on hover, focus or tap. Keeps pages free of explanatory paragraphs. */
@Component({
  selector: 'app-info',
  imports: [Icon],
  template: `<span class="info" tabindex="0" role="note" [attr.aria-label]="text()" [attr.data-tip]="text()"><app-icon name="info" [size]="15" /></span>`,
})
export class InfoTip {
  readonly text = input.required<string>();
}

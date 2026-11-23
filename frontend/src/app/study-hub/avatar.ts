import { Component, Input } from '@angular/core';

// The wizard with whatever the player is wearing: hat on top, wand in hand, pet beside.
@Component({
  selector: 'app-avatar',
  standalone: true,
  template: `
    <div class="avatar" [style.width.px]="size" [style.height.px]="size" aria-hidden="true">
      @if (hat) { <span class="hat" [style.font-size.px]="size * 0.42">{{ hat }}</span> }
      <span class="wizard" [style.font-size.px]="size * 0.7">{{ mood }}</span>
      @if (wand) { <span class="wand" [style.font-size.px]="size * 0.36">{{ wand }}</span> }
      @if (pet) { <span class="pet" [style.font-size.px]="size * 0.36">{{ pet }}</span> }
    </div>
  `,
  styles: [`
    .avatar { position: relative; display: inline-block; line-height: 1; }
    .wizard { display: block; text-align: center; padding-top: 0.2em; }
    .hat { position: absolute; top: -0.05em; left: 50%; transform: translateX(-50%); }
    .wand { position: absolute; right: -0.05em; top: 45%; }
    .pet { position: absolute; left: -0.05em; bottom: -0.05em; }
  `],
})
export class AvatarComponent {
  @Input() equipped: Record<string, string> = {};
  @Input() catalog: Record<string, string> = {};
  @Input() size = 96;
  @Input() mood = '🧙';

  get hat() { return this.catalog[this.equipped['hat'] ?? ''] ?? ''; }
  get wand() { return this.catalog[this.equipped['wand'] ?? ''] ?? ''; }
  get pet() { return this.catalog[this.equipped['pet'] ?? ''] ?? ''; }
}

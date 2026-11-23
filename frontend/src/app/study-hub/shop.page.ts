import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { StudyHubApi } from './api';
import { PlayerService } from './player';
import { ShopItem } from './models';
import { AvatarComponent } from './avatar';

const SLOT_LABELS: Record<string, string> = { hat: '🎩 Hats', wand: '🪄 Wands', pet: '🐾 Pets' };

@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [AvatarComponent],
  template: `
    <h1>🛍️ Candy shop</h1>
    <p class="sub">Spend your candies to dress up your wizard. You earn one candy for every right answer.</p>

    @if (profile(); as p) {
      <section class="card preview">
        <app-avatar [equipped]="p.equipped" [catalog]="emojiById()" [size]="140"></app-avatar>
        <div class="wallet">
          <span class="pill candy">🍬 <b>{{ p.candies }}</b> candies</span>
        </div>
      </section>

      @if (message()) {
        <p class="msg" role="status">{{ message() }}</p>
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      @for (slot of slots; track slot) {
        <h2 class="slot">{{ slotLabel(slot) }}</h2>
        <div class="grid">
          @for (item of itemsFor(slot); track item.id) {
            <article class="item" [class.wearing]="p.equipped[slot] === item.id">
              <div class="emoji" aria-hidden="true">{{ item.emoji }}</div>
              <strong>{{ item.name }}</strong>
              @if (!p.owned.includes(item.id)) {
                <button class="btn" [disabled]="busy() || p.candies < item.price" (click)="buy(item)">
                  🍬 {{ item.price }}
                </button>
                @if (p.candies < item.price) {
                  <span class="small">Need {{ item.price - p.candies }} more</span>
                }
              } @else if (p.equipped[slot] === item.id) {
                <span class="badge">Wearing ✨</span>
              } @else {
                <button class="btn ghost" [disabled]="busy()" (click)="wear(item)">Wear it</button>
              }
            </article>
          }
        </div>
      }
    } @else {
      <p class="sub">Start your spellbook on the home page first.</p>
    }
  `,
  styles: [`
    h1 { font-family: var(--display); font-size: 30px; margin: 8px 0 4px; }
    .sub, .small { color: var(--muted); }
    .sub { margin: 0 0 16px; }
    .preview { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px; }
    .wallet b { font-variant-numeric: tabular-nums; }
    .msg { color: var(--correct); font-weight: 600; }
    .error { color: var(--retry); }
    .slot { font-family: var(--display); font-size: 22px; margin: 22px 0 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .item { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 10px; border-radius: 16px; background: var(--surface); border: 2px solid var(--line); text-align: center; }
    .item.wearing { border-color: var(--correct); }
    .emoji { font-size: 44px; line-height: 1.1; }
    .btn { min-height: 44px; font-size: 15px; padding: 8px 14px; }
    .badge { background: var(--correct-bg); color: var(--correct); border-radius: 999px; padding: 6px 12px; font-weight: 700; font-size: 14px; }
    .item > span.small { font-size: 13px; }
  `],
})
export class ShopPage implements OnInit {
  private api = inject(StudyHubApi);
  private player = inject(PlayerService);
  items = signal<ShopItem[]>([]);
  message = signal('');
  error = signal('');
  busy = signal(false);
  profile = this.player.profile;
  slots = ['hat', 'wand', 'pet'];
  emojiById = computed(() => Object.fromEntries(this.items().map((i) => [i.id, i.emoji])));

  ngOnInit() {
    this.api.shop().subscribe({ next: (r) => this.items.set(r.items) });
    const code = this.player.profile()?.code ?? this.player.savedCode();
    if (code && !this.player.profile()) this.player.refresh().subscribe();
  }

  slotLabel(slot: string) {
    return SLOT_LABELS[slot] ?? slot;
  }

  itemsFor(slot: string) {
    return this.items().filter((i) => i.slot === slot);
  }

  buy(item: ShopItem) {
    this.act(this.api.buyItem(this.profile()!.code, item.id), `${item.name} is yours! Want to wear it?`);
  }

  wear(item: ShopItem) {
    this.act(this.api.equipItem(this.profile()!.code, item.id), `${item.name} is on!`);
  }

  private act(obs: ReturnType<StudyHubApi['buyItem']>, ok: string) {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    obs.subscribe({
      next: (p) => {
        this.player.update(p);
        this.message.set(ok);
        this.busy.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.detail ?? 'Something went wrong. Please try again.');
        this.busy.set(false);
      },
    });
  }
}

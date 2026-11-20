import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ApiError, WordEntry } from '../core/models';
import { Icon } from '../ui/icon';

/**
 * The institute admin's word list for Word of the day. Students see one word a day, going down this list in the
 * order it was added. The admin adds words with a meaning and an example, and can remove a word.
 */
@Component({
  selector: 'app-admin-words',
  imports: [Icon],
  template: `
    <div class="page-head"><h1><app-icon name="book" /> Word of the day</h1></div>
    <p class="hint">Add words or idioms with their meaning and an example. Students see one word a day, going down this list in the order it was added, then starting again. Idioms have their own list for Idioms. Switch each one on or off on <strong>Features and labels</strong>.</p>

    <div class="tabs" role="tablist" aria-label="Which list">
      <button class="tab" type="button" id="kind-word" role="tab" [attr.aria-selected]="kind() === 'word'" (click)="switchKind('word')">Words</button>
      <button class="tab" type="button" id="kind-idiom" role="tab" [attr.aria-selected]="kind() === 'idiom'" (click)="switchKind('idiom')">Idioms</button>
    </div>

    @if (loadError(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
    @if (error(); as problem) { <div class="alert error" role="alert" id="word-error">{{ problem.detail }}</div> }

    <section class="card">
      <h2>Add a word</h2>
      <label class="field">{{ kind() === 'idiom' ? 'Idiom' : 'Word' }} <input id="word-input" type="text" maxlength="60" [value]="word()" (input)="word.set(read($event))" /></label>
      <label class="field">Meaning <textarea id="meaning-input" maxlength="300" [value]="meaning()" (input)="meaning.set(read($event))"></textarea></label>
      <label class="field">Example (optional) <textarea id="example-input" maxlength="300" [value]="example()" (input)="example.set(read($event))"></textarea></label>
      <button class="btn" id="add-word" type="button" [disabled]="busy()" (click)="add()">Add {{ kind() === 'idiom' ? 'idiom' : 'word' }}</button>
    </section>

    <section class="card">
      <h2>Word list ({{ words().length }})</h2>
      @if (loaded() && !words().length) { <p class="muted" id="no-words">No words yet. Add the first one above.</p> }
      <ol class="plain-list" id="word-list">
        @for (entry of words(); track entry.id) {
          <li class="word-row" [attr.data-word-id]="entry.id">
            <div>
              <strong>{{ entry.word }}</strong> {{ entry.meaning }}
              @if (entry.example) { <div class="muted small"><em>{{ entry.example }}</em></div> }
            </div>
            <button class="btn secondary small" type="button" (click)="remove(entry)">Remove</button>
          </li>
        }
      </ol>
    </section>
  `,
})
export class AdminWordsPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly words = signal<WordEntry[]>([]);
  readonly loaded = signal(false);
  readonly loadError = signal<ApiError | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly busy = signal(false);

  /** Which list the admin is looking at: the words, or the idioms. */
  readonly kind = signal<'word' | 'idiom'>('word');
  readonly word = signal('');
  readonly meaning = signal('');
  readonly example = signal('');

  readonly count = computed(() => this.words().length);

  async ngOnInit(): Promise<void> {
    try {
      this.words.set(await this.api.words(this.kind()));
    } catch (error) {
      this.loadError.set(error as ApiError);
    } finally {
      this.loaded.set(true);
    }
  }

  read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  /** Show the other list. The one on screen is loaded from the server again. */
  async switchKind(kind: 'word' | 'idiom'): Promise<void> {
    if (kind === this.kind()) return;
    this.kind.set(kind);
    this.error.set(null);
    try {
      this.words.set(await this.api.words(kind));
    } catch (error) {
      this.loadError.set(error as ApiError);
    }
  }

  async add(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const added = await this.api.addWord({ kind: this.kind(), word: this.word(), meaning: this.meaning(), example: this.example() });
      this.words.set([...this.words(), added]);
      this.word.set('');
      this.meaning.set('');
      this.example.set('');
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(entry: WordEntry): Promise<void> {
    if (!window.confirm(`Remove "${entry.word}" from the word list?`)) return;
    this.error.set(null);
    try {
      await this.api.removeWord(entry.id);
      this.words.set(this.words().filter((row) => row.id !== entry.id));
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }
}

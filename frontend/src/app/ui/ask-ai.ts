import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isNative, openInApp } from '../core/native';
import { ApiService } from '../core/api.service';
import { ApiError, StudyAnswer, StudyHit } from '../core/models';
import { Icon } from './icon';
import { Sparkle } from './sparkle';

/**
 * "Ask AI": a question box that finds the parts of the student's coursework that answer it. For now it returns matching
 * passages (keyword search); AI-written answers come later. `prefill` fills the box, for example with a weak topic's name.
 */
@Component({
  selector: 'app-ask-ai',
  imports: [FormsModule, Icon, Sparkle],
  template: `
    <section class="card study-search" id="study-search" aria-labelledby="ask-ai-title">
      <h2 id="ask-ai-title"><app-sparkle [size]="26" /> Ask AI</h2>
      <p class="soft">Finds the parts of your coursework that answer your question.</p>
      <form (ngSubmit)="search()" novalidate class="study-search-form">
        <label class="sr-only" for="study-q">Your question</label>
        <input id="study-q" name="q" type="search" placeholder="Ask a question about your coursework" [(ngModel)]="query" maxlength="200" autocomplete="off" />
        <button class="btn" type="submit" id="study-go" [disabled]="searching()"><app-icon name="search" [size]="16" /> {{ searching() ? 'Searching…' : 'Ask' }}</button>
      </form>
      @if (searchError(); as problem) { <p class="error-text" role="alert" id="study-error">{{ problem.detail }}</p> }
      @if (showAnswer && answer(); as reply) {
        @if (reply.answered && reply.answer) {
          <div class="study-answer" id="study-answer">
            <p class="study-answer-label"><app-sparkle [size]="16" /> Answer from your coursework</p>
            <p class="study-answer-text">{{ reply.answer }}</p>
            @if (reply.citations.length) {
              <div class="study-foot">
                @for (cite of reply.citations; track $index) {
                  <button class="btn small secondary" type="button" [disabled]="openingHit() === $index" (click)="openCitation(cite, $index)">
                    <app-icon name="file" [size]="14" /> {{ cite.file }}, page {{ cite.page }}
                  </button>
                }
              </div>
            }
          </div>
        } @else if (reply.hits.length) {
          <p class="soft" id="study-not-covered">The notes don't clearly answer this question. These are the closest passages.</p>
        }
      }
      @if (results(); as found) {
        @if (found.length) {
          <p class="soft" id="study-count">{{ found.length }} {{ found.length === 1 ? 'match' : 'matches' }} in your coursework, best first.</p>
          <ol class="study-hits" id="study-hits">
            @for (hit of found; track $index) {
              <li class="study-hit">
                <p class="soft study-crumb">{{ hit.course }} › {{ hit.subject }} › {{ hit.topic }} › {{ hit.subtopic }}</p>
                <p class="study-snippet">@for (part of parts(hit); track $index) {@if (part.match) {<strong class="hl">{{ part.text }}</strong>} @else {<span>{{ part.text }}</span>}}</p>
                <div class="study-foot">
                  <span class="soft">{{ hit.file }}, page {{ hit.page }}</span>
                  <button class="btn small secondary" type="button" [disabled]="openingHit() === $index" (click)="openHit(hit, $index)">
                    <app-icon name="file" [size]="14" /> Open at page {{ hit.page }}
                  </button>
                </div>
              </li>
            }
          </ol>
        } @else {
          <div class="empty-state" id="study-none"><app-icon name="search" [size]="28" /><p><strong>No match in your coursework.</strong></p><p class="soft">Try a word from your course notes, or ask your teacher.</p></div>
        }
      }
    </section>
  `,
})
export class AskAi {
  private readonly api = inject(ApiService);

  /** Text to put in the box, such as a weak topic's name. Changing it replaces what is typed. */
  readonly prefill = input('');

  /** Off until the answer is written by a real AI model. The fake model's text was worse than the passages, so students see
   *  only the passages for now. The server still checks the answer; this only hides it on screen. */
  readonly showAnswer: boolean = false;

  query = '';
  readonly searching = signal(false);
  readonly searchError = signal<ApiError | null>(null);
  readonly results = signal<StudyHit[] | null>(null);
  readonly answer = signal<StudyAnswer | null>(null);
  readonly openingHit = signal<number | null>(null);

  ngOnChanges(): void {
    if (this.prefill()) {
      this.query = this.prefill();
      this.results.set(null);
      this.searchError.set(null);
    }
  }

  /** Search the coursework the student can open. Common words are ignored by the server. */
  async search(): Promise<void> {
    const text = this.query.trim();
    this.searchError.set(null);
    if (text.length < 2) {
      this.results.set(null);
      this.searchError.set({ status: 422, detail: 'Type a word or two from your question.' });
      return;
    }
    this.searching.set(true);
    try {
      const reply = await this.api.studyAsk(text);
      this.answer.set(reply);
      this.results.set(reply.hits);
    } catch (error) {
      this.answer.set(null);
      this.results.set(null);
      this.searchError.set(error as ApiError);
    } finally {
      this.searching.set(false);
    }
  }

  /** Open a cited passage's PDF at its page. */
  async openCitation(cite: { course_id: string; file_id: string; page: number }, index: number): Promise<void> {
    if (this.openingHit() !== null) return;
    this.openingHit.set(index);
    this.searchError.set(null);
    const tab = isNative() ? null : window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const link = await this.api.fileLink(cite.course_id, cite.file_id);
      const url = `${link.url}#page=${cite.page}`;
      if (isNative()) await openInApp(url);
      else if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (error) {
      tab?.close();
      this.searchError.set(error as ApiError);
    } finally {
      this.openingHit.set(null);
    }
  }

  /** The snippet cut into words and spaces, with the question's words marked, so they can be shown in bold. Text is never
   *  read as HTML, so passage text from an upload cannot inject markup. */
  parts(hit: StudyHit): { text: string; match: boolean }[] {
    const found = new Set(hit.matched);
    // Each part is a word with its trailing space, so no part is only whitespace (Angular drops those).
    const words = hit.snippet.split(' ');
    return words.map((word, i) => ({
      text: i < words.length - 1 ? word + ' ' : word,
      match: found.has(word.toLowerCase().replace(/[^a-z0-9]/g, '')),
    }));
  }

  /** Open the PDF at the page of the passage. A new tab is opened right away, as for other files. */
  async openHit(hit: StudyHit, index: number): Promise<void> {
    if (this.openingHit() !== null) return;
    this.openingHit.set(index);
    this.searchError.set(null);
    const tab = isNative() ? null : window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const link = await this.api.fileLink(hit.course_id, hit.file_id);
      const url = `${link.url}#page=${hit.page}`;
      if (isNative()) await openInApp(url);
      else if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (error) {
      tab?.close();
      this.searchError.set(error as ApiError);
    } finally {
      this.openingHit.set(null);
    }
  }
}

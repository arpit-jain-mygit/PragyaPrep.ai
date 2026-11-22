import { Component, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

/** The English Vocabulary app (Word Wizard), shown inside My Learning. It is served from its own address, so it opens in a frame. */
@Component({
  selector: 'app-student-vocabulary',
  imports: [],
  template: `
    <iframe
      class="vocab-frame"
      id="vocabulary-frame"
      title="English Vocabulary"
      [src]="url"
      allow="clipboard-write"
    ></iframe>
  `,
  styles: [`
    .vocab-frame { display: block; width: 100%; height: calc(100vh - 260px); min-height: 600px; border: 0; border-radius: 12px; background: transparent; }
  `],
})
export class StudentVocabulary {
  private readonly sanitizer = inject(DomSanitizer);
  // Where the English Vocabulary app is served. Dev address for now; move to a config value before a real institute uses it.
  readonly url: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl('https://d20eivggluollb.cloudfront.net');
}

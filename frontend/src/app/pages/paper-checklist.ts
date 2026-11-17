import { Component, computed, input, model } from '@angular/core';
import { Paper } from '../core/models';

/** A tick list of papers (subjects), grouped by section, with Select all and Clear. */
@Component({
  selector: 'app-paper-checklist',
  template: `
    <div class="paper-checklist">
      <div class="row">
        <strong>Papers for this course</strong>
        <span class="muted" [attr.id]="idPrefix() + '-count'">{{ selected().length }} of {{ papers().length }} selected</span>
        <button class="btn secondary small" type="button" (click)="all()">Select all</button>
        <button class="btn secondary small" type="button" (click)="none()">Clear</button>
      </div>
      <div class="paper-box">
        @for (group of groups(); track group.section) {
          <fieldset class="paper-group">
            <legend>{{ group.section }}</legend>
            @for (paper of group.papers; track paper.id) {
              <label class="check">
                <input type="checkbox" [id]="idPrefix() + '-' + paper.id" [checked]="selected().includes(paper.id)" (change)="toggle(paper.id, $any($event.target).checked)" />
                {{ paper.name }}
              </label>
            }
          </fieldset>
        }
      </div>
    </div>
  `,
})
export class PaperChecklist {
  readonly papers = input.required<Paper[]>();
  readonly idPrefix = input('papers');
  /** The ids ticked. Two-way: the parent sees every change. */
  readonly selected = model<string[]>([]);

  readonly groups = computed(() => {
    const sections = new Map<string, Paper[]>();
    for (const paper of this.papers()) sections.set(paper.section, [...(sections.get(paper.section) ?? []), paper]);
    return [...sections].map(([section, papers]) => ({ section, papers }));
  });

  toggle(id: string, on: boolean): void {
    this.selected.update((ids) => (on ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((item) => item !== id)));
  }

  all(): void {
    this.selected.set(this.papers().map((paper) => paper.id));
  }

  none(): void {
    this.selected.set([]);
  }
}

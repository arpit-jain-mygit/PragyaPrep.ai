import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { shortDate } from '../core/format';
import { ApiError, CourseFile, CourseworkPlan, LiveClass, LiveClassInput, LiveImport, WorkMaterial } from '../core/models';
import { UploadService } from '../core/upload.service';
import { Icon } from '../ui/icon';
import { InfoTip } from '../ui/info-tip';

interface Draft {
  paper_id: string;
  topic_id: string;
  subtopic_id: string;
  title: string;
  held_on: string;
  held_time: string;
  description: string;
  status: 'draft' | 'published';
  materials: WorkMaterial[];
}

const empty = (): Draft => ({ paper_id: '', topic_id: '', subtopic_id: '', title: '', held_on: '', held_time: '', description: '', status: 'draft', materials: [] });

/**
 * The live classes of a course: add the recordings (MP4) and slides (PDF), then describe each class one by one, or fill in the
 * Excel template with the file names and upload it to add many classes at once.
 */
@Component({
  selector: 'app-admin-live-classes',
  imports: [FormsModule, Icon, InfoTip],
  template: `
    @if (error(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
    @if (notice(); as n) { <div class="alert ok" role="status" id="notice">{{ n }}</div> }

    <section class="card" id="files-step">
      <div class="row q-head">
        <strong>Recordings and slides</strong>
        <app-info text="Upload the MP4 recordings and PDF slides of your live classes here (several at once is fine). Then add each class and pick its files, or put the file names in the Excel template." />
        <label class="btn secondary small" style="margin-left: auto">
          <input type="file" id="live-files" class="sr-only" multiple accept=".mp4,.pdf,video/mp4,application/pdf" [disabled]="busy()" (change)="filesChosen($event)" />
          <app-icon name="upload" [size]="16" /> Add files
        </label>
      </div>
      @if (progress(); as p) {
        <p class="soft" id="upload-status" role="status">
          @if (p.working) { Uploading… {{ p.done + p.failed.length }} of {{ p.total }}@if (p.current) { ({{ p.current }}) } }
          @else { {{ p.done }} {{ p.done === 1 ? 'file' : 'files' }} added@if (p.failed.length) { , {{ p.failed.length }} could not be added }. }
        </p>
        @if (!p.working && p.failed.length) {
          <ul class="plain-list" id="upload-failures">@for (f of p.failed; track f.name) { <li class="soft"><strong>{{ f.name }}:</strong> {{ f.reason }}</li> }</ul>
        }
      }
      <p class="soft" id="file-count">{{ videoCount() }} {{ videoCount() === 1 ? 'recording' : 'recordings' }} and {{ pdfCount() }} {{ pdfCount() === 1 ? 'PDF' : 'PDFs' }} uploaded</p>
    </section>

    <div class="row" style="margin: 0.8rem 0">
      <button class="btn small" type="button" id="add-class" [disabled]="busy() || !!form()" (click)="startAdd()"><app-icon name="plus" [size]="16" /> Add live class</button>
      <button class="btn secondary small" type="button" id="live-template" [disabled]="busy()" (click)="downloadTemplate()"><app-icon name="download" [size]="16" /> Template</button>
      <label class="btn secondary small">
        <input type="file" id="live-sheet" class="sr-only" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" [disabled]="busy()" (change)="sheetChosen($event)" />
        <app-icon name="upload" [size]="16" /> Upload sheet
      </label>
    </div>

    @if (preview(); as p) {
      <section class="card" id="import-panel">
        <div class="stat-grid" id="import-summary">
          <div class="stat"><div class="num" id="i-total">{{ p.summary.total }}</div><div class="label">Rows</div></div>
          <div class="stat"><div class="num ok-num" id="i-ready">{{ p.confirmed ? p.summary.created ?? 0 : p.summary.ready }}</div><div class="label">{{ p.confirmed ? 'Created' : 'Ready' }}</div></div>
          <div class="stat"><div class="num" id="i-skipped">{{ p.summary.skipped }}</div><div class="label">Already there</div></div>
          <div class="stat"><div class="num bad-num" id="i-errors">{{ p.summary.errors }}</div><div class="label">Problems</div></div>
        </div>
        @if (!p.confirmed) {
          <div class="row">
            <button class="btn" type="button" id="import-confirm" [disabled]="busy() || p.summary.ready === 0" (click)="confirmImport()"><app-icon name="check" [size]="16" /> Add {{ p.summary.ready }} {{ p.summary.ready === 1 ? 'class' : 'classes' }}</button>
            <button class="btn secondary" type="button" id="import-cancel" (click)="preview.set(null)">Cancel</button>
            @if (p.summary.errors) { <span class="soft">Rows with problems are not added. Fix them in the file and upload it again.</span> }
          </div>
        } @else {
          <button class="btn secondary" type="button" id="import-done" (click)="preview.set(null)">Done</button>
        }
        <div class="table-wrap">
          <table class="compact" id="import-rows">
            <thead><tr><th>Row</th><th>Class</th><th>Result</th></tr></thead>
            <tbody>
              @for (r of p.rows; track r.row) {
                <tr [attr.data-row]="r.row">
                  <td class="soft">{{ r.row }}</td>
                  <td><strong>{{ r.title || '-' }}</strong><div class="soft">{{ r.held_on }} · {{ r.files }} {{ r.files === 1 ? 'file' : 'files' }}</div></td>
                  <td>
                    <span class="status" [class.ok]="r.status === 'ready' || r.status === 'created'" [class.bad]="r.status === 'error'">{{ label(r.status) }}</span>
                    @for (e of problems(r); track e[0]) { <div class="soft" [attr.data-problem]="e[0]"><strong>{{ e[0] }}:</strong> {{ e[1] }}</div> }
                    @if (r.message) { <div class="soft">{{ r.message }}</div> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }

    @if (form(); as f) {
      <section class="card" id="class-form">
        <form (ngSubmit)="save()" novalidate>
          <div class="field"><label for="lc-title">Title</label><input id="lc-title" name="title" type="text" maxlength="120" [(ngModel)]="f.title" /></div>
          <div class="grid-2">
            <div class="field">
              <label for="lc-subject">Subject</label>
              <select id="lc-subject" name="subject" [(ngModel)]="f.paper_id" (ngModelChange)="f.topic_id = ''; f.subtopic_id = ''">
                <option value="">Choose the subject…</option>
                @for (s of subjects(); track s.paper_id) { <option [value]="s.paper_id">{{ s.name }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="lc-topic">Topic <span class="soft">(optional)</span></label>
              <select id="lc-topic" name="topic" [(ngModel)]="f.topic_id" (ngModelChange)="f.subtopic_id = ''" [disabled]="!f.paper_id">
                <option value="">Whole subject</option>
                @for (t of topicsOf(f); track t.id) { <option [value]="t.id">{{ t.title }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="lc-subtopic">Sub-topic <span class="soft">(optional)</span></label>
              <select id="lc-subtopic" name="subtopic" [(ngModel)]="f.subtopic_id" [disabled]="!f.topic_id">
                <option value="">Whole topic</option>
                @for (x of subtopicsOf(f); track x.id) { <option [value]="x.id">{{ x.title }}</option> }
              </select>
            </div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="lc-date">Date</label><input id="lc-date" name="date" type="date" [(ngModel)]="f.held_on" /></div>
            <div class="field"><label for="lc-time">Time <span class="soft">(optional)</span></label><input id="lc-time" name="time" type="time" [(ngModel)]="f.held_time" /></div>
          </div>
          <div class="field"><label for="lc-desc">Description <span class="soft">(optional)</span></label><textarea id="lc-desc" name="desc" rows="3" maxlength="2000" [(ngModel)]="f.description"></textarea></div>
          <div class="field">
            <label>Recordings and slides</label>
            <ul class="cw-material" id="lc-material">
              @for (m of f.materials; track $index) {
                <li><app-icon [name]="m.type === 'link' ? 'link' : m.kind === 'pdf' ? 'file' : 'play'" [size]="16" /><span>{{ materialTitle(m) }}</span>
                  <button class="icon-btn" type="button" title="Remove" (click)="f.materials.splice($index, 1)"><app-icon name="x" /><span class="sr-only">Remove</span></button></li>
              } @empty { <li class="soft">Nothing attached yet</li> }
            </ul>
            <select name="pick" aria-label="Add an uploaded file" [ngModel]="''" (ngModelChange)="attachFile(f, $event)">
              <option value="">Add an uploaded file…</option>
              @for (file of freeFiles(f); track file.id) { <option [value]="file.id">{{ file.title }} ({{ file.kind === 'pdf' ? 'PDF' : 'Video' }})</option> }
            </select>
            <div class="cw-attach">
              <input name="link" type="text" aria-label="Link" placeholder="https://…" [(ngModel)]="link" />
              <button class="icon-btn" type="button" title="Add link" [disabled]="!link.trim()" (click)="attachLink(f)"><app-icon name="link" /><span class="sr-only">Add link</span></button>
            </div>
          </div>
          <div class="field">
            <label>Status</label>
            <div class="cw-status">
              <label><input type="radio" name="status" value="draft" [(ngModel)]="f.status" /> Draft</label>
              <label><input type="radio" name="status" value="published" [(ngModel)]="f.status" /> Published</label>
            </div>
          </div>
          <div class="row">
            <button class="btn" type="submit" id="save-class" [disabled]="busy()"><app-icon name="check" /> Save</button>
            <button class="btn secondary" type="button" id="cancel-class" (click)="form.set(null)">Cancel</button>
          </div>
        </form>
      </section>
    }

    <div class="table-wrap">
      <table class="compact" id="classes">
        <thead><tr><th>When</th><th>Class</th><th>Belongs to</th><th>Files</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          @for (c of classes(); track c.id) {
            <tr [attr.data-class]="c.title">
              <td class="soft">{{ date(c.held_on) }}@if (c.held_time) { <div>{{ c.held_time }}</div> }</td>
              <td><strong>{{ c.title }}</strong>@if (c.description) { <div class="soft">{{ c.description }}</div> }</td>
              <td class="soft" data-place>{{ c.place || 'Not placed in the plan yet' }}</td>
              <td class="soft">{{ c.materials.length }}</td>
              <td><span class="status" [class.ok]="c.status === 'published'">{{ c.status === 'published' ? 'Published' : 'Draft' }}</span></td>
              <td class="actions-cell">
                @if (confirming() === c.id) {
                  <button class="btn danger small" type="button" [disabled]="busy()" (click)="remove(c)">Yes, delete</button>
                  <button class="icon-btn" type="button" title="Keep" (click)="confirming.set(null)"><app-icon name="x" /><span class="sr-only">Keep</span></button>
                } @else {
                  <button class="icon-btn" type="button" title="Edit" [disabled]="busy()" (click)="startEdit(c)"><app-icon name="edit" /><span class="sr-only">Edit</span></button>
                  <button class="icon-btn danger" type="button" title="Delete" [disabled]="busy()" (click)="confirming.set(c.id)"><app-icon name="trash" /><span class="sr-only">Delete</span></button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6"><div class="empty-state"><app-icon name="play" [size]="32" /><p>No live classes yet</p></div></td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class AdminLiveClasses implements OnInit {
  private readonly api = inject(ApiService);
  private readonly uploader = inject(UploadService);

  readonly courseId = input.required<string>();

  readonly classes = signal<LiveClass[]>([]);
  readonly plan = signal<CourseworkPlan | null>(null);
  readonly subjects = computed(() => this.plan()?.subjects ?? []);
  readonly files = signal<CourseFile[]>([]);
  readonly form = signal<Draft | null>(null);
  readonly editing = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly notice = signal<string | null>(null);
  readonly confirming = signal<string | null>(null);
  readonly preview = signal<LiveImport | null>(null);
  readonly progress = signal<{ total: number; done: number; working: boolean; current: string; failed: { name: string; reason: string }[] } | null>(null);
  link = '';
  private sheet: File | null = null;

  date = shortDate;
  readonly videoCount = computed(() => this.files().filter((f) => f.status === 'ready' && f.kind === 'mp4').length);
  readonly pdfCount = computed(() => this.files().filter((f) => f.status === 'ready' && f.kind === 'pdf').length);

  async ngOnInit(): Promise<void> {
    try {
      const [classes, files, plan] = await Promise.all([this.api.liveClasses(this.courseId()), this.api.courseFiles(this.courseId()), this.api.coursework(this.courseId())]);
      this.classes.set(classes);
      this.plan.set(plan);
      this.files.set(files);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  label(status: string): string {
    return { ready: 'Ready', skipped: 'Already there', error: 'Problem', created: 'Created' }[status] ?? status;
  }

  problems(row: { problems: Record<string, string> }): [string, string][] {
    return Object.entries(row.problems ?? {});
  }

  topicsOf(draft: Draft) {
    return this.subjects().find((s) => s.paper_id === draft.paper_id)?.topics ?? [];
  }

  subtopicsOf(draft: Draft) {
    return this.topicsOf(draft).find((t) => t.id === draft.topic_id)?.subtopics ?? [];
  }

  materialTitle(item: WorkMaterial): string {
    return item.type === 'link' ? item.title || item.url : `${item.title} (${item.kind === 'pdf' ? 'PDF' : 'Video'})`;
  }

  freeFiles(draft: Draft): CourseFile[] {
    const used = new Set(draft.materials.filter((m) => m.type === 'file').map((m) => (m as { file_id: string }).file_id));
    return this.files().filter((f) => f.status === 'ready' && !used.has(f.id));
  }

  // ---- Files: several at once ----

  async filesChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    if (!picked.length || this.busy()) return;
    this.error.set(null);
    this.busy.set(true);
    const progress = { total: picked.length, done: 0, working: true, current: '', failed: [] as { name: string; reason: string }[] };
    this.progress.set({ ...progress });
    for (const file of picked) {
      progress.current = file.name;
      this.progress.set({ ...progress });
      try {
        const title = file.name.replace(/\.[^.]+$/, '');
        const started = await this.api.startUpload(this.courseId(), { filename: file.name, size: file.size, title });
        await this.uploader.send(started.upload, file, () => undefined);
        await this.api.finishUpload(this.courseId(), started.file.id);
        progress.done += 1;
      } catch (error) {
        progress.failed.push({ name: file.name, reason: (error as ApiError).detail ?? "Couldn't be added." });
      }
    }
    this.progress.set({ ...progress, current: '', working: false });
    try {
      this.files.set(await this.api.courseFiles(this.courseId()));
    } catch (error) {
      this.error.set(error as ApiError);
    }
    this.busy.set(false);
  }

  // ---- One class ----

  startAdd(): void {
    this.form.set(empty());
    this.editing.set(null);
    this.link = '';
    this.error.set(null);
  }

  startEdit(item: LiveClass): void {
    this.form.set({ paper_id: item.paper_id ?? '', topic_id: item.topic_id ?? '', subtopic_id: item.subtopic_id ?? '', title: item.title, held_on: item.held_on, held_time: item.held_time, description: item.description, status: item.status, materials: item.materials.map((m) => ({ ...m })) });
    this.editing.set(item.id);
    this.link = '';
    this.error.set(null);
  }

  attachFile(draft: Draft, id: string): void {
    const file = this.files().find((f) => f.id === id);
    if (file) draft.materials.push({ type: 'file', file_id: file.id, title: file.title, kind: file.kind, size: file.size });
  }

  attachLink(draft: Draft): void {
    const url = this.link.trim();
    if (!url) return;
    draft.materials.push({ type: 'link', url, title: '' });
    this.link = '';
  }

  async save(): Promise<void> {
    const f = this.form();
    if (!f || this.busy()) return;
    const body: LiveClassInput = {
      paper_id: f.paper_id, topic_id: f.topic_id, subtopic_id: f.subtopic_id, title: f.title, held_on: f.held_on, held_time: f.held_time, description: f.description, status: f.status,
      materials: f.materials.map((m) => (m.type === 'file' ? { type: 'file' as const, file_id: m.file_id } : { type: 'link' as const, url: m.url, title: m.title })),
    };
    await this.run(async () => {
      this.classes.set(this.editing() ? await this.api.editLiveClass(this.courseId(), this.editing()!, body) : await this.api.addLiveClass(this.courseId(), body));
      this.form.set(null);
      this.notice.set(this.editing() ? 'Saved.' : 'Live class added.');
    });
  }

  async remove(item: LiveClass): Promise<void> {
    this.confirming.set(null);
    await this.run(async () => {
      this.classes.set(await this.api.removeLiveClass(this.courseId(), item.id));
      this.notice.set(`Deleted ${item.title}.`);
    });
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await work();
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  // ---- Many classes: the Excel template ----

  async downloadTemplate(): Promise<void> {
    this.error.set(null);
    try {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await this.api.liveTemplate(this.courseId()));
      link.download = 'live-classes-template.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  async sheetChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy()) return;
    this.sheet = file;
    this.preview.set(null);
    await this.run(async () => this.preview.set(await this.api.importLiveClasses(this.courseId(), file, false)));
  }

  async confirmImport(): Promise<void> {
    if (!this.sheet) return;
    const file = this.sheet;
    await this.run(async () => {
      this.preview.set(await this.api.importLiveClasses(this.courseId(), file, true));
      this.classes.set(await this.api.liveClasses(this.courseId()));
    });
  }
}

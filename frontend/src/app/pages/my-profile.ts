import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ApiError, MyProfile } from '../core/models';
import { ProfileService } from '../core/profile.service';
import { UploadService } from '../core/upload.service';
import { Icon } from '../ui/icon';
import { PhotoPicker } from '../ui/photo-picker';

const RELATIONS = ['Mother', 'Father', 'Guardian', 'Other'];

/**
 * A student's or parent's own profile. The institute owns the name and email; the person keeps their photo, contact
 * details and (for a student) their exam goals and which emails they want. They can also download or ask to delete their data.
 */
@Component({
  selector: 'app-my-profile',
  imports: [FormsModule, Icon, PhotoPicker],
  template: `
    <div class="page-head"><h1><app-icon name="users" /> My profile</h1></div>
    @if (loadError(); as problem) { <div class="alert error" role="alert">{{ problem.detail }}</div> }
    @if (me(); as p) {
      <section class="card profile-head">
        <app-photo-picker [current]="p.avatar_url" [first]="p.first_name" [last]="p.last_name" [email]="p.email" [disabled]="busy()" (photo)="photoChosen($event)" />
        <div>
          <h2 id="who">{{ p.first_name }} {{ p.last_name }}</h2>
          <p class="muted" id="mail">{{ p.email }}</p>
          <p class="hint">Your name and email are set by your institute. To change them, ask your institute.</p>
        </div>
      </section>
      @if (photoError(); as problem) { <div class="alert error" role="alert" id="photo-problem">{{ problem.detail }}</div> }

      <form class="card" (ngSubmit)="save()" novalidate>
        <h2>{{ p.role === 'student' ? 'About you' : 'Your details' }}</h2>
        @if (error(); as problem) { <div class="alert error" role="alert" id="save-error">{{ problem.detail }}</div> }
        @if (saved()) { <div class="alert ok" role="status" id="saved"><app-icon name="check" [size]="16" /> Saved.</div> }
        <div class="grid-2">
          <div class="field"><label for="mobile">Mobile</label><input id="mobile" name="mobile" type="tel" placeholder="10-digit number" [(ngModel)]="mobile" autocomplete="tel" /></div>
          @if (p.role === 'student') {
            <div class="field"><label for="birth">Date of birth</label><input id="birth" name="birth" type="date" [(ngModel)]="birth" /></div>
            <div class="field"><label for="exams">Exams you are aiming for</label><input id="exams" name="exams" type="text" placeholder="CLAT, CUET" [(ngModel)]="exams" /><p class="hint">Up to 5, separated by commas.</p></div>
            <div class="field"><label for="examDate">Exam date</label><input id="examDate" name="examDate" type="date" [(ngModel)]="examDate" /></div>
            <div class="field"><label for="goal">Study goal, hours a week</label><input id="goal" name="goal" type="number" min="0" max="80" [(ngModel)]="goal" /></div>
          } @else {
            <div class="field">
              <label for="relation">Your relation to the child</label>
              <select id="relation" name="relation" [(ngModel)]="relation"><option value="">Choose…</option>@for (r of relations; track r) { <option [value]="r">{{ r }}</option> }</select>
            </div>
            <div class="field">
              <label for="summary">Progress summary by email</label>
              <select id="summary" name="summary" [(ngModel)]="summary"><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="off">Never</option></select>
            </div>
          }
        </div>
        @if (p.role === 'student') {
          <fieldset class="field">
            <legend class="label"><app-icon name="bell" [size]="16" /> Emails you want</legend>
            <label class="check"><input type="checkbox" name="n1" [(ngModel)]="notifyAnnouncements" /> Announcements</label>
            <label class="check"><input type="checkbox" name="n2" [(ngModel)]="notifyTests" /> New tests</label>
            <label class="check"><input type="checkbox" name="n3" [(ngModel)]="notifyLive" /> Live classes</label>
          </fieldset>
        } @else {
          <label class="check"><input type="checkbox" id="consent" name="consent" [(ngModel)]="consent" /> I agree that the institute may contact me about my child's progress.</label>
        }
        <button class="btn" type="submit" id="save" [disabled]="busy()"><app-icon name="check" [size]="16" /> {{ busy() ? 'Saving…' : 'Save' }}</button>
      </form>

      <section class="card" id="linked">
        <h2>{{ p.role === 'student' ? 'Your parents' : 'Your children' }}</h2>
        @for (person of p.linked; track person.email) { <p class="row"><app-icon name="users" [size]="16" /> {{ person.name }} <span class="soft">{{ person.email }}</span></p> }
        @if (!p.linked.length) { <p class="muted">{{ p.role === 'student' ? 'No parent is linked yet. Your institute can add one.' : 'No child is linked yet. Please ask your institute.' }}</p> }
      </section>

      <section class="card">
        <h2>Your data</h2>
        <div class="row">
          <button class="btn secondary" type="button" id="download" [disabled]="busy()" (click)="download()"><app-icon name="download" [size]="16" /> Download my data</button>
          @if (p.deletion_requested) {
            <span class="chip pending" id="deletion-asked">Deletion requested</span>
            <button class="btn secondary" type="button" id="cancel-delete" [disabled]="busy()" (click)="cancelDelete()">Cancel request</button>
          } @else if (!confirming()) {
            <button class="btn danger" type="button" id="delete" (click)="confirming.set(true)"><app-icon name="trash" [size]="16" /> Delete my account</button>
          }
        </div>
        @if (confirming() && !p.deletion_requested) {
          <div class="alert error" id="delete-confirm">
            This tells your institute you want your account and data removed. Nothing is deleted until they do it.
            <div class="row" style="margin-top: 0.5rem">
              <button class="btn danger small" type="button" id="delete-yes" [disabled]="busy()" (click)="askDelete()">Yes, ask for deletion</button>
              <button class="btn secondary small" type="button" id="delete-no" (click)="confirming.set(false)">Keep my account</button>
            </div>
          </div>
        }
      </section>
    } @else if (!loadError()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class MyProfilePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly uploader = inject(UploadService);
  private readonly shared = inject(ProfileService);

  readonly relations = RELATIONS;
  readonly me = signal<MyProfile | null>(null);
  readonly loadError = signal<ApiError | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly photoError = signal<ApiError | null>(null);
  readonly busy = signal(false);
  readonly saved = signal(false);
  readonly confirming = signal(false);

  mobile = '';
  birth = '';
  exams = '';
  examDate = '';
  goal = 0;
  notifyAnnouncements = true;
  notifyTests = true;
  notifyLive = true;
  relation = '';
  summary = 'weekly';
  consent = false;

  async ngOnInit(): Promise<void> {
    try {
      this.show(await this.api.myProfile());
    } catch (error) {
      this.loadError.set(error as ApiError);
    }
  }

  /** What the form held when it was last filled from the server, to tell whether anything was changed since. */
  private baseline = '';

  private snapshot(): string {
    return JSON.stringify([this.mobile.trim(), this.birth, this.exams.trim(), this.examDate, Number(this.goal) || 0, this.notifyAnnouncements, this.notifyTests, this.notifyLive, this.relation, this.summary, this.consent]);
  }

  /** True when something was typed or ticked and not saved yet. */
  hasUnsaved(): boolean {
    return this.me() !== null && this.snapshot() !== this.baseline;
  }

  /** Fill the form from what the server has. */
  private show(profile: MyProfile): void {
    this.me.set(profile);
    this.shared.avatarUrl.set(profile.avatar_url ?? '');
    this.mobile = profile.mobile ?? '';
    this.birth = profile.birth_date ?? '';
    this.exams = (profile.target_exams ?? []).join(', ');
    this.examDate = profile.exam_date ?? '';
    this.goal = profile.weekly_goal_hours ?? 0;
    this.notifyAnnouncements = profile.notify?.announcements ?? true;
    this.notifyTests = profile.notify?.tests ?? true;
    this.notifyLive = profile.notify?.live_classes ?? true;
    this.relation = profile.relation ?? '';
    this.summary = profile.summary ?? 'weekly';
    this.consent = profile.consent ?? false;
    this.baseline = this.snapshot();
  }

  async save(): Promise<void> {
    const profile = this.me();
    if (!profile || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    const fields: Partial<MyProfile> = profile.role === 'student'
      ? {
          mobile: this.mobile.trim(), birth_date: this.birth, exam_date: this.examDate, weekly_goal_hours: Number(this.goal) || 0,
          target_exams: this.exams.split(',').map((x) => x.trim()).filter(Boolean),
          notify: { announcements: this.notifyAnnouncements, tests: this.notifyTests, live_classes: this.notifyLive },
        }
      : { mobile: this.mobile.trim(), relation: this.relation, summary: this.summary, consent: this.consent };
    try {
      this.show(await this.api.saveMyProfile(fields));
      this.saved.set(true);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async photoChosen(photo: Blob | null): Promise<void> {
    this.busy.set(true);
    this.photoError.set(null);
    try {
      if (photo) {
        const start = await this.api.startMyPhoto();
        await this.uploader.send(start.upload, new File([photo], 'photo.jpg', { type: 'image/jpeg' }), () => undefined);
        this.show(await this.api.finishMyPhoto(start.key));
      } else {
        this.show(await this.api.removeMyPhoto());
      }
    } catch (error) {
      this.photoError.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async download(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const data = await this.api.myData();
      const link = document.createElement('a');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      link.href = url;
      link.download = 'my-pragyaprep-data.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  async askDelete(): Promise<void> {
    await this.deletion(() => this.api.askDeletion());
  }

  async cancelDelete(): Promise<void> {
    await this.deletion(() => this.api.cancelDeletion());
  }

  private async deletion(run: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await run();
      this.confirming.set(false);
      this.show(await this.api.myProfile());
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { todayIso } from '../core/format';
import { ApiError, Course, RegistrationForm } from '../core/models';
import { TenantService } from '../core/tenant.service';

/** The registration form. Mistakes are shown next to the field they belong to, all at once. */
@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  template: `
    @if (done()) {
      <div class="card narrow" style="margin-inline: auto">
        <h1>Thank you, {{ form.first_name }}!</h1>
        <div class="alert ok" role="status">{{ doneMessage() }}</div>
        <h2>What happens next</h2>
        <ol>
          <li>{{ tenants.info()?.branding?.display_name }} reviews your registration.</li>
          <li>You get an email as soon as it is approved.</li>
          <li>Then you log in with this email address, using a 6-digit code we send you.</li>
        </ol>
        <p class="muted small">You can check where things stand at any time by trying to log in.</p>
        <a class="btn" [routerLink]="['/', tenants.slug(), 'login']" [queryParams]="{ email: form.email }">Go to log in</a>
      </div>
    } @else {
      <div class="card narrow" style="margin-inline: auto">
        <h1>Register</h1>
        <p class="muted">Fill in your details. Fields marked <span class="req">*</span> are required.</p>

        @if (loadError(); as problem) {
          <div class="alert error" role="alert">{{ problem.detail }}</div>
        }
        @if (courses() !== null && courses()!.length === 0) {
          <div class="alert warn" role="status">No courses are open for registration yet. Please check back soon.</div>
        }
        @if (banner(); as problem) {
          <div class="alert error" role="alert" id="banner">
            {{ problem.detail }}
            @if (problem.status === 409) {
              <p style="margin-top: 0.5rem">
                <a [routerLink]="['/', tenants.slug(), 'login']" [queryParams]="{ email: form.email }">Go to log in</a>
              </p>
            }
          </div>
        }

        @if (courses() !== null && courses()!.length > 0) {
          <form (ngSubmit)="submit()" novalidate autocomplete="on">
            <div class="field">
              <label for="email">Email <span class="req">*</span></label>
              <input id="email" name="email" type="email" [(ngModel)]="form.email" (input)="clear('email')" autocomplete="email"
                     [attr.aria-invalid]="errors()['email'] ? 'true' : null" aria-describedby="email-error" />
              @if (errors()['email']) { <div class="error-text" id="email-error">{{ errors()['email'] }}</div> }
              <div class="hint">You will use this email to log in.</div>
            </div>

            <div class="grid-2">
              <div class="field">
                <label for="first_name">First name <span class="req">*</span></label>
                <input id="first_name" name="first_name" type="text" [(ngModel)]="form.first_name" (input)="clear('first_name')" autocomplete="given-name"
                       [attr.aria-invalid]="errors()['first_name'] ? 'true' : null" />
                @if (errors()['first_name']) { <div class="error-text">{{ errors()['first_name'] }}</div> }
              </div>
              <div class="field">
                <label for="last_name">Last name <span class="req">*</span></label>
                <input id="last_name" name="last_name" type="text" [(ngModel)]="form.last_name" (input)="clear('last_name')" autocomplete="family-name"
                       [attr.aria-invalid]="errors()['last_name'] ? 'true' : null" />
                @if (errors()['last_name']) { <div class="error-text">{{ errors()['last_name'] }}</div> }
              </div>
            </div>

            <div class="grid-2">
              <div class="field">
                <label for="birth_date">Birth date <span class="req">*</span></label>
                <input id="birth_date" name="birth_date" type="date" [(ngModel)]="form.birth_date" (input)="clear('birth_date')" [max]="today" autocomplete="bday"
                       [attr.aria-invalid]="errors()['birth_date'] ? 'true' : null" />
                @if (errors()['birth_date']) { <div class="error-text">{{ errors()['birth_date'] }}</div> }
              </div>
              <div class="field">
                <label for="gender">Gender <span class="req">*</span></label>
                <select id="gender" name="gender" [(ngModel)]="form.gender" (change)="clear('gender')" [attr.aria-invalid]="errors()['gender'] ? 'true' : null">
                  <option value="">Choose…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
                @if (errors()['gender']) { <div class="error-text">{{ errors()['gender'] }}</div> }
              </div>
            </div>

            <div class="field">
              <label for="mobile">Mobile number <span class="req">*</span></label>
              <input id="mobile" name="mobile" type="tel" [(ngModel)]="form.mobile" (input)="clear('mobile')" autocomplete="tel" inputmode="tel"
                     [attr.aria-invalid]="errors()['mobile'] ? 'true' : null" />
              @if (errors()['mobile']) { <div class="error-text">{{ errors()['mobile'] }}</div> }
            </div>

            <div class="check">
              <input id="same" name="same" type="checkbox" [(ngModel)]="form.whatsapp_same_as_mobile" />
              <label for="same" style="margin: 0; font-weight: 400">My WhatsApp number is the same as my mobile number</label>
            </div>
            @if (!form.whatsapp_same_as_mobile) {
              <div class="field">
                <label for="whatsapp">WhatsApp number <span class="req">*</span></label>
                <input id="whatsapp" name="whatsapp" type="tel" [(ngModel)]="form.whatsapp" (input)="clear('whatsapp')" inputmode="tel"
                       [attr.aria-invalid]="errors()['whatsapp'] ? 'true' : null" />
                @if (errors()['whatsapp']) { <div class="error-text">{{ errors()['whatsapp'] }}</div> }
              </div>
            }

            <div class="field">
              <label for="address">Complete address <span class="req">*</span></label>
              <textarea id="address" name="address" [(ngModel)]="form.address" (input)="clear('address')" autocomplete="street-address"
                        [attr.aria-invalid]="errors()['address'] ? 'true' : null"></textarea>
              @if (errors()['address']) { <div class="error-text">{{ errors()['address'] }}</div> }
            </div>

            <div class="grid-2">
              <div class="field">
                <label for="city">City <span class="req">*</span></label>
                <input id="city" name="city" type="text" [(ngModel)]="form.city" (input)="clear('city')" autocomplete="address-level2"
                       [attr.aria-invalid]="errors()['city'] ? 'true' : null" />
                @if (errors()['city']) { <div class="error-text">{{ errors()['city'] }}</div> }
              </div>
              <div class="field">
                <label for="pin_code">PIN code <span class="req">*</span></label>
                <input id="pin_code" name="pin_code" type="text" [(ngModel)]="form.pin_code" (input)="clear('pin_code')" inputmode="numeric" maxlength="6"
                       autocomplete="postal-code" [attr.aria-invalid]="errors()['pin_code'] ? 'true' : null" />
                @if (errors()['pin_code']) { <div class="error-text">{{ errors()['pin_code'] }}</div> }
              </div>
            </div>

            <div class="field">
              <label for="course_id">Course <span class="req">*</span></label>
              <select id="course_id" name="course_id" [(ngModel)]="form.course_id" (change)="clear('course_id')"
                      [attr.aria-invalid]="errors()['course_id'] ? 'true' : null">
                <option value="">Choose a course…</option>
                @for (course of courses(); track course.id) {
                  <option [value]="course.id">{{ course.name }}</option>
                }
              </select>
              @if (errors()['course_id']) { <div class="error-text">{{ errors()['course_id'] }}</div> }
            </div>

            <button class="btn" type="submit" [disabled]="busy()">{{ busy() ? 'Registering…' : 'Register' }}</button>
          </form>
        }
      </div>
    }
  `,
})
export class Register implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly tenants = inject(TenantService);

  readonly today = todayIso();

  form: RegistrationForm = {
    email: '', first_name: '', last_name: '', birth_date: '', gender: '', mobile: '',
    whatsapp_same_as_mobile: true, whatsapp: '', address: '', city: '', pin_code: '', course_id: '',
  };

  readonly courses = signal<Course[] | null>(null);
  readonly loadError = signal<ApiError | null>(null);
  readonly errors = signal<Record<string, string>>({});
  readonly banner = signal<ApiError | null>(null);
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly doneMessage = signal('');

  async ngOnInit(): Promise<void> {
    const email = this.route.snapshot.queryParamMap.get('email');
    if (email) this.form.email = email;
    try {
      this.courses.set(await this.api.courses());
    } catch (error) {
      this.loadError.set(error as ApiError);
      this.courses.set([]);
    }
  }

  /** Once a person edits a field, its mistake message is out of date. When none are left, the summary goes too. */
  clear(field: string): void {
    if (!this.errors()[field]) return;
    const { [field]: _removed, ...rest } = this.errors();
    this.errors.set(rest);
    if (Object.keys(rest).length === 0 && this.banner()?.status === 422) this.banner.set(null);
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.banner.set(null);
    this.errors.set({});
    try {
      const result = await this.api.register(this.form);
      this.doneMessage.set(result.message);
      this.done.set(true);
    } catch (error) {
      const problem = error as ApiError;
      if (problem.status === 422 && problem.errors) {
        this.errors.set(problem.errors);
        this.banner.set({ status: 422, detail: problem.detail });
        // Move the cursor to the first field with a mistake, once the page has updated.
        setTimeout(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus());
      } else {
        this.banner.set(problem);
      }
    } finally {
      this.busy.set(false);
    }
  }
}

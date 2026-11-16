# PragyaPrep: Features (Phase 1)

> **Phase note (17 Nov 2026): payments and their review are in Phase 2.** In Phase 1 the tenant admin gives a student access to a course by hand. The payment sections below describe Phase 2.
>
> **Status: draft for review.** This version has three proposed changes: multi-tenancy, login by email one-time code (OTP) after admin approval, and registration with manual payment review. Items marked **(proposed)** need your approval before any code changes. The first tenant is **aaptprep**.

## Platform and tenants (proposed)
- PragyaPrep serves many coaching institutes ("tenants") from one deployment. Each tenant has its own students, admins, courses and files.
- The first tenant is **aaptprep**.
- A **platform admin** (the PragyaPrep owner) creates, edits and suspends tenants.
- Each tenant has a name, a short slug (for example `aaptprep`), a status (active or suspended) and branding (display name, logo, colours).
- A script creates a tenant together with its one tenant admin.
- **How the app knows the tenant:** for now, the frontend sends the tenant's slug with every request. Once a domain exists, the app reads it from the web address instead: a subdomain of ours (`aaptprep.pragyaprep.ai`) or the institute's own domain (`aaptprep.com`).
- A suspended tenant's users can't log in, and its files can't be downloaded.

## Roles
| Role | Who | Scope |
|---|---|---|
| Platform admin (proposed) | PragyaPrep owner | All tenants. Manages tenants only, not their content |
| Tenant admin | A coaching institute's staff. One per tenant for now | One tenant |
| Student | A learner | One tenant |

Parent and Mentor roles come later, also per tenant.

## How a student joins: the full journey (proposed)
1. **Register.** The student fills the registration form (below) and submits it with **Register**. The registration is **pending**.
2. **Admin reviews the registration.** The tenant admin approves or rejects it. The student gets an email either way. Approval puts the email on the tenant's approved list ("whitelist"). It does **not** give course access yet.
3. **Log in.** The student logs in with their email and a 6-digit emailed code (see below).
4. **Pay offline.** The student sees the fee for their requested course and the tenant's payment QR code. They pay with their own UPI app, then upload a screenshot of the payment.
5. **Admin reviews the payment.** The tenant admin checks the screenshot. If it is correct, they verify it, and the student gets access to the requested course. If not, they reject it with a reason, and the student uploads a new screenshot.
6. **Learn.** The student opens the course and plays its videos and PDFs.

## Registration form (proposed)
All fields are required.
| Field | Notes |
|---|---|
| Email | Becomes the student's login identity. Unique within a tenant |
| First name | |
| Last name | |
| Birth date | |
| Gender | Male, Female, Other, Prefer not to say |
| Mobile number | 10-digit Indian number |
| WhatsApp number | A "same as mobile" checkbox fills it in |
| Complete address | |
| City | |
| PIN code | 6 digits |
| Course | A dropdown filled from the tenant's own course list. aaptprep starts with IPMAT, CAT and CLAT |

The submit button is **Register**.

## Login by email OTP (proposed)
This is the only way to log in. There are no passwords, no login IDs and no Google sign-in.

1. The student enters their enrolled email on the tenant's login page.
2. If the email is approved, a 6-digit code is emailed to it.
3. The student enters the code and is signed in.

**What the student is told when they try to log in**
| Email's state | Message |
|---|---|
| Not registered | "This email isn't registered with <tenant>. Register first." |
| Pending | "Your registration is waiting for approval. We'll email you once it's approved." |
| Rejected | "Your registration wasn't approved. Contact <tenant>." |
| Suspended or revoked | "Your access is paused. Contact <tenant>." |
| Approved | "We've emailed you a 6-digit code." |

The login page shows these messages straight away. When an email isn't registered it offers a **Register** button, and when the registration is pending it shows what happens next. Checks on how often an email can be tried are limited, to stop probing.

**Code rules (to confirm)**
- The code is valid for 10 minutes, works once, and allows a limited number of attempts.
- Codes can only be requested a few times per hour for each email.
- Tenant admins and the platform admin also sign in with an emailed code.
- A signed-in session lasts a set time before a new code is needed (to confirm).

## Payment and course access (proposed)
- Each course has a **fee**, set by the tenant admin.
- Each course also has an **access length**, set by the tenant admin: no expiry, a number of days from the day the payment is verified, or until a fixed date. When a student's access ends, the course is hidden and they can pay again to renew.
- The tenant admin uploads the tenant's **payment QR code** image.
- The student pays outside the app, then uploads a **payment screenshot** (a JPG or PNG image) for their requested course. A screenshot is enough for now: the student doesn't enter a transaction reference or amount.
- Payment states: **awaiting payment**, **submitted**, **verified** (course access granted), **rejected** (with a reason; the student can upload again).
- Only the tenant admin can see payment screenshots. They are stored privately.
- The student and the admin get emails when a payment is submitted, verified or rejected.
- The admin can also grant a course without payment, for example a free trial.

## Tenant admin
- Review registrations: approve, reject, suspend or revoke.
- Review payments: verify or reject a screenshot, with a reason.
- Manage the course list (it fills the registration dropdown), set each course's fee and access length, and upload the payment QR code.
- Create courses.
- Grant and revoke a student's access to a course, by email.
- Upload and delete PDF and MP4 files in a course.
- See and edit the tenant's own branding: display name, logo and primary colour.

## Correcting a student's details
- The tenant admin can edit any detail of a registration, at any status: name, birth date, gender, mobile, WhatsApp, address, city, PIN code, course and email.
- Changing the email moves the student's record to the new email. The old email stops working, any session on it ends, and the new address gets an email. An email already used at the institute is refused.
- Each edit records who made it and when. The status doesn't change.
- Students editing their own contact details after login comes later, with their own screens.

## Platform admin
- Created only by a script, never from the screens.
- Has its own page at `/platform-admin`, after logging in at `/platform/login`.
- **View** every institute with its status, admin and created date.
- **Create** an institute together with its one admin. The admin is approved straight away and gets an email.
- **Edit** an institute's name, colour and status (active or suspended), and its admin's name or email. Replacing the admin emails the new one and switches the old one off. The short name can't be changed.
- **Logo:** add, replace or remove an institute's logo (PNG or JPG, up to 1 MB). It shows next to the institute's name at the top of every page.
- **No delete** anywhere in the screens or the API. To pause an institute, suspend it.

## Student
- Register, then log in with an emailed code once approved.
- Pay and upload a payment screenshot for the requested course.
- See only the courses they have been granted, in their own tenant.
- Open a course, play its MP4 videos (with seeking) and open its PDFs.

## Content protection
- Only PDF and MP4 are accepted for course content. File contents must match the extension.
- Files are served through links that expire after 5 minutes and work for one file and one user only.
- Students get "not found" for courses they cannot access.
- Files are stored under the tenant's own folder in storage (proposed).
- Payment screenshots accept images only, up to a size limit, and are checked by their contents (proposed).

## Privacy (proposed)
- Registration collects personal data, including birth date, mobile number and address. Only what the form needs is collected.
- Students under 18 can register. No guardian details are collected for now.
- Payment screenshots are private and are kept for a limited time (to confirm).

## Tenant isolation (proposed)
- No user, registration, payment, course, file, grant or download link from one tenant is ever visible or usable in another tenant.
- Every data lookup is scoped to the tenant. A missing tenant is an error, never a default.
- The same email can be registered in two tenants. They are two separate accounts.
- Tests prove that one tenant can't read, list, grant or download another tenant's data.

## Removed from the earlier plan (proposed)
- Login with ID + password, and the change-password and password-reset features.
- Google sign-in.

## Later (not in Phase 1)
- Other video formats (M4V, MOV, WEBM).
- Mock tests and exams.
- Automatic online payments (for example a UPI gateway).
- AI features (doubt solver, test analysis).
- Parent and Mentor roles.
- Migration from the existing aaptprep platform.
- Subdomains and custom domains per tenant.
- Per-tenant quotas (storage, upload size) and usage reports.
- Tenant self-service sign-up and billing.

## Decisions made
1. Each tenant manages its own course list.
2. Students under 18 can register, with no guardian fields for now.
3. Access length is configurable per course.
4. A payment screenshot is enough for now. No transaction reference or amount is entered.
5. The login page shows clear status messages straight away, for the best experience, with limits on how often an email can be tried. If probing becomes a problem, we can switch to showing the status only after the email is proven.
6. Tenants share tables, with tenant-prefixed keys. A tenant with special needs can be moved to its own stack later.
7. One admin per tenant for now. More admins can be added later.

## Proposed defaults (change any you disagree with)
- Fees: one fee per course, with no discounts or instalments.
- Payment screenshots: images only (JPG, PNG), up to 5 MB.
- Session length: 7 days before a new code is needed.
- A rejected student can register again with the same email.
- A student can request another course later, with a new payment.
- Emails come from one verified address (for example a Gmail address) until a domain exists.
- A suspended tenant's students lose access immediately.
- Tenant branding: display name, logo and primary colour.

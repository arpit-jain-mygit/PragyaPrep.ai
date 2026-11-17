# PragyaPrep: Features (Phase 1)

> **Status (synced with the code on 17 Nov 2026).** Everything here is **built and tested live** unless it is marked **Phase 2**. Payments and their review are in Phase 2: in Phase 1 the tenant admin gives a student access to a course by hand. The first tenant is **aaptprep**.

## Platform and tenants
- PragyaPrep serves many coaching institutes ("tenants") from one deployment. Each tenant has its own students, admins, courses and files.
- The first tenant is **aaptprep**.
- A **platform admin** (the PragyaPrep owner) creates, edits and suspends tenants.
- Each tenant has a name, a short slug (for example `aaptprep`), a status (active or suspended) and branding (display name, logo, colours).
- A tenant is created together with its one tenant admin, either by the platform admin from their page or by a script.
- **How the app knows the tenant:** for now, the frontend sends the tenant's slug with every request. Once a domain exists, the app reads it from the web address instead: a subdomain of ours (`aaptprep.pragyaprep.ai`) or the institute's own domain (`aaptprep.com`).
- A suspended tenant's users can't log in, and its files can't be downloaded.

## Roles
| Role | Who | Scope |
|---|---|---|
| Platform admin | PragyaPrep owner | All tenants. Manages tenants only, not their content |
| Tenant admin | A coaching institute's staff. One per tenant for now | One tenant |
| Student | A learner | One tenant |

Parent and Mentor roles come later, also per tenant.

## How a student joins: the full journey
1. **Register.** The student fills the registration form (below) and submits it with **Register**. The registration is **pending**.
2. **Admin reviews the registration.** The tenant admin approves or rejects it. The student gets an email either way. Approval puts the email on the tenant's approved list ("whitelist"). It does **not** give course access yet.
3. **Log in.** The student logs in with their email and a 6-digit emailed code (see below).
4. **Access.** In Phase 1 the tenant admin gives the student the course by hand, from the student's details. The student then sees it under **My courses**. *(Phase 2: the student pays offline with their own UPI app and uploads a screenshot, and the admin verifies it, which grants the access.)*
5. **Learn.** The student opens the course and plays its videos and opens its PDFs.

## Registration form
All fields are required. The birth date must give an age from 10 to 80.
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

## Login by email OTP
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

**Code rules**
- The code has 6 digits, is valid for 10 minutes, works once, and allows 5 wrong tries.
- A new code can be asked for after 30 seconds, and an email can ask for 5 codes an hour. One connection is limited too (20 code requests, 60 code tries and 10 registrations an hour).
- Tenant admins and the platform admin also sign in with an emailed code.
- A signed-in session lasts 7 days before a new code is needed. It ends at once if the person is suspended.

## Payment and course access (payment is Phase 2)
- Each course has a **fee**, set by the tenant admin.
- Each course also has an **access length**, set by the tenant admin: no expiry, a number of days from the day the payment is verified, or until a fixed date. When a student's access ends, the course is hidden and they can pay again to renew.
- The tenant admin uploads the tenant's **payment QR code** image.
- The student pays outside the app, then uploads a **payment screenshot** (a JPG or PNG image) for their requested course. A screenshot is enough for now: the student doesn't enter a transaction reference or amount.
- Payment states: **awaiting payment**, **submitted**, **verified** (course access granted), **rejected** (with a reason; the student can upload again).
- Only the tenant admin can see payment screenshots. They are stored privately.
- The student and the admin get emails when a payment is submitted, verified or rejected.
- The admin can also grant a course without payment, for example a free trial. **This is built and is how access works in Phase 1.**

## Tenant admin
- Review registrations: approve, reject, suspend or reactivate, and correct a student's details (see below).
- Manage the course list (it fills the registration dropdown): add, rename, change the fee and access length, hide or show.
- Give a student a course, renew it, or take it away, from the student's details.
- Add and delete PDF and MP4 files in a course, from the course's **Files** page.
- Keep a **question bank** (see below).
- *(Phase 2)* Review payments: verify or reject a screenshot, with a reason, and upload the payment QR code.
- *(Phase 2)* Edit the institute's own branding. Today only the platform admin changes the name, colour and logo.

## Correcting a student's details
- The tenant admin can edit any detail of a registration, at any status: name, birth date, gender, mobile, WhatsApp, address, city, PIN code, course and email.
- Changing the email moves the student's record to the new email. The old email stops working, any session on it ends, and the new address gets an email. An email already used at the institute is refused.
- Each edit records who made it and when. The status doesn't change.
- Students editing their own contact details after login comes later, with their own screens.

## Question bank
- Each institute has its own private bank of multiple-choice questions. Only its admin sees it. Students can't see questions yet, and mock tests that use them come later.
- The admin chooses a **paper** and a **topic** from a fixed list shared by all institutes: 37 CUET-style papers (13 languages, 23 domain papers such as Physics or Accountancy, and General Aptitude), each with its own topics.
- A question has the question text, **four options**, the **correct option**, and a **reason for every option** saying why it is right or wrong. It also has a difficulty (easy, medium, hard) and a status (draft or published).
- The admin chooses a paper and topic once and keeps adding questions for that combination: **Save and add another** keeps the paper, topic, difficulty and status, clears the rest and counts the questions added. **Save and close** ends the run.
- The admin can list questions, filter by paper, topic and status, edit and delete them.
- Not yet: importing questions from a file, images or formulas, several correct answers, per-institute papers or topics.

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
- See only the courses they have been granted, in their own tenant, under **My courses**.
- Open a course, play its MP4 videos (with seeking) and open its PDFs.
- *(Phase 2)* Pay and upload a payment screenshot for the requested course.
- *(Phase 2)* Edit their own contact details after logging in. Until then the admin does it.

## Content protection
- Only PDF and MP4 are accepted for course content. File contents must match the extension.
- Files are served through links that expire after 5 minutes and work for one file. A student only gets a link for a course they currently have access to. The link itself can be shared during those 5 minutes, and a downloaded file can be copied.
- Students get "not found" for courses they cannot access.
- Files are stored under the tenant's own folder in storage.
- *(Phase 2)* Payment screenshots accept images only, up to a size limit, and are checked by their contents.

## Privacy
- Registration collects personal data, including birth date, mobile number and address. Only what the form needs is collected.
- Students under 18 can register. No guardian details are collected for now.
- *(Phase 2)* Payment screenshots are private and are kept for a limited time (to confirm).

## Tenant isolation
- No user, registration, payment, course, file, grant or download link from one tenant is ever visible or usable in another tenant.
- Every data lookup is scoped to the tenant. A missing tenant is an error, never a default.
- The same email can be registered in two tenants. They are two separate accounts.
- Tests prove that one tenant can't read, list, grant or download another tenant's data.

## Removed from the earlier plan
- Login with ID + password, and the change-password and password-reset features.
- Google sign-in.

## Later (not in Phase 1)
- Payments: QR code, screenshot upload, admin verification and rejection, and the emails and screens that go with them.
- Students editing their own details, and institute admins editing their own branding.
- Other video formats (M4V, MOV, WEBM).
- Mock tests and exams (the question bank is the base for them).
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

## Defaults in use (change any you disagree with)
- Fees: one fee per course, with no discounts or instalments.
- Payment screenshots (Phase 2): images only (JPG, PNG), up to 5 MB.
- Session length: 7 days before a new code is needed.
- A rejected student can register again with the same email.
- A student can request another course later, with a new payment.
- Emails come from one verified address (for example a Gmail address) until a domain exists.
- A suspended tenant's students lose access immediately.
- Tenant branding: display name, logo and primary colour, changed by the platform admin.

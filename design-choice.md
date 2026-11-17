# PragyaPrep: Design Choices

Each entry records what we chose, what we turned down, and what it costs us. Sections 17 to 19 began as proposals and are now built (each has a status line saying which step built it). Payments and their review moved to Phase 2 on 17 Nov 2026. A few older sections still show a **Proposed** label on text that was written before the build, and the notes under them say what was done. Where the owner has confirmed a decision, it says so. Dates are when the decision was made. Cost figures are approximate list prices for `ap-south-1` and should be rechecked in the AWS Pricing Calculator.

## Contents

1. [Product name](#1-product-name)
2. [Phase 1 scope](#2-phase-1-scope)
3. [Accounts and sign-in (superseded by section 18)](#3-accounts-and-sign-in)
4. [Content formats](#4-content-formats)
5. [Cloud and infrastructure as code](#5-cloud-and-infrastructure-as-code)
6. [AWS account structure and access](#6-aws-account-structure-and-access)
7. [Terraform state](#7-terraform-state)
8. [Compute: Lambda](#8-compute-lambda)
9. [Database: DynamoDB](#9-database-dynamodb)
10. [File upload and delivery](#10-file-upload-and-delivery)
11. [Secrets](#11-secrets)
12. [Networking](#12-networking)
13. [Testing approach](#13-testing-approach)
14. [Cost summary](#14-cost-summary)
15. [Known limits and when to revisit](#15-known-limits-and-when-to-revisit)
16. [Account portability](#16-account-portability)
17. [Multi-tenancy](#17-multi-tenancy)
18. [Registration approval and email OTP login](#18-registration-approval-and-email-otp-login)
19. [Registration, payment review and course access (payment review is Phase 2)](#19-registration-payment-review-and-course-access)
20. [Frontend (step F1)](#20-frontend-step-f1)
21. [Platform admin page](#21-platform-admin-page)
22. [Correcting a student's details](#22-correcting-a-students-details)
23. [Course content and access (step M4)](#23-course-content-and-access-step-m4)
24. [Content screens (step F2a)](#24-content-screens-step-f2a)
25. [Institute logos](#25-institute-logos)
26. [Hosting the website (step M7)](#26-hosting-the-website-step-m7)
27. [Question bank (step Q1)](#27-question-bank-step-q1)

---

## 1. Product name

**Chosen:** PragyaPrep.ai ("Pragya" means wisdom, "Prep" is preparation).

**Alternatives considered:** Margdarshi AI (guide), Lakshya AI (goal), AaptMind and AaptTayari AI (keep the Aapt root), Abhyas AI (practice), Siddhi Prep (mastery), Saadhak AI (seeker).

**Why:** It says "preparation" directly, as asked, and the AI side stays in the name. It is short and easy to say.

**Trade-offs:** The root "Pragya" is common in Indian education, and similar names exist (for example, a JEE batch called Pragyaan). It also gives up the brand equity of "Aapt".

**To confirm before launch:** domain availability (`pragyaprep.ai`, `.com`, `.in`) and a class 41 trademark search on the IP India database.

---

## 2. Phase 1 scope

**Chosen:** Video and PDF content for many institutes (multi-tenant), with registration, admin approval, login by emailed code, and access given by the institute's admin by hand. Roles are platform admin, tenant admin and student.

**Update (17 Nov 2026):** Payments and manual payment review (section 19) moved to **Phase 2**. In Phase 1 the admin gives access by hand, which is built (section 23), so students can already watch content. Section 19 still describes the design for Phase 2.

**Deferred:** mock tests and exams, AI features, Parent and Mentor roles, migration from the existing platform. (Registration with manual payment review was deferred earlier and is now proposed for Phase 1, see section 19.)

**Change from the first plan:** Phase 1 was Admin and Student only, with admins granting access by hand. It now covers multi-tenancy (section 17, first tenant `aaptprep`), email OTP login (section 18), and registration with payment review (section 19).

**Why:** Content delivery is the part every other feature builds on, and it is the riskiest to get right (access control, large files). The rest can be added without reworking it.

**Trade-offs:** Phase 1 is much bigger than first planned. Tenants, email login, registration, payment review and expiring access all have to exist before the first student can learn. Payments are checked by hand, so admin effort grows with registrations. Mock tests, exams, AI features and online payments are still out.

---

## 3. Accounts and sign-in

> **Proposed: superseded by section 18.** Login by ID + password and Google is replaced by registration with an email, admin approval, and a one-time code (OTP) sent to that email. The text below records the earlier decision.

**Chosen:**
- Students sign themselves up, with either user ID + password or Google.
- ID + password sign-up needs a full name and an email (email is required).
- A first-time Google user picks an ID and confirms their name to finish the profile.
- If a Google email matches an existing account, Google is linked to it.
- Users can change their password. Admins can reset a student's password.

**Alternatives considered:**
- Admins create student accounts (rejected: students should own their profile).
- Phone OTP login (not chosen: needs an SMS provider and cost).
- Claiming imported IDs by matching email (dropped: migration is postponed).

**Why:** ID + password keeps existing students onboardable later by their old IDs. Google gives a no-password option.

**Change made (step M1):** login ID, email and Google account are unique within a tenant, not globally. A person at two tenants has two accounts, and a sign-in always happens for one tenant (section 17).

**Trade-offs:**
- The email on a password sign-up is **not verified**. Anyone can register with someone else's email. Add email verification (OTP) before relying on email for recovery.
- No rate limiting on login yet.
- Passwords are capped at 72 characters because of bcrypt.
- Google never creates an account silently; it always asks the student to pick an ID.

---

## 4. Content formats

**Chosen:** PDF and MP4 only. Files are checked by their first bytes, not just by name.

**Alternatives considered:** also accept MOV, M4V, WEBM (accepted in an early draft, then removed).

**Why:** Fewer formats means fewer playback problems across browsers and phones.

**Trade-offs:** Admins must convert other video formats to MP4 first. MP4 is not streamed as adaptive video (no HLS), so very large files on slow networks may buffer.

---

## 5. Cloud and infrastructure as code

**Chosen:** AWS, region `ap-south-1` (Mumbai), with Terraform.

**Alternatives considered:** other clouds, or manual console setup.

**Why:** Chosen by the owner. Mumbai keeps latency low and data in India. Terraform makes environments repeatable and reviewable.

**Trade-offs:** More setup work than a managed platform. Terraform state holds sensitive values, so the state bucket must stay private.

---

## 6. AWS account structure and access

**Chosen:**
- AWS Organizations is enabled in the main account (all features).
- IAM Identity Center is an **organization instance**, single-Region (Mumbai), with the user `pragyaprep` holding `AdministratorAccess`.
- The CLI uses SSO profile `pragyaprep-dev`, so no long-lived keys sit on the machine.

**Alternatives considered:**
- IAM user with access keys (simpler, but long-lived secrets).
- Multi-Region Identity Center (replicates to Oregon, adds KMS cost, not needed now).
- A separate AWS account per project and environment (recommended later).

**Why:** The first Identity Center instance was an account instance, which cannot assign access to accounts. It was deleted and recreated as an organization instance.

**Trade-offs:**
- The other project (`stocks-insights`) shares this account. It uses access keys and was not affected, but they share billing and blast radius.
- SSO sessions expire, so commands need `aws sso login` again.
- `AdministratorAccess` is broad. Narrow it once the setup settles.

---

## 7. Terraform state

**Chosen:** Remote state in S3 (`pragyaprep-tfstate-552808407801`, versioned, encrypted, public access blocked) with a DynamoDB lock table (`pragyaprep-tflock`). One state file per stack (bootstrap, network, app). The bootstrap stack itself uses local state.

**Alternatives considered:** local state only, Terraform Cloud.

**Why:** Remote state allows safe collaboration and recovery. Locking stops two runs at once.

**Trade-offs:**
- The bootstrap state file lives only on this machine (`infra/bootstrap`, gitignored). Back it up.
- Terraform now flags `dynamodb_table` as deprecated in favour of `use_lockfile`. It still works. Switch at the next backend change.
- State contains the generated secrets, so keep the bucket private.

---

## 8. Compute: Lambda

**Chosen:** One Lambda function (Python 3.12, ARM64, 512 MB, 15 s timeout) running the FastAPI app through Mangum, exposed through a Function URL.

**Alternatives considered:**
- ECS Fargate behind an ALB (always-on, about $50 a month, no cold starts).
- App Runner (simpler than ECS, also always-on cost).
- API Gateway in front of Lambda (adds a request fee and a 10 MB body limit).

**Why:** Dev cost drops to near zero because nothing runs while idle. A Function URL is free and enough for now.

**Trade-offs:**
- **Cold starts:** about 1 to 2 seconds on the first request after idle. Provisioned concurrency would remove it but costs about $5 a month per instance.
- A 15 s timeout and request-size limits mean large files must never pass through the API (see section 10).
- Function URL is public. Authentication is handled by the app itself.
- CORS is handled by the app only, to avoid duplicate headers.
- Prod may move to always-on compute once traffic justifies it.

---

## 9. Database: DynamoDB

**Chosen:** One DynamoDB table (`pragyaprep-dev`, on-demand, point-in-time recovery on) with one global index (`GSI1`). Key layout is documented at the top of `backend/app/repo.py`.

**Decided (section 17.1):** every key gets a tenant prefix, and all lookups need a tenant. Not built yet.

**Alternatives considered:**
- RDS PostgreSQL (always-on, about $15 to $18 a month).
- Aurora Serverless v2 with pause (cheaper idle, but a database resume of around 15 seconds and a higher cost when running).
- Several DynamoDB tables instead of one.

**Why:** Pay-per-request with no idle cost, and no database server to manage. Fits the cost goal.

**Trade-offs:**
- No joins or ad hoc queries. Every new feature needs its access patterns designed first.
- Uniqueness (email and course title within a tenant, since the multi-tenant change) is enforced with separate lookup items, claimed one at a time with conditional writes, with undo if one clashes. DynamoDB transactions would be atomic, but the moto test library mishandled them, so they were not used. A crash between steps could leave a stray lookup item.
- Course lists are not paginated yet. Fine for a small catalogue.
- Reporting or analytics will need exports or a second store.

---

## 10. File upload and delivery

**Chosen:**
- **Upload:** the admin's browser posts the file straight to S3 using a signed form. The backend then confirms the upload, checks the first bytes, and marks the item `ready`.
- **Download:** students receive a signed S3 link that works for 5 minutes for one file. S3 serves byte ranges, so video seeking works.
- Pending uploads are hidden from students.
- The S3 client uses the regional endpoint, so signed links point at the right host.
- **Built:** every file lives under its institute's own folder. Course files are `<institute>/courses/<course>/<file>` (section 23), logos are `<institute>/branding/<file>` (section 25), and payment screenshots will be `<institute>/payments/...` in Phase 2. The keys differ slightly from the first proposal (`tenants/<tenant>/content/...`) but keep the same rule: one folder per institute.

**Alternatives considered:**
- Upload through the API (blocked by Lambda size limits).
- CloudFront signed URLs or cookies (better for scale and caching, not built yet).
- A managed video service with adaptive streaming and DRM.

**Why:** Large videos never touch Lambda, which keeps cost and failures low.

**Trade-offs:**
- Anyone given a link can use it for 5 minutes. There is no watermarking or DRM, so a paying student could still share a file.
- Delivery from S3 directly costs about $0.11 per GB leaving AWS. CloudFront in front would reduce this.
- A single upload is capped at 5 GB. Larger files need multipart upload.
- Two bugs were found by testing against real S3: the global S3 hostname redirects and breaks browser POSTs, and rewriting the host after signing breaks the signature. The fix is a regional client from the start.

---

## 11. Secrets

**Chosen:** SSM Parameter Store `SecureString` under `/pragyaprep/dev`, read by the Lambda at startup. Values are passed to Terraform as `TF_VAR_*` variables from a private file (`~/.config/pragyaprep/dev.env`), never committed.

**Alternatives considered:** Secrets Manager (about $0.40 per secret a month), plain Lambda environment variables.

**Why:** Standard SSM parameters are free, and secrets stay out of the Lambda configuration.

**Done:** the email OTP login (section 18) removed the Google client secret and the admin password. What remains is the session signing key. Amazon SES needs no stored secret, because the Lambda's IAM role sends the email.

**Trade-offs:**
- Secrets still end up in Terraform state, which is encrypted but sensitive.
- Rotation is manual.
- The secrets file is on one machine. Back it up safely.

---

## 12. Networking

**Chosen:** No VPC for the dev app. The earlier dev VPC and NAT gateway were built and then destroyed.

**Alternatives considered:** Lambda inside a VPC with a NAT gateway (about $35 a month before data) or VPC endpoints (about $7 a month each).

**Why:** DynamoDB, S3 and SSM are reachable without a VPC, so a NAT gateway would only add cost.

**Trade-offs:** If we later need a private resource (a private database or cache), the Lambda must join a VPC, and then NAT or endpoints come back. The network Terraform stays in the repo for that day.

---

## 13. Testing approach

**Chosen:** Pytest with `moto` to fake DynamoDB and S3 locally. The backend has 836 tests (tenant isolation, emailed codes, registration and review, courses, files and access, logos, platform admin) and the frontend has 299 (Vitest with jsdom). Each step is also tried in a real browser, and against dev with real S3, where the fakes can't show real behaviour. The test tables are in `PHASE1-STATUS.md`.

**Alternatives considered:** DynamoDB Local in Docker, or testing only against real AWS.

**Why:** Fast, free and offline.

**Trade-offs:** Moto does not enforce presigned POST rules or transaction semantics, so some behaviour is only proven by the live test. The backend venv uses Python 3.12 to match the Lambda runtime.

---

## 14. Cost summary

| Area | Approx. monthly |
|---|---|
| Dev, idle or light use | under $1 |
| Video storage | $0.025 per GB |
| Video downloads from S3 | about $0.11 per GB |
| Email (Amazon SES) | about $0.10 per 1,000 emails |
| Website (S3 and CloudFront, step M7) | the app is a few hundred KB, so at this size it should sit inside CloudFront's free monthly allowance (recheck in the Pricing Calculator). Not measured yet |
| Domain (when bought) | $10 to $60 per year, plus about $0.50 a month for DNS |

Video downloads are the main driver. For example, 500 GB of downloads a month is roughly $40 to $45 without CloudFront.

---

## 15. Known limits and when to revisit

| Limit | Revisit when |
|---|---|
| 1 to 2 s cold start | Students complain, or traffic is steady (use provisioned concurrency or always-on compute) |
| Files can be shared for 5 minutes | Piracy becomes a concern (CloudFront signed cookies, watermarking, DRM) |
| S3 direct delivery cost | Monthly downloads pass about 100 GB (add CloudFront) |
| No delete-course or delete-user routes | Admin needs cleanup (four smoke-test courses remain in dev) |
| Single account, shared with another project | Before prod (use `new-account.sh`, see section 16) |
| `AdministratorAccess` for the CLI user | Setup settles (narrow the permissions) |
| Backend and infra have no CI | Before a second contributor joins |
| Prod environment does not exist yet | After the frontend is built |
| Tenant isolation relies on our code, not on separate databases | Always: keep the isolation tests, and revisit if a tenant needs a contractual guarantee |
| One busy tenant can use capacity others need | A tenant's traffic or storage is large enough to notice, so move it to its own stack |
| Tenants are created by the platform admin (from their page or by a script), with no self-service sign-up | More than a handful of tenants |
| Tenants are found by a slug in the web address path | A domain exists: add subdomains, a wildcard certificate and custom domains |
| Login depends on email delivery. A bounced or spam-filtered code locks a student out | Before launch: move email sending to a verified domain and watch bounce rates |
| The login page reveals whether an email is registered (kept on purpose for a better experience) | Probing or complaints appear: show status only after the email is proven |
| No password fallback if a student loses access to their mailbox | The admin can correct a student's email (built, section 22), so the remaining risk is a slow reply from the admin |
| (Phase 2) Payments will be checked by eye from screenshots, so fake or edited screenshots can pass | Admins start missing fakes, or volume grows: add duplicate-reference checks, bank-statement matching, or an online payment gateway |
| The registration form stores personal data, including students under 18 | Before launch: confirm consent, retention and deletion rules with a legal check |
| One admin per tenant, so a lost mailbox blocks admin work | A tenant asks for more staff: add more admins. The platform admin can already replace an institute's admin (section 21) |

---

## 16. Account portability

**Chosen:** The Terraform code holds no account ID or bucket name. Two scripts do the account-specific work:
- `infra/scripts/deploy.sh <account> <env>` works out the account ID, creates that account's state bucket and lock table, builds the Lambda, and applies the app stack. It passes the state settings to Terraform with `-backend-config`, and `backend.tf` is an empty `backend "s3" {}`.
- `infra/scripts/new-account.sh <name> <email>` uses a small Terraform stack (`infra/org`) to create a member account in AWS Organizations, assign the SSO user admin access, and add the local CLI profile. Then `deploy.sh` builds everything in it.
- Each account is a folder under `infra/accounts/` with an `account.env` (profile and region). Moving means adding a folder and running the script.
- The Lambda zip build is reproducible, so a deploy updates the Lambda only when the code really changed.

**Alternatives considered:**
- A separate copy of the Terraform code per account (drifts apart over time).
- Terraform workspaces (one state bucket and one set of credentials for all accounts, which mixes environments).
- Hardcoding the bucket name in each `backend.tf` (what we had first; every move meant editing several files).
- A full multi-account tool such as AWS Control Tower or Account Factory for Terraform (more than a one-person project needs).

**Why:** Moving or adding an account becomes one command, and it can be repeated and reviewed. The same code produces dev and prod, so they don't drift apart.

**Trade-offs:**
- **Data is not moved.** The scripts build an empty copy. DynamoDB and S3 data need a separate copy step (AWS Backup or export and import, and `aws s3 sync`).
- A bootstrap state file lives locally per account (`infra/accounts/<name>/bootstrap.tfstate`, not committed). Losing it means importing the bucket and table back into Terraform.
- The account factory needs the management account's credentials, and `AdministratorAccess` to the new account for the CLI user, which is broad.
- `new-account.sh` is tested only up to validation. It has not yet created a real account.
- The account factory never closes an account. Removing an entry only detaches it from the organization.
- New accounts start with a Lambda concurrency limit of about 10, which may need an increase before real traffic.
- Secrets are generated per account into `~/.config/pragyaprep/`. To keep existing logins valid after a move, copy the secrets file across.

---

## 17. Multi-tenancy

**Status:** Built (step M1) and tested live on dev. The first tenant is `aaptprep`.

**Confirmed by the owner:** shared tables with tenant-prefixed keys (17.1), and one admin per tenant for now (17.5).

**Requirement:** PragyaPrep must serve many coaching institutes ("tenants") from one deployment, with each tenant's students, admins, courses and files kept apart.

### 17.1 Isolation model

**Chosen (confirmed):** Shared infrastructure with tenant-prefixed data. One DynamoDB table and one S3 bucket serve every tenant. Every DynamoDB key starts with the tenant (for example `T#aaptprep#USER#...`), and every file key sits under `tenants/<tenant>/`.

**Alternatives considered:**
- **A table and bucket per tenant:** stronger isolation and per-tenant backups, but infrastructure grows with each tenant and onboarding needs a Terraform run.
- **A full stack per tenant:** strongest isolation and independent scaling, and the highest cost and effort per tenant.
- **A mix:** shared by default, with large or demanding tenants moved to their own stack later.

**Why:** Adding a tenant becomes data, not infrastructure. The cost stays near zero for small tenants, which fits the serverless plan.

**Trade-offs:**
- Isolation depends on our code. A bug that forgets the tenant could leak data across tenants. This is the biggest risk, so repository methods will require a tenant as an argument, and a dedicated test suite will try to cross tenants.
- A very busy tenant can use capacity that others need. DynamoDB on-demand absorbs most of it, but not all.
- Per-tenant backups, deletion and data export need extra work, because the data is mixed in one table.
- IAM can't easily restrict one tenant's data inside a shared table, so the Lambda role can reach all tenants' data. The app enforces separation.

### 17.2 How the tenant is identified

**Chosen:** A tenant slug sent by the frontend with every request (a header), taken from the frontend's configuration. Once a domain exists, tenants are found from the hostname instead (`aaptprep.pragyaprep.ai`, and later `aaptprep.com`).

**Alternatives considered:** a path prefix (`/t/aaptprep/...`), a query parameter, or subdomains only.

**Why:** There is no domain yet, so a header works now. It also keeps working behind subdomains later.

**Trade-offs:**
- A header is easy for a client to change, so the server never trusts it alone. The login token carries the tenant, and the request is refused if the two differ.
- Subdomains and custom domains need a wildcard certificate, a tenant-to-domain map and DNS work, which come with the domain.
- The login page sends the tenant with the email, and each emailed code is tied to that tenant.

### 17.3 Accounts across tenants

> **Updated by section 18:** a person's identity is their registered email, unique within a tenant. There are no login IDs.

**Chosen:** Separate accounts per tenant. The email is unique within a tenant. The same person at two tenants has two accounts.

**Alternatives considered:** One global identity per person with a membership in each tenant.

**Why:** Each institute runs its own business and controls its own users. Separate accounts also keep tenants independent.

**Trade-offs:** A person with two tenants logs in separately to each, with a separate code each time. A global identity would be smoother for them, but it would make one tenant's account depend on another's, and it complicates tenant deletion.

### 17.4 Google sign-in

> **Proposed: dropped.** Under the email OTP plan (section 18) there is no Google sign-in, so this decision no longer applies.

**Was proposed (now dropped):** One platform Google OAuth client for all tenants. The tenant travels through the sign-in flow inside the signed `state` value, so the callback knows which tenant to sign the person into.

**Alternatives considered:** A Google client per tenant, which allows white-label branding on the Google consent screen.

**Why:** One set of redirect URLs and one client to set up, no matter how many tenants there are.

**Trade-offs:** The Google consent screen shows PragyaPrep's name and not the tenant's. A tenant that needs its own branding there would need its own client later.

### 17.5 Roles and tenant management

**Chosen:**
- **Platform admin:** the PragyaPrep owner, with access to all tenants but only to manage tenants (create, suspend, change a tenant admin's email). Not tenant content.
- **Tenant admin:** one per tenant for now (decided). Manages that tenant's course list, registrations, payments and files. More admins can come later.
- **Student:** one tenant only.
- A script creates a tenant together with its one tenant admin. A tenant record holds the name, slug, status and branding (display name, logo and primary colour).
- A suspended tenant's users can't log in and its files can't be downloaded.

**Alternatives considered:** letting the platform admin see tenant content (rejected: confidentiality), or tenant self-service sign-up (later).

**Trade-offs:**
- Tenants are created by hand, so onboarding is manual until there's demand.
- **One admin per tenant is a single point of failure.** If that person leaves or loses their mailbox, the tenant is blocked from admin work until the platform admin changes the admin's email. Adding more admins later needs a role change, not a redesign.
- The slug is permanent. Changing it would change keys, so treat it as an identifier.

### 17.6 Login tokens

**Chosen:** A login token carries the tenant. A request is refused when the token's tenant doesn't match the tenant of the request.

**Why:** A token stolen or reused from one tenant can't be used against another.

**Trade-offs:** All tenants share one signing key. A leaked key affects every tenant. A per-tenant key would limit this but adds key management.

### 17.7 Data, migration and testing

- **Existing data:** the dev data is test-only (including four "SMOKE TEST" courses) and will be wiped when the keys change. No real data is affected.
- **First tenant:** `aaptprep` is created by the tenant script, with its one admin (identified by email).
- **Migration** of aaptprep's real students from the current platform stays deferred. It will import into this tenant.
- **Tests:** a new suite proves that one tenant can't read, list, grant or download another's data, that tokens don't cross tenants, and that a suspended tenant is locked out.

### 17.8 Infrastructure and cost

- **One deployment serves all tenants.** The Terraform stacks and account scripts stay as they are. A new tenant needs no new infrastructure.
- Accounts (section 16) are for environments such as dev and prod, not for tenants.
- **Cost:** unchanged for the platform. Per-tenant cost is mostly storage and downloads, which can be tracked from the tenant prefix. Cost per tenant can't be read from the AWS bill directly, so usage reports would need to be built later.
- **Later:** subdomains need a domain, DNS and a wildcard certificate, and quotas need per-tenant limits.

### 17.9 Revisit when

- A tenant needs a contractual isolation guarantee or its own backups, so move it to its own table or stack.
- A tenant's traffic or storage affects others, so isolate it.
- More than a handful of tenants exist, so add self-service onboarding.

---

## 18. Registration approval and email OTP login

**Status:** Built (step M2) and tested live on dev, with registration and approval (section 19, step M3). This replaces the ID + password and Google sign-in decisions in section 3.

### 18.1 The flow

1. **Register.** A student fills the registration form (section 19.2), which includes their email. This creates a **pending** registration.
2. **Approve.** A tenant admin approves or rejects the registration. Approving puts the email on that tenant's approved list ("whitelist"). It does not grant a course: access comes after the payment is verified (section 19). The student gets an email either way.
3. **Log in.** The student enters their email. If it is approved, a 6-digit code is emailed to it. Entering the code signs them in. This is the only way to log in.
4. **Admins** (tenant and platform) sign in the same way, so there is one login path to build and secure.

### 18.2 What the student is told

| Email's state | Message shown |
|---|---|
| Not registered | "This email isn't registered with <tenant>. Register first." |
| Pending | "Your registration is waiting for approval. We'll email you once it's approved." |
| Rejected | "Your registration wasn't approved. Contact <tenant>." |
| Suspended or revoked | "Your access is paused. Contact <tenant>." |
| Approved | "We've emailed you a 6-digit code." |

A code is sent only for approved emails. Anyone else gets a message and no email, so the system can't be used to send mail to strangers.

For the best experience, the messages are shown straight away. A not-registered email gets a **Register** button, and a pending one shows what happens next.

### 18.3 Code rules

- 6 digits, valid for 10 minutes, works once.
- Stored hashed, never as plain text, and removed automatically after it expires (a DynamoDB time-to-live setting).
- Limited attempts per code, and a limit on how many codes can be requested per email and per network address in an hour.
- A new code cancels the previous one.
- A successful login returns the same kind of signed session token used today, scoped to the tenant.

### 18.4 Alternatives considered

- **Password plus OTP:** stronger when a mailbox is shared, but students must manage passwords, which was the thing we wanted to avoid.
- **Magic link instead of a code:** one click, but links are easily opened by email scanners and can fail on a different device.
- **SMS OTP:** works without email, but needs an SMS provider and costs per message in India.
- **Keep Google sign-in as well:** convenient, but it adds a second path to secure and breaks the "approval first" rule unless it also checks the approved list.
- **Self sign-in without approval (the earlier plan):** simpler, but any person could join a tenant.

### 18.5 Trade-offs

- **Email delivery is now the login system.** If a code lands in spam or bounces, the student is locked out. This is the biggest operational risk. Sending from a verified domain fixes most of it, so a domain should come soon.
- **Until a domain exists,** emails can only be sent from a single verified address (for example a Gmail address). That works for dev but has poor delivery and may land in spam.
- **Amazon SES starts in "sandbox" mode** in a new account, where it only sends to verified addresses, and production access has to be requested (about a day). **This account already has production access** (enabled for another project), so mail can go to any address and only the sender needs verifying. A new account for prod would start in sandbox.
- **The status messages reveal registration.** Anyone who types an email learns whether it is registered, pending, rejected or approved at that tenant. Rate limiting reduces bulk checking. Showing status only after the person proves they own the email would avoid this, but would mean sending codes to unapproved emails. Decided: show clear status messages straight away, for the best experience, with limits on how often an email can be tried. Revisit if probing becomes a problem.
- **No password fallback.** A student who loses their mailbox can't log in until an admin changes the registered email, which needs an admin tool.
- **A person with a shared or compromised mailbox** is exposed, because the email is the only proof of identity.
- **Plus-addresses and dots** (for example `name+a@gmail.com` and `name@gmail.com`) count as different emails. We treat emails as case-insensitive only, and don't merge them.
- **Sessions:** with no passwords, a long session (7 days) saves students from asking for codes all the time, but a stolen session lasts as long.

### 18.6 Effect on the design

- **Data (per tenant):**
  - a registration record per email: all form fields, status (pending, approved, rejected, suspended), and who decided and when (section 19.7)
  - the user profile, created on approval
  - a short-lived code record with an expiry
- **Removed:** login ID, passwords and password hashes, change and reset password, the Google OAuth flow and its secrets, and the SSM secret for Google.
- **Added:** an email-sending service (Amazon SES), permission for the Lambda to send mail, a DynamoDB expiry setting for codes, and rate limits.
- **Admin:** a registrations queue with approve, reject, suspend and revoke.
- **Tenant script:** creates the tenant and approves its one tenant admin's email.
- **Tests:** codes expire, can't be reused, are limited, and never cross tenants. Every state in 18.2 returns the right message, and no email is sent for unapproved addresses.
- **Fees and QR payment screenshots** are now part of the flow. They attach to the registration, and course access depends on a verified payment (section 19).

### 18.7 Cost

Amazon SES costs about $0.10 per 1,000 emails, so login codes and approval emails cost cents at this scale. It is not a cost driver.

### 18.8 Revisit when

- Bounces or spam placement lock students out: add a verified domain, or an SMS fallback.
- Fraud or registration probing appears: show status only after the email is proven, and add stronger limits or a challenge.
- Students share mailboxes, or the institute wants stronger security: add a password or second factor.
- A student loses their mailbox often: add an admin tool to change the registered email.

### 18.9 As built (step M2)

- **Endpoints:** `POST /api/auth/request-code`, `POST /api/auth/verify-code`, `GET /api/auth/me`. The institute comes from the `X-Tenant` header.
- **Codes:** 6 digits, valid 10 minutes, one use. They are stored as a keyed hash (HMAC) tied to the institute and email, with a DynamoDB expiry so rows clear themselves.
- **Limits, as built:** 30 seconds between codes for one email; 5 codes an hour per email per institute; 5 wrong tries per code; 20 code requests and 60 code tries per hour per connection. The connection is the address the platform reports, never a header such as `X-Forwarded-For`, which anyone can fake.
- **Counters:** fixed hourly windows, counted in one step inside DynamoDB so two simultaneous requests can't both slip under a limit. Counter rows hold only a short fingerprint of an email or address, never the readable value, and they expire by themselves.
- **Messages:** every status answers straight away with its own message, as decided. A refusal for too many requests says how long to wait.
- **Sessions:** a signed token that carries the institute and role, lasting 7 days. It is rejected at any other institute, and as soon as the person is no longer approved, the institute is suspended, or the person is removed.
- **Roles:** student, tenant admin and platform admin, with a reusable check that lets only the right role through.
- **Email failures:** if the email can't be sent, the person gets a clear "try again" message, the unused code is removed, and no wait period is left behind. The cause is written to the log.
- **Removed from AWS:** the old admin password and Google secret.
- **Open item:** the sender is a Gmail address, so the first emails may land in Spam until a domain is verified.

---

## 19. Registration, payment review and course access

**Status:** Registration and the admin's review are **built (step M3)**, and access is given by the admin by hand (step M4, section 23). **Payments and their review moved to Phase 2 on 17 Nov 2026**, so 19.4 and 19.10 are the design for that phase and are not built. It extends section 18.

**Confirmed by the owner:** each tenant manages its own course list; students under 18 can register; access length is configurable; a screenshot is enough as payment proof; and the login page shows clear status messages straight away.

### 19.1 The journey

1. **Register.** The student submits the registration form with **Register**. It creates a **pending** registration.
2. **Review.** A tenant admin approves or rejects it. Approval adds the email to the tenant's approved list. It doesn't grant a course.
3. **Log in** with the emailed code (section 18).
4. **Pay.** The student sees the fee and the tenant's payment QR code, pays outside the app with a UPI app, and uploads a screenshot for their requested course.
5. **Verify.** The tenant admin checks the screenshot. If it is correct, they verify it, and the course access is granted. Otherwise they reject it with a reason, and the student uploads again.

### 19.2 Registration form

All fields are required: email, first name, last name, birth date, gender, mobile number, WhatsApp number (with a "same as mobile" checkbox), complete address, city, PIN code, and course.

- The course dropdown is a list the tenant admin manages (decided). The first tenant starts with IPMAT, CAT and CLAT.
- Checks: email format, 10-digit Indian mobile numbers, 6-digit PIN code, a reasonable birth date, and a gender from a fixed list.
- A registration asks for one course. Another course later is a new request with its own payment (Phase 2).

### 19.3 States

| Thing | States |
|---|---|
| Registration | pending, approved, rejected, suspended |
| Payment | awaiting payment, submitted, verified, rejected |
| Course access | none until a payment is verified, or the admin grants it by hand; then it ends when the course's access length runs out |

### 19.4 Payment screenshots

- Uploaded straight to private storage with a signed form, the same way course files are, then confirmed by the backend.
- Images only (proposed: JPG and PNG), up to a size limit (proposed: 5 MB), and checked by the file's first bytes.
- Stored under the tenant's folder (`tenants/<tenant>/payments/...`). Only that tenant's admins can see them, through short-lived signed links.
- A screenshot is enough for now (decided). The student doesn't enter a transaction reference or amount, so the admin compares the screenshot with the bank or UPI statement.
- Kept for a limited time (proposed: 12 months), then deleted.

### 19.5 Alternatives considered

- **Admin grants access by hand with no payment step in the app:** simpler, but there is no record or workflow, and admins would chase screenshots over chat.
- **An online UPI payment gateway (for example Razorpay):** automatic and hard to fake, but needs a merchant account, fees per payment, and a refund and reconciliation process. It can replace the manual review later.
- **Approving the registration and the payment in one step:** fewer clicks, but the admin would approve a student before knowing they will pay.
- **Payment first, then registration:** doesn't fit the flow you described.

### 19.6 Trade-offs

- **Admins do manual work.** Every payment needs a person to compare the screenshot with the bank or UPI app. At many registrations a day this becomes a bottleneck.
- **Screenshots can be faked or edited.** There is no link to the bank, and the student doesn't enter a reference or amount (decided), so the admin must match the screenshot against the real statement by eye. Adding a reference field later would make this easier.
- **Reused screenshots** are not caught automatically. A later check could compare file hashes, or an AI model could read the amount and UTR from the image.
- **Payment screenshots are private data.** They can show names, UPI IDs and account details, so they are admin-only and deleted after a retention period.
- **The registration collects personal data** (birth date, mobile number, address). Students under 18 can register, with no guardian fields (decided). India's data protection law can require a guardian's consent when a child's data is processed, so a legal check is advisable before launch.
- **A student sits in limbo** between approval and payment, so they need a clear page that says what to do next and what is pending.
- **WhatsApp numbers** are stored but not used yet. Using them for messages needs its own consent and a messaging provider.

### 19.7 Effect on the design

- **Data (per tenant):** a registration record per email (all form fields, status, who decided and when), a payment record (course, fee, screenshot, status, reviewer, reason), a course catalogue with fees (this is also what fills the dropdown), and the tenant's payment QR image.
- **Admin screens:** a registrations queue, a payments queue, fee and QR settings.
- **Student screens:** the registration form, a status page, and a payment page with the QR code and screenshot upload.
- **Emails:** registration received, approved or rejected, payment submitted, and payment verified or rejected.
- **Access:** the existing course grant is created when a payment is verified, so the course and file rules stay the same.
- **Tests:** a student can't get a course without a verified payment, can't see another student's screenshot, and can't use a screenshot from another tenant. Registration validation, state changes and emails are covered.
- **Storage rules:** the S3 bucket needs separate rules and signed-link handling for payment images, so students can upload but never read back others' images.

### 19.8 Cost

The payment images are small, so storage is negligible. Emails cost cents (section 18.7). The real cost is admin time.

### 19.9 Revisit when

- Admins spend too long on payments, or see fakes: add duplicate-reference checks, then an online payment gateway.
- A legal review changes what data may be collected or kept.
- Students want to pay in instalments or get refunds: this needs a payment ledger, not a single status.
- Tenants want different payment methods or multiple QR codes.

### 19.10 Access length (decided: configurable)

**Chosen:** Each course carries an access setting that the tenant admin controls: no expiry, a number of days counted from the day the payment is verified, or until a fixed date. When a payment is verified, the grant records its own end date, and that date is checked every time a course or file is opened.

**Alternatives considered:**
- One fixed length for the whole tenant (simple, but a one-month crash course and a one-year course can't differ).
- An expiry chosen by the admin for each student at verification (most flexible, but slow and easy to get wrong).
- No expiry at all (simplest, but students keep access forever).

**Why:** Courses differ in length, and a per-course setting lets the admin choose once and forget.

**Trade-offs:**
- Changing a course's setting later does **not** change access already granted, because each grant keeps its own end date. An admin can still extend or end a single student's access by hand.
- Expiry is checked when something is opened, not by a background job, so nothing runs overnight. An expired student simply stops seeing the course. Signed file links already issued still work until they expire in 5 minutes.
- A student whose access ends can pay again to renew. A reminder email before expiry is useful, but is not part of Phase 1.
- Dates and times use one clock (UTC), so a "fixed date" means the end of that day in a set time zone. The time zone is India Standard Time, and the code uses it for birth dates and course end dates.

### 19.11 As built (step M3): courses, registration and review

- **Endpoints:**
  - Public: `GET /api/courses` (the dropdown) and `POST /api/register`.
  - Admin only: `GET`, `POST` and `PATCH /api/admin/courses`, `GET /api/admin/registrations`, and `POST /api/admin/registrations/{email}/approve | reject | suspend | reactivate`.
- **Courses live with each institute.** A course has a name (unique ignoring capitals and extra spaces), a fee in whole rupees, an access length (unlimited, a number of days, or until a date) and an open or hidden flag. The dropdown shows open courses only, with just the id, name and fee. aaptprep starts with CLAT, IPMAT and CAT at 10000, unlimited.
- **The form** checks every field and reports **all** mistakes together, field by field, so the page can mark them in one go. Mobile numbers accept `+91`, `91`, a leading `0`, spaces and dashes, and are saved as 10 digits. Birth dates must make the person 10 to 80 years old by the Indian calendar. The course must be an open course of that institute.
- **A registration is a person row** (the same row that later becomes the student), with status `pending`, the form's details, and the course's name saved at that moment so a later rename doesn't change the record.
- **Duplicates:** a pending, approved or suspended email, or the institute admin's, is refused with a message that says what to do next. A **rejected** student can register again, and the new form replaces the old one. Mistakes in the form are reported **before** anything about whether an email is known, so a bad form can't be used to check who is registered.
- **Limits:** 10 registration forms an hour per connection.
- **Decisions** move a registration between statuses in one safe step. Approve works from pending or rejected, reject from pending, suspend from approved, reactivate from suspended. Anything else is refused with a clear message, and two admins pressing a button at once can't both win. Each decision records who made it and when, and a rejection can carry a reason of up to 300 characters.
- **Emails:** a receipt on registering, and an email on approval or rejection (with the reason). Suspending and reactivating send nothing. If an email can't be sent, the registration or decision still stands, and the admin's screen is told `email_sent: false`.
- **The queue** lists students by status, newest first, using an index that follows each person's status. It returns up to 200 per status for now, which is plenty for one institute, and paging can come later.
- **A suspended student's session ends at once,** because every request checks that the person is still approved.

---

## 20. Frontend (step F1)

**Status:** Built (step F1) and tested (112 tests at the time, a real browser against the sandbox, and a live check against the dev API). Later steps added screens (sections 21, 24 and 25) and hosting (section 26).

**Chosen:** An Angular app (version 22) in `frontend/`, using standalone components and signals, with no UI library and plain CSS. It has these screens: the start page, the institute frame, registration, login, a student home, the admin's registrations queue, and the admin's courses.

**Alternatives considered:** React or Vue (the owner's stack is Angular), a UI kit such as Angular Material or Tailwind (faster to start, but more to learn, to theme per institute, and to keep up to date), and server-rendered pages (simpler, but a poorer fit for the interactive admin screens).

**Why:** Angular matches the stack you asked for. Plain CSS with a few colour variables is enough for a small set of screens, keeps the bundle small (about 77 KB sent over the network on first load), and lets each institute's colour apply with one variable.

### 20.1 Decisions inside the frontend

- **The institute comes from the address, for now.** Pages live under `/<institute>/...`, for example `/aaptprep/login`. One build serves every institute. When a domain exists, the institute will be read from the hostname instead, and the address prefix will go.
- **The institute's look is applied at load.** The page asks the API for the institute's name and colour, sets a main colour, and picks white or dark text by contrast so buttons stay readable in any colour. An unknown or switched-off institute gets a plain explanation instead of a broken page.
- **Sessions are kept per institute** in the browser's local storage, together with when they end. Signing in at one institute doesn't sign you in at another, which matches the API. A session the API refuses is cleared, and the person is sent to the login page with a message.
- **One interceptor adds the institute and the sign-in** to every call to our API, and leaves calls to other sites alone.
- **The server is the judge of the form.** The registration page does no checks of its own. It shows the API's message under each field and a summary on top, moves the cursor to the first mistake, and clears a field's message as soon as the person edits it. This keeps the rules in one place.
- **The login page shows the status messages straight away,** with a Register button when the email isn't registered, a countdown before a new code can be requested, and a reminder to check spam.
- **Pages protect themselves,** but the API is the real protection. A guard keeps a signed-out person off signed-in pages and a student off admin pages. The API refuses them anyway.
- **Accessible by default:** every field has a label, mistakes are marked for screen readers, and focus is visible. The layout works from phone width up.
- **Two environments:** the local test version (API on port 8000, or any port with `?api=` added once) and the live dev environment. The `?api=` override exists only in the local version.

### 20.2 Trade-offs

- **Sessions in local storage can be read by a script that runs on the page** (cross-site scripting). Cookies that scripts can't read are safer against that, but need the API and the screens on one site and protection against forged requests. This is worth revisiting when hosting is set up.
- **One build for all institutes means the logo and colours load after the page**, so there is a brief default look. A hostname-based setup later can fix this.
- **Only the screens needed at the time existed.** The platform admin page, logo upload, course files, course access and the student's courses came in later steps (sections 21, 24 and 25). Payment screens are Phase 2.
- **The browser found three bugs the tests missed** (layout margin, an escaped slash in a link, and stale error messages). Tests check behaviour, so a real look at the page is still needed for each new screen.

### 20.3 Revisit when

- A domain exists: read the institute from the hostname, and decide on cookies for sessions.
- An institute needs a logo or a different look: add logo upload and more branding fields.
- The number of screens grows: consider shared components for forms and tables.

---

## 21. Platform admin page

**Status:** Built and tested (59 backend and 25 frontend tests, and a real browser against the sandbox), deployed to dev and tested live.

**Chosen:** The platform admin gets a page at `/platform-admin` to view, add and edit institutes and their one admin. The platform admin itself is still created only by the `manage_tenants.py platform-admin` script. Nothing can be deleted from the screens or the API.

**Alternatives considered:** keep everything in scripts (safe, but the owner needs a terminal for every new institute), allow delete (one wrong click loses an institute's students and payments, so suspend is offered instead), and let the platform admin create other platform admins (more power on screen than is needed, and the first one is easy to make with the script).

### 21.1 Decisions

- **The platform admin is a member of the reserved `platform` institute** and signs in like anyone else, by emailed code. The API checks the role on every route of `/api/platform`.
- **Replacing an institute's admin creates the new admin first, then switches the old one off** (suspended, with a reason), so the institute is never left without an admin. It is refused if the new email is already registered at that institute.
- **The screen warns before a switch** and always sends the name shown, so a new admin can't quietly inherit the old admin's name.
- **Everything is checked before anything is written,** and the welcome emails never fail the action (a warning is shown if one could not be sent).
- **The short name is permanent,** because it is part of every key and address.

### 21.2 Trade-offs

- One admin per institute, as agreed. A second admin needs a change here later.
- Institutes created before this feature have no admin recorded, so `link-admin` is run once for them.
- The platform admin can't see an institute's students or courses, only who runs it.

### 21.3 Revisit when

- Institutes need several admins, or the platform needs several platform admins.
- Billing or plans per institute are added.

---

## 22. Correcting a student's details

**Status:** Built and tested (22 backend and 11 frontend tests, a real browser, and a live check on dev).

**Chosen:** The institute admin can edit any detail of a registration, at any status, from the registrations page, including the email. A student's own editing comes later with their screens (F2).

**Alternatives considered:** let the student re-register (loses the record and, later, payments and access), edit straight in the database (error-prone, and easy to miss the status index), and a separate "change email" action (two places to maintain the same checks).

### 22.1 Decisions

- **One endpoint, only changed fields.** The screen sends just what changed, and the server checks the merged record with the same rules as registration, reporting every mistake at once.
- **The email is the key, so changing it moves the record.** The new row is written only if the email is free, then the old one is removed. A taken email is refused, and nothing changes. The old email's pending login code is removed, and its sessions stop because the person no longer exists under that email.
- **The status is untouched.** A correction isn't a decision. Who edited and when, and the earlier email, are recorded on the record.
- **The new address is emailed;** the old one is not, because a mistyped address may belong to a stranger.

### 22.2 Trade-offs

- A record has no history beyond the last edit and the earlier email. A full change log can come with payments.
- Once payments and access exist, they must move with the email. That is why this was built before M5.

### 22.3 Revisit when

- M5 adds payments and M4 adds access: move those rows in the same step.
- Students need to edit their own details after logging in.

---

## 23. Course content and access (step M4)

**Status:** Built and tested (42 tests, and a live check on dev with real S3). Its screens are in section 24.

**Chosen:** The admin adds PDF and MP4 files to a course. The browser sends the file straight to S3 using a signed form, then tells the API it is done, and the API checks it. The admin gives an approved student access to a course by hand (a verified payment will do the same in M5). A student opens a file through a link that works for 5 minutes.

**Alternatives considered:** sending files through the API (Lambda has a small request size limit, so videos would not fit), trusting the file ending alone (a renamed file would be stored and served), keeping a student's access in a separate table (one more place to move on an email change), and long-lived public links (a shared link would keep working).

### 23.1 Decisions

- **Two steps for an upload:** ask, then complete. A file is `uploading` and invisible to students until the API has seen it in S3 and checked that its first bytes match (a PDF starts with `%PDF-`, an MP4 has `ftyp`). A file that fails is deleted from S3 and from the table.
- **Only PDF and MP4,** decided by the file ending and then confirmed by the contents. Each file lives under its institute's folder, `<institute>/courses/<course>/<file>`.
- **Half-finished uploads clear themselves:** their row has an expiry time of a day, which is removed when the file is checked.
- **Access is stored with the student** (`ACCESS#<course>` under their key), so it moves with them when the admin corrects their email. It records who gave it, when, how (by hand for now) and when it ends.
- **Expiry is judged when the student asks,** so access ends at the right moment with no background job. A course set to "N days" counts from the grant, and one set to "until a date" ends at the end of that day in India. Giving access again renews it.
- **A student without access gets "not found",** the same answer as for a file that doesn't exist, so nobody can learn what exists. A suspended student is refused before any of this, because every request checks they are still approved.
- **Where a file is stored is never shown** to a student. They only get the short-lived link.
- **The admin can delete a file** (it is removed from S3 too), and can take a student's access away. Both close the student's link at once.

### 23.2 Trade-offs

- **A link can be shared during its 5 minutes,** and a downloaded PDF can be copied. Stopping that fully needs DRM or watermarking, which is out of scope. The short life limits the damage.
- **A student cannot yet open files from a screen.** That comes with F2.
- **No resumable or multi-part upload yet.** A single signed upload handles files up to 5 GB, but a dropped connection means starting that file again. Worth revisiting for long lecture videos.
- **No video processing:** files are served as uploaded, with seeking through byte ranges (checked live).

### 23.3 Revisit when

- M5 adds payments: a verified payment calls the same grant, with the source set to payment.
- Videos are large or students are on weak connections: resumable uploads and adaptive streaming.
- Content needs ordering, sections or free previews.

---

## 24. Content screens (step F2a)

**Status:** Built and tested (34 tests, and a live check in a real browser against dev with real S3).

**Chosen:** Three screens for M4: a **Files** page for each course (admin), a **Course access** section on an approved student's details (admin), and **My courses** (student). The student's page is a separate address (`/<institute>/courses`) with its own link in the top bar.

**Alternatives considered:** a modal for uploads (hard to read progress and errors in, and awkward on a phone), a big separate admin area for access (access is about one student, so it belongs with their details), and a custom video player (the browser's own player already seeks, goes full screen and handles captions).

### 24.1 Decisions

- **The browser sends the file to S3 itself,** using the signed form from the API, with a plain `XMLHttpRequest` because it reports upload progress and `fetch` does not. Our sign-in header is never sent to S3. The screen does the three steps in order and shows the API's own message when any of them fails, such as "isn't a real PDF".
- **The server is the judge,** as in registration: the page does not check file types itself, so the rules live in one place. The title fills itself from the file name until the admin types one.
- **A file that failed in the middle stays visible as "not finished"** with an explanation, so the admin can delete it rather than wonder.
- **Deleting asks first** ("Yes, delete" or "Keep") because it removes the file from storage for every student.
- **Access is shown where the student is.** The list loads when the details are opened, and only for approved students, because only they can be given access.
- **A PDF opens in a new tab and a video plays in the page.** The new tab is opened the instant the button is pressed, before the link is fetched, so browsers don't block it as a pop-up, and it can't reach back into our page. If a video's link runs out while it plays or while jumping around, the page fetches a new one and carries on from the same spot. It gives up after two tries, so a broken video can't loop forever.
- **"Not found" means access ended.** The student is told plainly, and the list is refreshed.

### 24.2 Trade-offs

- **Uploads are one request per file.** A dropped connection means starting that file again. Resumable upload is worth adding for long lecture videos.
- **No student-facing payment or "request access" yet.** Access is given by hand until M5.
- **The video uses the browser's own controls.** No speed or quality choices beyond what the browser offers.
- **A downloaded or shared PDF can still be copied** during its link's 5 minutes, as noted for M4.

### 24.3 Revisit when

- M5 arrives: the payment page goes on the student's side, and the payments queue on the admin's.
- Videos are large: resumable uploads and a progress that survives a refresh.
- Content needs order or sections: drag to reorder and group files.

---

## 25. Institute logos

**Status:** Built and tested (30 backend and 10 frontend tests, and a live check on dev with real S3).

**Chosen:** The platform admin adds, replaces and removes an institute's logo from the Edit form on the Institutes page. It shows beside the institute's name at the top of every page. The institute's own admin can't change it.

**Alternatives considered:** letting the institute admin upload it (you decided branding stays with the platform admin), a public bucket or CDN link (opens the whole bucket's policy for one small file), serving the picture's bytes through the API (works, but passes every image through Lambda), and accepting SVG (can carry scripts).

### 25.1 Decisions

- **Same upload pattern as course files:** ask, send straight to S3 with a signed form, then the API checks. Only a real PNG or JPEG becomes the logo, judged by its first bytes, up to 1 MB. A failed check deletes the file and keeps the old logo.
- **PNG and JPG only.** SVG is left out on purpose, since it can carry scripts.
- **Public, because it shows before login.** `GET /api/logo/<institute>` needs no sign-in and answers with a redirect to a signed link, so the bucket stays private. The redirect may be kept by browsers for 5 minutes and the link behind it lasts an hour.
- **The page learns the address from the institute info it already loads.** The address carries a short version tag that changes with each new logo, so browsers never show a stale one.
- **A replaced or removed logo's file is deleted.** Each logo is stored under the institute's own folder, `<institute>/branding/`.
- **Removal is a POST, not a DELETE.** The platform API has no DELETE at all, and a test keeps it that way. Removing a logo leaves the institute itself untouched.
- **It saves at once,** separately from the form's Save, and the form keeps what has been typed.
- **Shown beside the name,** on a small white tile so any logo stays readable on any institute colour, and with empty alt text since the name next to it says who it is.

### 25.2 Trade-offs

- A logo upload that is never completed leaves its file in S3 until the next upload or removal. It is at most 1 MB each, and a cleanup rule can be added later.
- A logo with a transparent background sits on a white tile, which may look boxy on some colours.
- No cropping or resizing. The picture is shown at a fixed height, keeping its shape.

### 25.3 Revisit when

- Institutes want to change their own logo: add the same form to the institute admin's pages.
- A domain and CDN exist: serve logos from there, with long caching.

---

## 26. Hosting the website (step M7)

**Status:** Built and tested live on dev: https://d1szng4oy9m4an.cloudfront.net

**Chosen:** The Angular app's files sit in a private S3 bucket, and CloudFront serves them over HTTPS at CloudFront's own address. The API stays at its Lambda URL, and the website calls it from the browser. A script, `infra/scripts/deploy-web.sh`, builds and publishes the website.

**Alternatives considered:** Amplify Hosting (easy, but another service to learn and pay for, with less control), serving the website from the Lambda that serves the API (mixes two jobs and sends every file through Lambda), a public S3 website endpoint (no HTTPS, and it needs a public bucket), and waiting for a domain (blocks everyone from trying the product).

### 26.1 Decisions

- **The bucket is private,** and only this CloudFront distribution can read it, through an origin access control. A direct request to the bucket is refused.
- **Deep links work on refresh.** The app has its own pages like `/aaptprep/login`. When someone refreshes, S3 has no such file, so 403 and 404 answers are turned into the app itself (with a 200). The app then shows the right page.
- **Caching follows the files.** Most file names contain a hash of their contents, so they are kept for a year and never change. `index.html` is marked no-cache, so a new version shows up at once. The cache is also cleared on every deploy.
- **Old files stay on purpose.** Someone with the page open can still load the parts they need until they refresh. Old files can be tidied up occasionally.
- **Safety headers come from the AWS-managed policy:** HTTPS only, no framing, no content sniffing, and a strict referrer policy.
- **The site's address is always an allowed origin** for the API and for S3 uploads, added in Terraform, so a new address never needs a manual edit. The addresses for working on your own computer stay in `cors_origins`.
- **The institute still comes from the address path** (`/aaptprep/...`), as before, until a domain exists.

### 26.2 Trade-offs

- **The address is not memorable** (`d1szng4oy9m4an.cloudfront.net`). A real domain, with its own certificate, fixes that.
- **A missing script or style file also answers with the app and a 200,** because of the refresh rule. The browser refuses it as the wrong type, so it fails safely, but the error looks odd.
- **The production build talks to the dev API,** because it uses `environment.live.ts`. The prod environment (M8) needs its own settings file.
- **No CSP header yet.** The safety headers above are in place, and a content security policy can be added when the set of addresses is final.

### 26.3 Revisit when

- A domain is chosen: add a certificate and the domain to CloudFront, read the institute from the hostname, and add the domain to the allowed origins.
- M8 creates a prod environment: a second bucket and distribution, and its own API address in the build.

---

## 27. Question bank (step Q1)

**Status:** Built and tested live on dev. Added on 17 Nov 2026 as new scope, ahead of M8. It is the base for mock tests, which stay deferred.

**Chosen:** Each institute has its own private bank of multiple-choice questions. An admin picks a **subject** and a **topic**, writes the question and exactly four options, marks the one correct option, and writes a **reason for every option** (why it is right or why it is wrong). Each question also has a difficulty (easy, medium, hard) and a status (draft or published). Only published questions will be used by tests later. Students can't see any of it yet.

**Alternatives considered:** a free-text subject and topic (typos split one topic into many, and filters stop working), a shared bank across institutes (breaks tenant isolation), editable topic lists per institute (more screens, not needed yet), and importing questions from a file (later, once the shape of a question is settled).

### 27.1 Decisions

- **The subject list is fixed and shared.** It had 37 subjects in three sections (13 languages, 23 domain subjects, General Aptitude), taken from the CUET-style list, and since step Q10 it has 43: a fourth section, "IV: Management and law entrance", adds six subjects for IPMAT, CAT and CLAT. It lives in the code (`app/papers.py`) and is the same for every institute. It is not editable in Phase 1.
- **Topics are split from the "main topics" text.** Each subject has its own list. The 13 language subjects share one: Reading comprehension, Vocabulary, Grammar, Verbal ability. A question's topic must belong to its subject.
- **One format:** plain text, four options, one correct. Hindi and the other language subjects work because the text is Unicode. Several correct answers, numerical answers, images and formulas can come later.
- **Every option needs a reason.** This is the point of the bank: students will later learn from why each wrong option is wrong.
- **Adding in a row (added the same day):** after **Save and add another** the form stays open with the subject, topic, difficulty and status kept and the question and options cleared, the list below filters to that subject and topic, and a counter shows how many were added. This is front-end only. The API is unchanged and the subject and topic are still sent with every question, so each question stays checked on its own.
- **Excel upload (added the same day):** one `.xlsx` file, one row per question, columns Subject, Topic, Question, Option A to D, Why A to D, Correct, Difficulty, Status. The template has dropdowns and an instructions sheet, and lists every subject and its topics. The browser sends the file as the raw request body (no multipart library). The server checks every row with the same rules as the form, so nothing gets in that the form would refuse. It runs in two steps with the same file: a preview (`POST /api/admin/questions/import`), then the same call with `?confirm=true`. The server keeps nothing between the two steps. Rows with problems are never saved; good rows are. A question already in the bank (same subject, topic and wording, ignoring capitals and spaces) is skipped, so a file can safely be uploaded twice. Limits: 500 rows, 2 MB, `.xlsx` only, and the column headings must match the template (extra columns after them are ignored).
- **Pictures (step Q3, added the same day):** a question can have one picture on the question and one on each of the four options (positions `question`, `A`, `B`, `C`, `D`). PNG or JPG only (SVG and GIF are left out: SVG can carry scripts), up to 1 MB each, the same rules as logos. The reasons stay text only.
  - **Upload first, attach on save.** The browser asks for a signed form (`POST /api/admin/question-images`), sends the file straight to S3, and calls complete, where the server reads the first bytes and keeps only a real PNG or JPG. The question is then saved with the picture ids (`images: {position: id}`). Only a picture that is ready and not on another question can be attached. This order lets a picture be added before the question exists, so the "option needs text or a picture" rule can be checked in one go.
  - **An option needs text or a picture.** Its reason is always required. Two picture-only options aren't called "the same".
  - **Storage:** `<institute>/question-images/<id>.<ext>`, with a row per picture. The question keeps the id, the storage path and the type, so showing a list needs no extra lookups. The admin gets a one-hour signed link for each picture, never the storage path.
  - **Clean-up:** replacing or removing a picture, or deleting the question, deletes the file and its row. If the form is cancelled, the browser asks the server to discard the pictures it had uploaded. A picture that was uploaded but never attached expires from the database after 24 hours.
- **Pictures in the Excel upload (step Q4, added the same day):** the template gets five optional columns, Question image and Image A to D, each holding a picture's file name. The admin first chooses all the pictures at once (a picture step on the upload card); each goes straight to storage like a single picture in Q3, and the server remembers its file name. When the Excel file is read, each name is matched (ignoring capitals, spaces and folders) to the newest picture with that name that is uploaded, checked and not yet on a question, in this institute only.
  - **Why this and not a ZIP or pictures pasted into cells:** a ZIP would hit the API's 6 MB request limit and needs a zip reader; pictures pasted into cells float, resize and lose their names. Choosing pictures first reuses the Q3 upload path and has no size ceiling beyond 1 MB each.
  - **The preview checks pictures too:** a name that wasn't uploaded, and a picture named on two questions in the file (a picture can be on one question only), are problems in their own column. A question that is already in the bank is skipped before pictures are looked at, so uploading a file twice still does no harm.
  - **Clean-up:** after a confirmed import the browser discards the pictures it staged that weren't used. Pictures that were used are on their questions. If the browser is closed first, unused pictures stay in storage until the database row expires after 24 hours, and then can no longer be named.
- **Finding questions with pictures (step Q5):** a question "has pictures" when it has a picture on the question or on any option. This is read from the pictures actually attached, never from a column the admin fills in, so it can't disagree with reality and covers both ways of adding a question. The list has a Pictures filter (`?pictures=yes` or `no`) and each such question shows a tag. We turned down a manual "has picture" column in the template because it could be wrong, for example if the admin forgets it or a picture fails to upload. A "picture needed" flag for pictures still to come was offered and not chosen.
- **Fill-in questions (step Q6):** a question has a `kind`, `mcq` (the default, so every earlier question stays as it was) or `fill_in`. A fill-in question has no options and no correct option; it has an `answer` and an `explanation` (one text, not a reason per option).
  - **Text answers:** one or more accepted spellings (up to 10, each up to 200 characters). A student's answer matches when it equals one of them after ignoring capitals and squeezing extra spaces. Spaces inside an answer aren't removed, so `new delhi` isn't `newdelhi`. In the form and the sheet the accepted answers are typed in one box separated by `|`.
  - **Number answers:** a value and an optional tolerance. Both are stored as text, because the database can't hold floating-point numbers, and compared as exact decimals, so 0.30 equals 0.3 and there are no 0.1 + 0.2 surprises. A student may type commas in thousands (1,000). `NaN`, infinities and absurdly large numbers are refused, for the admin and for the student.
  - **One box only.** Several blanks inside a sentence were left for later. A question picture is allowed; option pictures aren't (there are no options), and the server says so.
  - **Switching type** on an existing question works: a fill-in question changed to multiple choice must be given four options and loses its answer and explanation; the other way round loses its options.
  - **Marking is built before the student screen.** `app/answers.py` holds the rules that say whether a typed answer, or a chosen option, is right. They are tested on their own so the student side can rely on them.
  - **Excel:** optional columns Type, Answer, Answer type, Tolerance and Explanation after the picture columns, so older files still work. Option cells on a fill-in row are ignored. A wrong Type reports only itself, not every other column.
- **Bulk publish (step Q7):** one call, `POST /api/admin/questions/status` with the ids and the status, instead of one edit per question. It changes only the status (and who and when), never the rest of the question, so it can't fail on an old question that no longer passes today's checks. Each id is handled on its own: unknown ids and questions already in that status are counted, not errors, so a retry or a stale list does no harm. Up to 500 per call, like the Excel limit. It works both ways (publish and back to draft). The list's ticks apply to what is shown and are cleared when the list reloads. Trade-off: the ids are updated one by one, not in one database transaction, so a failure part-way leaves some changed; running it again finishes the job.
- **Bulk delete (step Q8):** `POST /api/admin/questions/delete` with the ids and `confirm: "DELETE"`. Deleting is permanent, so the typed word is checked twice: the screen keeps the button off until the word matches exactly (capitals and spaces matter), and the server refuses any call without it, so a script or a bug can't wipe questions by accident. It reuses the single-question delete, so pictures are removed from storage and their rows too. Unknown ids are counted, not errors. A POST is used rather than a DELETE with a body, because some proxies drop bodies on DELETE. Same trade-off as bulk publish: one by one, not one transaction, so a failure part-way is finished by running it again. There is no undo and no trash; a "recently deleted" bin was not asked for.
- **Reading passages (step Q9):** a passage is its own record (`PASSAGE#<id>`), and a question stores only the passage's id. The passage is written once, so five questions on one text don't carry five copies, and a typo is fixed in one place. In Excel the text goes on a separate **Passages** sheet and rows name it by **title**, because a 1,000-word passage repeated in every row is unreadable and easy to get out of step.
  - **Titles are unique** within an institute (capitals and spacing ignored), since the title is how the file refers to a passage.
  - **Import rules:** a title on the sheet only creates a new passage when the first question using it is saved (so an unused or bad row creates nothing); a title in the bank only is reused; a title in both with the same text is reused; with different text the row is refused and nothing is overwritten. A title missing from both is a problem on the Passage column. A title repeated on the sheet is refused when used.
  - **Delete is refused while questions use the passage** (409 with the count), so no question is left pointing at nothing. Deleting a passage's last question leaves the passage for reuse. The question's passage is checked to exist when saved; removing it is done by sending an empty passage.
  - **Limits:** 5,000 characters of text (paragraph breaks kept), 150 for the title, 100 passages per Excel file. The Passage column has a dropdown from the Passages sheet that only warns, so a title that is already in the bank can still be typed.
  - **Left out:** pictures inside a passage, several passages on one question, ordering questions within a passage (the list keeps them together, newest first), and anything on the student side.
- **Subjects on a course (step Q10):** a course stores `papers`, a list of ids from the fixed subject list. The ids are kept once each in the list's own order, and unknown ids are refused. The data is for the student side later (what a course's student will practise); the question bank is unchanged and questions are still tagged by subject only, not by course.
  - **Why six new subjects:** the 37 subjects are CUET subjects, and only English and General Aptitude loosely fit IPMAT, CAT and CLAT. Without Data Interpretation, Legal Reasoning and CAT-style verbal topics, those courses would have almost nothing to map. English's CUET topics and the new Verbal Ability subject overlap in name; we kept them apart because CAT-style verbal (para jumbles, summary, odd sentence out) is a different test from CUET language comprehension.
  - **Suggested, not forced:** the usual subjects for a course are found by a whole word in its name (so "CAT 2027" matches CAT but "Category" doesn't): CUET gets the 37 CUET subjects; IPMAT gets Quantitative Ability, Verbal Ability and Reading Comprehension, Logical Reasoning; CAT gets Verbal Ability and Reading Comprehension, Data Interpretation, Logical Reasoning, Quantitative Ability; CLAT gets Verbal Ability and Reading Comprehension, Current Affairs and GK, Legal Reasoning, Logical Reasoning, Quantitative Ability. These come from the usual published sections and may change each year, so they are a starting point the admin edits. The form asks the server for the suggestion when the name is typed and fills the ticks only if none are ticked yet.
  - **Existing courses** had no subjects; the real AaptPrep CAT, CLAT and IPMAT courses on dev were filled with the suggestions once, by a one-off script. A course with no subjects shows "No subjects yet". Subjects are optional.
  - **No course delete:** there is still no way to delete a course in the app (only hide), so a test course can only be removed straight from the table.
- **Fee hidden, not removed (step Q11):** the Courses page and the registration dropdown no longer show a fee, because fees only matter once payments exist (Phase 2). The `fee` field is kept in the database and the API, now optional and 0 by default, so existing courses keep what they had and nothing has to be migrated when payments return. Revisit when payments are built: bring back a fee box on the course form and the price in the registration dropdown.
- **"Papers" are called "Subjects" (step Q12):** the admin sees the word Subject everywhere (screens, messages, the Excel template). The code, the API and the stored data keep the older internal names (`paper`, `papers`, `/api/admin/papers`) on purpose: renaming them would touch stored questions and courses for no benefit to the user. An Excel file made from the older template, with the column called Paper, still uploads, because the reader treats the old heading as Subject. The template's list sheet is now called "Subjects and topics".
- **The UX formula (step U1, applies to every role):** pages are sleek and concise. One-line header (title on the left, the main action on the right). Icon plus a short word for main actions, icon-only (with a tooltip and hidden text for screen readers) for repeated row actions. Status as a dot with one word. Empty states as an icon and one line. Explanations behind an ⓘ tip, not in paragraphs. Hide columns on phones before letting a table scroll sideways. Icons are inline SVG paths in `ui/icon.ts` (no library, no download, works offline); the same kit is meant for the platform admin and student screens later. Restyling never changes behaviour or the API. Trade-off: icon-only buttons are quicker to scan but need a first look to learn, so each has a tooltip.
- **Passages by pasted text (step Q13, replaces how Q9 is used):** the admin does not manage passages. The question form has a Passage box and the Excel file has a Passage column, both holding the text, repeated on each related question. Behind the scenes the passage record from Q9 is kept: the server finds a saved passage with the same text (capitals and spacing ignored) or creates one with an automatic title (the first words, made unique), and the question points to it. This keeps grouping reliable (by id, not by comparing text each time), lets the group header fix a typo for every question at once, and keeps the same shape the student side will need. A passage that no question uses any more is removed whenever a question is deleted or moved, so nothing invisible piles up. Editing the passage text inside one question moves only that question to the group for the new text; the header edit changes the whole group. Trade-off: text that differs even slightly makes a separate group, and two groups can end up with identical text if one is edited to match the other. Older Excel files that name a passage by title (with a Passages sheet) still import. The Passages tab, the passage dropdown and the "Passages" Excel sheet were removed.
- **Bulk upload (step Q14):** the browser does the work, the server is unchanged. The browser opens the zip (JSZip, loaded only when needed), sends each picture straight to storage with the existing three-step picture flow (four at a time), and calls the existing preview and import for each Excel file in turn. This avoids sending large files through the API (Lambda's request limit is a few MB) and needs no new endpoints. Files are imported one after another; each import re-reads the bank, so a question already saved by an earlier file is skipped as a duplicate, which also makes uploading the same files twice harmless. A picture can be on one question only, so a file that reuses a picture another file already took gets that row reported. Trade-offs: a closed browser stops the run (re-run it; duplicates are skipped), and pictures uploaded but unused are discarded after the import, with the same 24-hour expiry as before if the browser closes first. The preview's "new passages" is a sum of the per-file counts. Limits are checked in the browser: 30 Excel files, 1000 pictures, a zip up to 250 MB.
- **Tests built from the bank (step T1):** a test is its own record (`TEST#<id>`) holding its settings, the courses it is assigned to and a **fixed list of question ids**. Automatic mode picks at random when the admin clicks Pick (and again on Pick again) and saves the result, so every student gets the same questions and results can be compared; the rules are kept only so the admin can re-roll. Picking per student at attempt time was not chosen because it makes scores incomparable and is much heavier. The test **points at the live questions** (not copies): fixing a typo shows in the test, and a question used by a published test can't be deleted (the message names the test), while deleting a question quietly removes it from draft tests. Copies would protect past results from edits but are heavier; revisit when attempts are stored. Only published questions can be added, and a passage's published questions always travel together, on the server as well as in the screen, so the total can exceed what a rule asked for. Marks are kept as text with up to 2 decimals (the database can't hold floats); the wrong-answer mark must be 0 or negative, so a student can't gain from a wrong answer and nobody has to guess the sign. Start and end are stored as India time without a zone (`2027-01-31T23:59`), because the platform's calendar is India's; both are optional. A test is assigned to one or more **courses** (the "groups" of the request), using the courses from step Q10. The pass percentage is a whole number from 0 to 100. Not built yet: a student attempting a test, the clock, scoring and results, the "see correct answers" rule in action, shuffling, sections, per-question marks, and counting attempts against the limit.
- **No limit on bulk publish (step Q15):** the server no longer caps how many ids a bulk status change takes, but a request has only 15 seconds, and a measured live call took about 12 milliseconds per question even with 16 changes in flight (600 in 7.5 s). So the screen sends the ids in groups of 200 (bulk delete: 100, about 29 ms each) and adds the answers up, with progress and an honest message if a group fails. Because publishing is idempotent, running it again finishes the job. A direct API call with thousands of ids can still run into the 15-second limit; raising the Lambda timeout would cure that and was not done. The server reads the whole bank once instead of one read per question.
- **Students take tests (step S1):** an attempt is stored with the student (`MEMBER#<email>` / `ATTEMPT#<test>#<number>`), so a student can only ever reach their own, and carries a second key (`ATTEMPTS#<test>`) so the admin can list everyone's attempts at a test later. **The attempt freezes the test when it starts**: the question ids in order, the marks, the pass mark, the duration, whether answers are shown, and a fixed deadline. Later edits to the test change nothing for an attempt in progress; the questions' wording is read live, so a typo fix shows. **The server owns the clock.** The deadline is stored; the screen only shows a countdown and re-syncs from each save. A save within 3 seconds after the deadline still counts (slow networks); after that the attempt is submitted for the student with what was saved. An attempt left open is submitted the next time anything touches it (the list, a read, a save, a start), so no background job is needed. A started attempt counts toward the limit, and the same attempt is resumed rather than a new one started. The window (start and end, India time) only controls when an attempt may begin; once begun it runs for its full duration even if the window closes. **Nothing secret is sent early**: during the test a question has its text, option text, pictures and passage only; the correct answer, the reasons and the explanations are added only to a finished attempt, and only when the test's "show answers" is on. Scoring uses exact decimals; the percentage never goes below 0 even if negative marking takes the total below zero (the marks themselves can be negative); pass means the percentage reaches the pass mark. A student sees a test only while it is published and they have access to one of its courses, and otherwise gets 'not found'. Saves go one question at a time with a short pause for typing and a retry for failures, so a bad connection never loses an answer the student can still see on screen. Marking for review lives only on the screen and is lost on refresh. Not built: the admin's results view, shuffling, pausing, a leaderboard, certificates, emails.
- **Why Excel and not CSV:** Excel opens a CSV with the wrong encoding, which garbles Hindi and other scripts, commas and line breaks in question text break CSV, and an `.xlsx` template can have dropdowns. CSV can be added later without changing anything else.
- **Rules:** question up to 2,000 characters, option up to 500, reason up to 1,000. The four options must differ. All mistakes are returned together, field by field, like the registration form.
- **Storage:** one row per question under the institute's own key prefix (`T#<institute>#QUESTION#<id>`), listed newest first through the existing index. The admin's list is filtered in the code, which is fine for thousands of questions.
- **Who:** institute admins only. A student, or another institute's admin, gets 403 or "not found".
- **Delete is real** for questions (they hold no one's personal data). Each edit records who and when.

### 27.2 Trade-offs

- **The topic split is mine,** not the board's syllabus. A topic can be renamed later, but questions keep the old name, so a rename would need a small script.
- **The dropdowns in the template depend on Excel's own features.** The server checks everything anyway, so a spreadsheet program that ignores the dropdowns still can't get a bad row in.
- **Import is not all-or-nothing.** The good rows are saved and the bad ones are reported. This is on purpose: the admin fixes only the bad rows and uploads again.
- **Filtering happens in memory.** Fine for now. A bank with tens of thousands of questions would need an index per subject.
- **A picture left behind** if the browser closes mid-form or mid-upload (no cancel call): the database row expires after 24 hours but the file stays in storage. It is small and private. A clean-up script can find files with no row if it ever matters.
- **No pictures in the Excel upload yet, no pictures in reasons, no formulas, no AI help.**

### 27.3 Revisit when

- Mock tests are built (they will read published questions, and may need an index by subject and topic).
- An institute asks for its own subjects or topics, or for images and formulas in questions.

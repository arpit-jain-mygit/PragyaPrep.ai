# PragyaPrep: Design Choices

Each entry records what we chose, what we turned down, and what it costs us. Parts marked **Proposed** come from the multi-tenancy, email login and registration changes (sections 17 to 19) and are awaiting review. No code has been changed for them yet. Where the owner has confirmed a decision, it says so. Dates are when the decision was made. Cost figures are approximate list prices for `ap-south-1` and should be rechecked in the AWS Pricing Calculator.

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
17. [Multi-tenancy (proposed)](#17-multi-tenancy-proposed)
18. [Registration approval and email OTP login (proposed)](#18-registration-approval-and-email-otp-login-proposed)
19. [Registration, payment review and course access (proposed)](#19-registration-payment-review-and-course-access-proposed)

---

## 1. Product name

**Chosen:** PragyaPrep.ai ("Pragya" means wisdom, "Prep" is preparation).

**Alternatives considered:** Margdarshi AI (guide), Lakshya AI (goal), AaptMind and AaptTayari AI (keep the Aapt root), Abhyas AI (practice), Siddhi Prep (mastery), Saadhak AI (seeker).

**Why:** It says "preparation" directly, as asked, and the AI side stays in the name. It is short and easy to say.

**Trade-offs:** The root "Pragya" is common in Indian education, and similar names exist (for example, a JEE batch called Pragyaan). It also gives up the brand equity of "Aapt".

**To confirm before launch:** domain availability (`pragyaprep.ai`, `.com`, `.in`) and a class 41 trademark search on the IP India database.

---

## 2. Phase 1 scope

**Chosen:** Video and PDF content for many institutes (multi-tenant), with registration, admin approval, login by emailed code, and manual payment review. Roles are platform admin, tenant admin and student.

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

**Proposed change:** login ID, email and Google account are unique within a tenant, not globally. A person at two tenants has two accounts, and a sign-in always happens for one tenant (section 17).

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
- Uniqueness (today: login ID, email, Google account and course title; under the proposed design: email and course title within a tenant) is enforced with separate lookup items, claimed one at a time with conditional writes, with undo if one clashes. DynamoDB transactions would be atomic, but the moto test library mishandled them, so they were not used. A crash between steps could leave a stray lookup item.
- Course lists are not paginated yet. Fine for a small catalogue.
- Reporting or analytics will need exports or a second store.

---

## 10. File upload and delivery

**Chosen:**
- **Upload:** the admin's browser posts the file straight to S3 using a signed form. The backend then confirms the upload, checks the first bytes, and marks the item `ready`.
- **Download:** students receive a signed S3 link that works for 5 minutes for one file. S3 serves byte ranges, so video seeking works.
- Pending uploads are hidden from students.
- The S3 client uses the regional endpoint, so signed links point at the right host.
- **Proposed:** file keys move under `tenants/<tenant>/content/...`, and payment screenshots under `tenants/<tenant>/payments/...`, so each tenant's files are separate.

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

**Proposed change:** the email OTP login (section 18) removes the Google client secret and the admin password. What remains is the session signing key. Amazon SES needs no stored secret, because the Lambda's IAM role sends the email.

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

**Chosen:** Pytest with `moto` to fake DynamoDB and S3 locally. 24 tests cover sign-up, login, password change, admin rules, grants, uploads and file checks. A live smoke test against dev covered the real S3 behaviour. **Proposed:** most of these tests will be rewritten for tenant isolation, emailed codes, registration and payment review.

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
| Email (proposed, Amazon SES) | about $0.10 per 1,000 emails |
| Domain (when bought) | $10 to $60 per year, plus about $0.50 a month for DNS |

Video downloads are the main driver. For example, 500 GB of downloads a month is roughly $40 to $45 without CloudFront.

---

## 15. Known limits and when to revisit

| Limit | Revisit when |
|---|---|
| Email on sign-up is unverified (current build; the proposed email OTP login in section 18 verifies it) | Before building the new login, or before relying on email for recovery |
| No login rate limiting (current build; the proposed login design includes limits) | Before public launch |
| 1 to 2 s cold start | Students complain, or traffic is steady (use provisioned concurrency or always-on compute) |
| Files can be shared for 5 minutes | Piracy becomes a concern (CloudFront signed cookies, watermarking, DRM) |
| S3 direct delivery cost | Monthly downloads pass about 100 GB (add CloudFront) |
| No delete-course or delete-user routes | Admin needs cleanup (four smoke-test courses remain in dev) |
| Single account, shared with another project | Before prod (use `new-account.sh`, see section 16) |
| `AdministratorAccess` for the CLI user | Setup settles (narrow the permissions) |
| Backend and infra have no CI | Before a second contributor joins |
| Prod environment does not exist yet | After the frontend is built |
| **Proposed:** tenant isolation relies on our code, not on separate databases | Always: keep the isolation tests, and revisit if a tenant needs a contractual guarantee |
| **Proposed:** one busy tenant can use capacity others need | A tenant's traffic or storage is large enough to notice, so move it to its own stack |
| **Proposed:** tenants are created by a script, with no self-service | More than a handful of tenants |
| **Proposed:** tenants are found by a slug in the frontend config | A domain exists: add subdomains, a wildcard certificate and custom domains |
| **Proposed:** login depends on email delivery. A bounced or spam-filtered code locks a student out | Before launch: move email sending to a verified domain and watch bounce rates |
| **Proposed:** the login page reveals whether an email is registered (kept on purpose for a better experience) | Probing or complaints appear: show status only after the email is proven |
| **Proposed:** no password fallback if a student loses access to their mailbox | An admin changes the registered email, which needs an admin tool |
| **Proposed:** payments are checked by eye from screenshots, so fake or edited screenshots can pass | Admins start missing fakes, or volume grows: add duplicate-reference checks, bank-statement matching, or an online payment gateway |
| **Proposed:** the registration form stores personal data, including students under 18 | Before launch: confirm consent, retention and deletion rules with a legal check |
| **Proposed:** one admin per tenant, so a lost mailbox blocks admin work | A tenant asks for more staff: add more admins and an admin tool to change an email |

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

## 17. Multi-tenancy (proposed)

**Status:** Proposed, awaiting review. The code has not been changed yet. The first tenant is `aaptprep`.

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

**Chosen (proposed):** A tenant slug sent by the frontend with every request (a header), taken from the frontend's configuration. Once a domain exists, tenants are found from the hostname instead (`aaptprep.pragyaprep.ai`, and later `aaptprep.com`).

**Alternatives considered:** a path prefix (`/t/aaptprep/...`), a query parameter, or subdomains only.

**Why:** There is no domain yet, so a header works now. It also keeps working behind subdomains later.

**Trade-offs:**
- A header is easy for a client to change, so the server never trusts it alone. The login token carries the tenant, and the request is refused if the two differ.
- Subdomains and custom domains need a wildcard certificate, a tenant-to-domain map and DNS work, which come with the domain.
- The login page sends the tenant with the email, and each emailed code is tied to that tenant.

### 17.3 Accounts across tenants

> **Updated by section 18:** a person's identity is their registered email, unique within a tenant. There are no login IDs.

**Chosen (proposed):** Separate accounts per tenant. The email is unique within a tenant. The same person at two tenants has two accounts.

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

**Chosen (proposed):**
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

**Chosen (proposed):** A login token carries the tenant. A request is refused when the token's tenant doesn't match the tenant of the request.

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

## 18. Registration approval and email OTP login (proposed)

**Status:** The login itself is **built and deployed to dev (step M2)**; registration and approval (section 19) are not built yet. This replaces the ID + password and Google sign-in decisions in section 3.

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
- **Sessions:** with no passwords, a long session (proposed: 7 days) saves students from asking for codes all the time, but a stolen session lasts as long.

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

## 19. Registration, payment review and course access (proposed)

**Status:** Registration and the admin's review are **built and deployed to dev (step M3)**. Payments and access (19.4 and 19.10) are not built yet. It extends section 18 and brings the manual payment flow, deferred earlier, into Phase 1.

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
- A registration asks for one course. Another course later is a new request with its own payment (proposed).

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

**Chosen (proposed design):** Each course carries an access setting that the tenant admin controls: no expiry, a number of days counted from the day the payment is verified, or until a fixed date. When a payment is verified, the grant records its own end date, and that date is checked every time a course or file is opened.

**Alternatives considered:**
- One fixed length for the whole tenant (simple, but a one-month crash course and a one-year course can't differ).
- An expiry chosen by the admin for each student at verification (most flexible, but slow and easy to get wrong).
- No expiry at all (simplest, but students keep access forever).

**Why:** Courses differ in length, and a per-course setting lets the admin choose once and forget.

**Trade-offs:**
- Changing a course's setting later does **not** change access already granted, because each grant keeps its own end date. An admin can still extend or end a single student's access by hand.
- Expiry is checked when something is opened, not by a background job, so nothing runs overnight. An expired student simply stops seeing the course. Signed file links already issued still work until they expire in 5 minutes.
- A student whose access ends can pay again to renew. A reminder email before expiry is useful, but is not part of Phase 1.
- Dates and times use one clock (UTC), so a "fixed date" means the end of that day in a set time zone. The tenant's time zone needs to be chosen (proposed: India Standard Time).

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


# PragyaPrep: Design Choices

Each entry records what we chose, what we turned down, and what it costs us. Dates are when the decision was made. Cost figures are approximate list prices for `ap-south-1` and should be rechecked in the AWS Pricing Calculator.

## Contents

1. [Product name](#1-product-name)
2. [Phase 1 scope](#2-phase-1-scope)
3. [Accounts and sign-in](#3-accounts-and-sign-in)
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

---

## 1. Product name

**Chosen:** PragyaPrep.ai ("Pragya" means wisdom, "Prep" is preparation).

**Alternatives considered:** Margdarshi AI (guide), Lakshya AI (goal), AaptMind and AaptTayari AI (keep the Aapt root), Abhyas AI (practice), Siddhi Prep (mastery), Saadhak AI (seeker).

**Why:** It says "preparation" directly, as asked, and the AI side stays in the name. It is short and easy to say.

**Trade-offs:** The root "Pragya" is common in Indian education, and similar names exist (for example, a JEE batch called Pragyaan). It also gives up the brand equity of "Aapt".

**To confirm before launch:** domain availability (`pragyaprep.ai`, `.com`, `.in`) and a class 41 trademark search on the IP India database.

---

## 2. Phase 1 scope

**Chosen:** Admin and Student only, with video and PDF content first.

**Deferred:** mock tests and exams, enrolment with QR-payment approval, AI features, Parent and Mentor roles, migration from the existing platform.

**Why:** Content delivery is the part every other feature builds on, and it is the riskiest to get right (access control, large files). The rest can be added without reworking it.

**Trade-offs:** Phase 1 has no payments or enrolment flow, so admins grant course access by hand using the student's ID.

---

## 3. Accounts and sign-in

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

**Alternatives considered:**
- RDS PostgreSQL (always-on, about $15 to $18 a month).
- Aurora Serverless v2 with pause (cheaper idle, but a database resume of around 15 seconds and a higher cost when running).
- Several DynamoDB tables instead of one.

**Why:** Pay-per-request with no idle cost, and no database server to manage. Fits the cost goal.

**Trade-offs:**
- No joins or ad hoc queries. Every new feature needs its access patterns designed first.
- Uniqueness (login ID, email, Google account, course title) is enforced with separate lookup items, claimed one at a time with conditional writes, with undo if one clashes. DynamoDB transactions would be atomic, but the moto test library mishandled them, so they were not used. A crash between steps could leave a stray lookup item.
- Course lists are not paginated yet. Fine for a small catalogue.
- Reporting or analytics will need exports or a second store.

---

## 10. File upload and delivery

**Chosen:**
- **Upload:** the admin's browser posts the file straight to S3 using a signed form. The backend then confirms the upload, checks the first bytes, and marks the item `ready`.
- **Download:** students receive a signed S3 link that works for 5 minutes for one file. S3 serves byte ranges, so video seeking works.
- Pending uploads are hidden from students.
- The S3 client uses the regional endpoint, so signed links point at the right host.

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

**Chosen:** Pytest with `moto` to fake DynamoDB and S3 locally. 24 tests cover sign-up, login, password change, admin rules, grants, uploads and file checks. A live smoke test against dev covered the real S3 behaviour.

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
| Domain (when bought) | $10 to $60 per year, plus about $0.50 a month for DNS |

Video downloads are the main driver. For example, 500 GB of downloads a month is roughly $40 to $45 without CloudFront.

---

## 15. Known limits and when to revisit

| Limit | Revisit when |
|---|---|
| Email on sign-up is unverified | Before relying on email for recovery |
| No login rate limiting | Before public launch |
| 1 to 2 s cold start | Students complain, or traffic is steady (use provisioned concurrency or always-on compute) |
| Files can be shared for 5 minutes | Piracy becomes a concern (CloudFront signed cookies, watermarking, DRM) |
| S3 direct delivery cost | Monthly downloads pass about 100 GB (add CloudFront) |
| No delete-course or delete-user routes | Admin needs cleanup (four smoke-test courses remain in dev) |
| Single account, shared with another project | Before prod (separate accounts per environment) |
| `AdministratorAccess` for the CLI user | Setup settles (narrow the permissions) |
| Backend and infra have no CI | Before a second contributor joins |
| Prod environment does not exist yet | After the frontend is built |

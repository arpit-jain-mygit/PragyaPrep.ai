# Phase 1: Build status

How we work: one step at a time. I build it, test it myself (automated tests, then a live test on the dev environment where it applies), update this file, and only then ask you to test.

**Scope:** see [features.md](features.md). **Reasons for choices:** see [design-choice.md](design-choice.md).

## Status legend
| Status | Meaning |
|---|---|
| Not started | Nothing done |
| In progress | Being built now |
| Built | Code written, not fully tested |
| Tested locally | Automated tests pass on my machine |
| Deployed to dev | Running in the dev AWS environment |
| Tested live | I tested it against the live dev environment |
| Ready for you | I'm happy with it, and I'm asking you to test |
| Accepted | You tested it and are happy |

## Steps
| # | Step | Status | Evidence |
|---|---|---|---|
| M1 | **Tenant foundation:** tenants, tenant-prefixed data, tenant lookup from a header, create-tenant script, isolation tests | **Tested live** | 62 automated tests; tenant lookup checked on the live dev API |
| M2 | **Email OTP login and roles:** emailed 6-digit codes, status messages, rate limits, sessions per tenant, Amazon SES | **Tested live** | 130 automated tests pass (65 of them new for M2). On the live dev API, a real code reached Ritesh's inbox and signing in with it worked |
| M3 | **Course list, registration and admin review:** each institute's courses (fee and access length), the registration form with checks, the admin's queue to approve, reject, suspend and reactivate, and the emails | **Tested live** | 263 automated tests pass (133 of them new for M3). On the live dev API I registered a test student, approved, suspended and reactivated them, and removed them again. CLAT, IPMAT and CAT are loaded into aaptprep |
| M4 | **Content and access:** PDF and MP4 upload into a course, and access for a student that ends when the course's access length runs out (the course list itself was built in M3) | Not started | |
| M5 | **Payments:** QR code, screenshot upload, admin verify or reject, access granted on verify | Not started | |
| M6 | **Deploy to dev and test end to end through the API:** includes creating the aaptprep tenant | Not started | |
| M7 | **Frontend: login, register, status pages** | Not started | |
| M8 | **Frontend: student** (courses, video and PDF viewers, payment upload) | Not started | |
| M9 | **Frontend: tenant admin** (registrations, payments, courses, uploads, settings) | Not started | |
| M10 | **Frontend hosting** (S3 and CloudFront) and allowed origins | Not started | |
| M11 | **Production and operations:** prod environment, alarms, backups, deploy automation | Not started | |

## How you can test each step
After I finish a step, I'll tell you how to test it, and I keep the instructions here.

### Option 1: on your own computer (the local sandbox)
This runs the whole API on your computer with a fake, in-memory AWS. It costs nothing, sends no real email, and resets when you stop it. It is the same code that runs in AWS. **Login codes are printed in the terminal window, where an email would normally arrive.**

```bash
cd backend
PYTHONPATH=. .venv/bin/python scripts/dev_server.py
```

Open <http://localhost:8000/docs>. Press `Ctrl+C` in the terminal to stop it.

> **If you started the sandbox earlier, stop it (Ctrl+C) and start it again.** A running sandbox keeps the old code and won't show new steps. If port 8000 is busy, use `PORT=8001 PYTHONPATH=. .venv/bin/python scripts/dev_server.py`.

The sandbox starts with these, so there is something to try straight away:

| `X-Tenant` value | What it is |
|---|---|
| `demo` | A normal, active institute. Its admin is `demo-admin@example.com`. It has the courses CLAT, IPMAT and CAT |
| `closed` | An institute that has been suspended |
| `platform` | The platform's own institute. Its admin is `owner@example.com` |

| Demo people at `demo` | Status |
|---|---|
| `student@example.com` | approved |
| `pending@example.com` and `pending2@example.com` | pending (they are waiting in the admin's queue) |
| `rejected@example.com` | rejected |
| `suspended@example.com` | suspended |

### Option 2: live in AWS (dev)
The API address is `https://byk6esj2muxebponlkbnsark540cqwpn.lambda-url.ap-south-1.on.aws`. Open `/docs` on that address for the same interactive page. The institutes here are the real ones: `aaptprep` (admin Ritesh, `sachin.arpit.learning@gmail.com`) and `platform` (Arpit, `sachin.arpit@gmail.com`). Codes arrive by real email.

### Run the automated tests
```bash
cd backend
PYTHONPATH=. .venv/bin/python -m pytest -q
```
You should see `263 passed`.

### M1 (tenant foundation): what to try
Open **GET /api/tenant**, click **Try it out**, type a value into `X-Tenant`, and click **Execute**.

| Type this in `X-Tenant` | You should get |
|---|---|
| `demo` (sandbox) or `aaptprep` (live) | **200**, with the institute's name and colour |
| `DEMO` or ` demo ` (capitals or spaces) | **200**, the same institute |
| `platform` | **200**, "PragyaPrep Platform" |
| `closed` (sandbox only) | **403**, "This institute isn't active right now. Please contact the institute." |
| `nobody` | **404**, "We couldn't find that institute." |
| `a#b` or `9abc` | **400**, "That institute name isn't valid." |
| _(leave it empty)_ | **400**, "Missing X-Tenant header." |

### M2 (email login): what to try
In the sandbox, set `X-Tenant` to `demo` in each call.

**Part A: the messages for each kind of person.** Open **POST /api/auth/request-code**, click **Try it out**, put an email in the body, and **Execute**:

| Email | You should see |
|---|---|
| `nobody@example.com` | `not_registered`: "This email isn't registered with Demo Institute. Register first." |
| `pending@example.com` | `pending`: "Your registration is waiting for approval. We'll email you once it's approved." |
| `rejected@example.com` | `rejected`: "Your registration wasn't approved. Contact Demo Institute." |
| `suspended@example.com` | `suspended`: "Your access is paused. Contact Demo Institute." |
| `student@example.com` | `code_sent`: "We've emailed you a 6-digit code." A code appears **in the terminal window** |
| `nope` | **422**, "Enter a valid email address." |

**Part B: signing in.**
1. Ask for a code for `student@example.com`, and read the 6-digit code in the terminal.
2. Open **POST /api/auth/verify-code**, enter that email and the code. You should get a **session** with a long `access_token`. Copy the token.
3. Click the green **Authorize** button at the top of the page, paste the token, and confirm.
4. Open **GET /api/auth/me** and **Execute**. It should show Asha Demo, role `student`.

**Part C: things that should be refused.**
- Use the **same code again**: **400**, "That code isn't right, or it has expired. Ask for a new one."
- Enter a **wrong code** five times, then the right one: **400**, "Too many wrong tries. Ask for a new code."
- Ask for a code twice within 30 seconds: **429**, "Please wait N seconds before asking for another code."
- Ask for a code **6 times in an hour** for one email: **429**, "Too many codes asked for this email."
- Call **GET /api/auth/me** with `X-Tenant` set to `platform` while using the `demo` token: **401**, "This session is for a different institute. Sign in again."

**Part D: live in AWS.** The sender is verified, so codes arrive by real email. On the live `/docs` page, set `X-Tenant` to `aaptprep`, ask for a code for `sachin.arpit.learning@gmail.com` (Ritesh), read it from that inbox, and sign in. Or use `platform` with `sachin.arpit@gmail.com` (Arpit). **If the code doesn't arrive, check your Spam folder.** The sender is a Gmail address, which can land in spam until we have a domain. A code works for 10 minutes.

### M3 (courses, registration and admin review): what to try
Use the sandbox, with `X-Tenant` set to `demo` in every call. The live version is at the end.

**Part A: the dropdown.** Open **GET /api/courses** and Execute. You should see CAT, CLAT and IPMAT, each with an id and a fee of 10000. Keep one id, you'll need it for the form.

**Part B: register.** Open **POST /api/register**, click **Try it out**, and use a body like this (replace the `course_id` with the id from Part A):

```json
{
  "email": "meera@example.com",
  "first_name": "Meera",
  "last_name": "Kapoor",
  "birth_date": "2004-08-21",
  "gender": "female",
  "mobile": "+91 98765 43210",
  "whatsapp_same_as_mobile": true,
  "address": "B-14, Sector 62",
  "city": "Noida",
  "pin_code": "201309",
  "course_id": "PASTE-THE-ID-HERE"
}
```

| Try this | You should see |
|---|---|
| The body above | **201**, "Thank you. Your registration is waiting for approval...". A **receipt email** is printed in the terminal |
| The same body again | **409**, "This email is already registered. Your registration is waiting for approval." |
| An empty body `{}` | **422**, with a message for **every** field at once |
| `"pin_code": "12"` and `"mobile": "555"` | **422**, with errors for just those two fields |
| `"birth_date": "2030-01-01"` | **422**, "Enter a valid birth date." (the age must be 10 to 80) |
| `"gender": "robot"` | **422**, "Choose a gender from the list." (male, female, other, prefer_not_to_say) |
| A made-up `course_id` | **422**, "Choose a course from the list." |
| `"email": "student@example.com"` | **409**, "This email is already registered. Log in with the code we'll email you." |
| `"email": "suspended@example.com"` | **409**, "Your access is paused. Contact Demo Institute." |
| `"email": "rejected@example.com"` | **201**, because a rejected student may register again |

After registering, try **POST /api/auth/request-code** with Meera's email. It should say `pending`, and no code is sent.

**Part C: review as the admin.**
1. Sign in as the demo admin: ask for a code for `demo-admin@example.com`, read it in the terminal, enter it in **verify-code**, copy the token, click **Authorize** and paste it.
2. Open **GET /api/admin/registrations** and Execute. You should see Meera first (newest), then the two demo pending students, each with all their details. Try `status` set to `approved`, `rejected`, `suspended` or `all`.
3. Open **POST /api/admin/registrations/{email}/approve** with Meera's email. You should get `email_sent: true`, and an **approval email** appears in the terminal.
4. Ask for a code for Meera. You should now get `code_sent`, and she can sign in.
5. **reject** a pending student with a reason such as `{"reason": "Mobile number does not match"}`. The email in the terminal includes the reason, and the student is told "Your registration wasn't approved" when they try to log in.
6. **suspend** Meera. Her session stops working (`GET /api/auth/me` gives 401), and her login now says "Your access is paused". **reactivate** brings her back.
7. Try moves that don't fit, such as approving someone already approved: **409**, "You can't approve a registration that is approved."
8. Sign in as `student@example.com` and try the admin queue: **403**.

**Part D: manage courses as the admin.**
- **POST /api/admin/courses** with `{"name": "CUET", "fee": 9000, "access": {"type": "days", "days": 180}}` adds a course. Access can be `{"type": "unlimited"}`, `{"type": "days", "days": 365}` or `{"type": "until_date", "until": "2027-06-30"}`.
- **PATCH /api/admin/courses/{id}** changes the name, fee or access, or hides it with `{"active": false}`. A hidden course disappears from the dropdown.
- **GET /api/admin/courses** shows every course, including hidden ones, with the access length.

**Part E: live in AWS.** The institute is `aaptprep` and the real admin is Ritesh (`sachin.arpit.learning@gmail.com`). The dropdown already has CLAT, IPMAT and CAT. You can register with any email address you can read (for example a Gmail address with a `+` in it, like `you+test1@gmail.com`), and the receipt arrives by real email. To review it, sign in as Ritesh with an emailed code, as in M2. Tell me afterwards if you want a test registration removed.

### What you can't test yet
Paying for a course and getting access (M5), and uploading content (M4).

## Real data to load into dev
You asked for real data in the dev table, in place of my old test rows. These are the details you gave me.

| Item | Value |
|---|---|
| Platform admin | Arpit Jain, `sachin.arpit@gmail.com` |
| Institute | short name `aaptprep`, display name **AaptPrep** |
| Institute admin | Ritesh, `sachin.arpit.learning@gmail.com` |
| Courses | CLAT, IPMAT, CAT |
| Course fee | 10000 for each, configurable by the institute admin |
| Access length | Unlimited for each, configurable by the institute admin |
| Email sender (Amazon SES) | `sachin.arpit@gmail.com` |

| Step | Status |
|---|---|
| Cleanup script for the 11 old test rows (lists first, deletes only with `--yes`, never touches institutes) | Tested locally (4 tests) |
| Delete the old test rows in `pragyaprep-dev` | **Done.** 11 rows deleted, and the S3 bucket had no stray files |
| Create the platform admin and the `aaptprep` institute in `pragyaprep-dev` | **Done.** I read the table back (below) |
| Add CLAT, IPMAT and CAT with fee 10000 and unlimited access | **Done in M3.** All three are in `aaptprep`, and the admin can change the fee and access length |
| Verify the email sender in Amazon SES | **Done.** `sachin.arpit@gmail.com` is verified. Recipients need no verification, because this AWS account already has SES production access |

**What is in `pragyaprep-dev` right now** (read back from AWS):

| Key | What it is |
|---|---|
| `TENANT#platform` | The platform's own institute, active |
| `T#platform#MEMBER#sachin.arpit@gmail.com` | Arpit Jain, **platform admin**, approved |
| `TENANT#aaptprep` | The **AaptPrep** institute, active |
| `T#aaptprep#MEMBER#sachin.arpit.learning@gmail.com` | Ritesh, **tenant admin** of aaptprep, approved |

Plus, since M3: the three courses of `aaptprep` (CLAT, IPMAT, CAT), each with a name lookup row. Ten real rows in total, as of the end of M3. Students, payments and access will appear in later steps.

## Things I'll need from you along the way
| When | What |
|---|---|
| Now | Nothing |
| Before launch | Request SES production access, a legal check on personal data (students under 18), and a domain |

## Latest test results
**All automated tests, run on my machine: 263 passed, 0 failed.**

| Area | Tests |
|---|---|
| Tenants: creating, validating, finding, suspending, platform admin, the script (including the new course commands) | 44 |
| Isolation between institutes | 20 |
| Old-data cleanup script | 4 |
| M2 Login codes | 31 |
| M2 Sessions and roles | 15 |
| M2 Rate limits | 11 |
| M2 Email sender | 7 |
| **M3** Courses: the public dropdown, admin add and change, hiding, renaming, unique names, access lengths, two institutes kept apart | 33 |
| **M3** Registration: every field's checks, all mistakes at once, mobile formats, age range, genders, PIN codes, courses, duplicates in each status, re-registering after a rejection, a limit of 10 forms an hour per connection, a failed receipt email | 65 |
| **M3** Review: the queue and its filters, approve, reject with a reason, suspend, reactivate, moves that aren't allowed, who can decide, emails, two institutes kept apart | 33 |

**One real bug the tests caught in M3:** a course's "days" setting came back as the text `"180"` instead of the number 180, because DynamoDB returns numbers in a special form and my converter missed values nested inside a record. Fixed and covered by tests.

**M3 in the sandbox, over real HTTP (19 steps):** the dropdown, a registration, "pending" at login, a duplicate refused, an empty form and a two-mistake form, the admin queue, a student refused at the admin queue, approve, the student signing in, reject with a reason, an impossible move refused, suspend and the session ending, reactivate, adding and hiding a course.

**M3 on the live dev API:**
- Loaded **CLAT, IPMAT and CAT** into `aaptprep` (fee 10000, unlimited access), and the live dropdown shows them.
- Registered a clearly named test student (`sachin.arpit+m3test@gmail.com`): 201 pending. A second try: 409. An empty form: 422. The test student's login said "pending".
- The admin queue listed the test student. Approve: the email went out. Approving again: 409. The student's login then said `code_sent`.
- Suspend: the student's login said "paused". Reactivate worked.
- The Lambda log shows no email failures.
- **I removed the test student afterwards.** The table now holds only real data.
- For the admin calls I used a session made with the dev signing key, because the real admin login was already proven live in M2.

**Not committed yet.**

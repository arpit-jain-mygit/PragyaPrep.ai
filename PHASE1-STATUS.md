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
M means backend (the API, data and email). F means frontend (screens in a browser). We changed the order so that you can click through each part in a browser as it is built, not only call the API.

| # | Step | Status | Evidence |
|---|---|---|---|
| M1 | **Tenant foundation:** tenants, tenant-prefixed data, tenant lookup from a header, create-tenant script, isolation tests | **Tested live** | 62 automated tests; tenant lookup checked on the live dev API |
| M2 | **Email OTP login and roles:** emailed 6-digit codes, status messages, rate limits, sessions per tenant, Amazon SES | **Tested live** | 130 automated tests pass (65 of them new for M2). On the live dev API, a real code reached Ritesh's inbox and signing in with it worked |
| M3 | **Course list, registration and admin review:** each institute's courses (fee and access length), the registration form with checks, the admin's queue to approve, reject, suspend and reactivate, and the emails | **Tested live** | 263 automated tests pass (133 of them new for M3). On the live dev API I registered a test student, approved, suspended and reactivated them, and removed them again. CLAT, IPMAT and CAT are loaded into aaptprep |
| F1 | **Frontend slice:** each institute's branding, the registration page, the login page (emailed code and status messages), the admin's review queue, the admin's course list, and a student home page | **Tested live** | 112 automated tests pass. I drove every screen in a real browser against the sandbox, then against the live dev API (registered a test student, approved it, and removed it). The browser found three problems that I fixed |
| P1 | **Platform admin page** (`/platform-admin`): the platform admin views, adds and edits institutes and their one admin (name, colour, active or suspended, admin name and email). No delete. The platform admin itself is still created only by script | **Tested live** | 59 backend and 25 frontend tests. Driven in a real browser against the sandbox. Deployed to dev: with a short-lived platform-admin token I created a test institute (welcome email sent), suspended it and recoloured it, saw the duplicate refused and DELETE answer 405, then removed its rows. `link-admin` run for aaptprep. No errors in the Lambda log. The page itself was not opened against dev |
| P2 | **Correct a student's details:** the admin edits any detail of a registration at any status, including the email (the record moves to the new email, the old email stops working, the new address is emailed). Only changed fields are sent, and a taken email is refused | **Tested live** | 22 backend and 11 frontend tests. Browser check in the sandbox. On dev: registered a test student, approved, a bad edit was refused with both errors at once, the email was changed, the old email then said "not registered", and the test row was removed. No Lambda errors |
| P3 | **Institute logos:** the platform admin adds, replaces and removes an institute's logo (PNG or JPG, up to 1 MB) on the Edit form. It shows next to the name at the top of every page, including login | **Tested live** | 30 backend and 10 frontend tests (419 and 200 in all). On dev with real S3: uploaded a real PNG from the platform page, saw it in the preview and in AaptPrep's top bar, then removed it. Back to no logo, no stray files, no Lambda errors |
| M4 | **Content and access (API):** the admin adds PDF and MP4 files to a course (straight to S3, then checked), gives an approved student access (renewable, ends by the course's access length), and takes it away. A student sees their courses and opens a file through a 5-minute link | **Tested live** | 42 new backend tests (389 in all). On dev with real S3: a real PDF and MP4 were accepted, a fake PDF was removed from S3, a student had no access before the grant and got a working link after, a byte-range download returned 206, and a revoke closed the link. Test rows and files removed. No Lambda errors. No screens yet (F2, F3) |
| M5 | **Payments (API):** QR code, screenshot upload, admin verify or reject, access granted on verify | **Moved to Phase 2** | Decided on 17 Nov 2026. Until then the admin gives access by hand (built in M4) |
| F2a | **Content screens (the screens for M4):** the admin's **Files** page for each course (upload with progress, delete), **Course access** on a student's details (give, renew, remove), and the student's **My courses** page (PDFs open in a new tab, videos play on the page) | **Tested live** | 34 new frontend tests (190 in all). Driven in a real browser against dev with real S3: uploaded a real PDF and MP4 from the page, gave a test student access from the registrations screen, then as that student played the video (it played and seeking worked). Test files and student removed. No Lambda errors |
| F2 | **Frontend: student payment page** (fee, QR code, screenshot upload) | **Moved to Phase 2** | Goes with M5. The course list and viewers are done in F2a |
| F3 | **Frontend: tenant admin payments** (payments queue, QR code and settings) | **Moved to Phase 2** | Goes with M5. Content upload and access are done in F2a |
| M6 | **Deploy to dev and test end to end:** the whole journey from registration to watching a video, through the API and the screens | **Tested live** | Run on 17 Nov 2026 at https://d1szng4oy9m4an.cloudfront.net with a throwaway institute `zz-e2e`, in a real browser. Platform admin added the institute (welcome email sent). Its admin added a course. A student registered through the form and was told "waiting for approval" at login. The admin approved (email sent), uploaded a real PDF and MP4, and gave the student the course. The student saw the course, played the video from S3 and opened the PDF link. Suspending the student cut them off at once, and suspending the institute locked out everyone. No problems found, no Lambda errors, and the institute's rows and files were removed afterwards. Not covered: typing a real emailed login code (done in M2) and a phone-sized screen |
| M7 | **Frontend hosting:** the Angular app on S3 behind CloudFront (HTTPS, deep links work on refresh, the bucket is private), a one-command `deploy-web.sh`, and the site's address added to the allowed origins for the API and S3 uploads | **Tested live** | Address: https://d1szng4oy9m4an.cloudfront.net. Checked with curl (deep links, security headers, a year's caching for hashed files and none for `index.html`, the bucket refuses direct reads, CORS from the site) and in a real browser (login page with the institute's colour and logo, admin screens, a real PDF upload and delete from that address). No Lambda errors |
| Q1 | **Question bank (admin side):** the admin picks a paper and topic from the fixed list of CUET-style papers (37 at first, 43 since step Q10), writes a multiple-choice question with four options, marks the correct one, and explains why each option is right or wrong. Difficulty and draft/published. List with filters, edit, delete. Private to each institute. Students don't see questions yet | **Tested live** | 32 backend and 14 frontend tests (451 and 214 in all). Added later: **Upload from Excel** (see Q2) and **Save and add another** keeps the paper, topic, difficulty and status, so the admin can enter many questions for one combination. Real browser on the sandbox: both mistakes (a repeated option, no correct answer) were shown at once, then the question saved and listed with the correct option marked. On dev (backend and website deployed): the paper list came back, a `ZZ TEST` question was added, a bad topic was refused with every error, the question was filtered, published and deleted, a call with no login got 401, and AaptPrep's bank is empty again. No Lambda errors. The page itself was not opened against dev |
| Q2 | **Upload questions from Excel:** the admin downloads an `.xlsx` template (dropdowns for paper, topic, correct answer, difficulty and status, an instructions sheet and the paper list), fills one row per question, uploads it, sees a preview (ready, problems with row and column, duplicates), then confirms. Only `.xlsx`, up to 500 rows. Pictures are added in Q4 | **Tested live** | 25 backend and 9 frontend tests (476 and 223 in all). Real browser on the sandbox: a 5-row file previewed as 3 ready, 1 bad topic, 1 duplicate; confirming imported 3 including Hindi text. On dev (the real Lambda): the template downloaded, the preview and import worked, uploading again skipped all as duplicates, a text file and a call with no login were refused, and the test questions were deleted. No Lambda errors. The template was not opened in Excel itself |
| Q3 | **Pictures on questions:** the admin can attach one PNG or JPG (up to 1 MB) to a question and one to each option. An option may be picture-only (the reason is still required). Pictures show in the form and the list, and can be replaced or removed. Deleting a question, or replacing or removing a picture, deletes the file from storage. Students don't see questions yet | **Tested live** | 37 backend and 19 frontend tests (513 and 242 in all). On dev with real S3, from the real website: a real PNG went onto the question and onto option B (which had no text), a fake `.png` was refused and removed from S3, the question saved and showed both pictures, removing the question's picture deleted its file, deleting the question deleted the other, and afterwards there were no files and no question or picture rows left. No Lambda errors |
| Q4 | **Pictures in the Excel upload:** the template gets optional columns Question image and Image A to D. The admin first chooses all the pictures in a picture step on the upload card, then types each picture's file name in the sheet. The preview says how many pictures will be attached and flags a missing picture, or one used twice, by row and column. A picture-only option may leave its text empty | **Tested live** | 14 new backend tests and 7 new frontend tests (527 and 249 in all). On dev from the real website: two real PNGs and a fake `.png` were chosen (the fake one was refused), an Excel file named them, the preview showed 2 ready (2 pictures) and one row with problems (a picture used twice and one not uploaded), the import attached both pictures and they loaded in the list. I then deleted the questions: no files, no rows and no Lambda errors left |
| Q5 | **Find questions with pictures:** each question that has a picture on the question or on any option shows a "pictures" tag, and the list has a **Pictures** filter (All questions, With pictures, Without pictures) that combines with Paper, Topic and Status. It is worked out from the pictures actually attached, so it covers questions added by the form or by Excel, and there is no manual column to keep in step | **Tested live** | 4 backend and 3 frontend tests (531 and 252 in all). On dev: a question with a picture on option B and one without were added, the filter returned each correctly, and both were deleted with no files, rows or Lambda errors left |
| Q6 | **Fill-in questions:** a second question type with one box the student types the answer into. The answer is text (accepted spellings separated by `|`, capitals and extra spaces ignored) or a number (compared as a number, with an optional tolerance). It has one explanation instead of per-option reasons, and may have a question picture. The form has a Type choice, the Excel template has optional columns Type, Answer, Answer type, Tolerance and Explanation, and the list has a Type filter and a "fill in" tag. The marking rules are built and tested; students don't see questions yet | **Tested live** | 70 backend and 12 frontend tests (601 and 264 in all). On dev, from the real website: a fill-in question was added through the form (a missing explanation was refused first), an Excel file with two fill-in rows and a bad number imported 2 and flagged the bad row on its Answer column, and the Type filter showed them. I deleted only my three `ZZ` questions; the 25 real questions already in AaptPrep were not touched. No Lambda errors |
| Q7 | **Bulk publish:** tick questions in the list (or **Select all shown**) and click **Publish selected** to publish them, or **Move to draft** to take them back. Up to 500 at a time; questions already in that status are left alone and counted. Ticks are cleared when the list reloads or a filter changes | **Tested live** | 15 backend and 6 frontend tests (616 and 270 in all). On dev, through the real API: 3 `ZZ` drafts were made, 2 published with one unknown id (changed 2, missing 1), all 3 moved back to draft, an empty list was refused, and the `ZZ` questions were deleted; AaptPrep's real questions were not touched. The new website was deployed; the buttons themselves are covered by the frontend tests and weren't clicked in a browser |
| Q8 | **Bulk delete:** with questions ticked, **Delete selected** opens a box that says how many will be deleted for good (pictures too) and asks the admin to type `DELETE`. The Delete button stays off until the word is typed exactly. The server refuses the call unless it also carries `confirm: "DELETE"`. Up to 500 at a time | **Tested live** | 19 backend and 5 frontend tests (635 and 275 in all). On dev, through the real API: 3 `ZZ` questions were made, a call with the word `delete` was refused and nothing was removed, then 2 plus one unknown id deleted (2 deleted, 1 missing), then the last one; no `ZZ` questions were left, and the real questions were not touched. The deleting of pictures is proved by the backend tests (fake storage). The buttons weren't clicked in a browser |
| Q9 | **Reading passages:** a passage (title and text, up to 5,000 characters) is saved once per institute, and any number of questions can point to it. A **Reading passages** card on the Question bank page adds, edits and deletes passages (a passage that questions use can't be deleted). The question form has a Passage dropdown; the list keeps a passage's questions together with the passage shown once above them, and has a Passage filter. The Excel template has a **Passages** sheet (Title, Text) and an optional **Passage** column on Questions that names a passage by its title; a title already in the bank is reused, and a title with different text is refused so nothing is overwritten | **Tested live** | 41 backend and 11 frontend tests (659 and 286 in all). On dev, with the real template downloaded from the site: a file with a passage and three questions was previewed (2 ready, 1 new passage, the row naming a missing passage flagged on its Passage column, nothing saved), imported (one passage shared by 2 questions, paragraph break kept), deleting the passage while in use was refused (409), and after deleting the questions it could be deleted. Only `ZZ` records were used and all were removed. The new screens weren't clicked in a browser |
| Q10 | **Papers on a course:** each course now lists the papers (subjects) it covers. Six new papers for management and law entrance exams join the shared list (Quantitative Ability, Verbal Ability and Reading Comprehension, Data Interpretation, Logical Reasoning, Legal Reasoning, Current Affairs and General Knowledge), making 43. The course form has a tick list grouped by section with Select all and Clear; typing a known course name (CUET, IPMAT, CAT, CLAT) ticks its usual papers, and the admin can change them. The course list shows each course's papers (names, or a count when more than four). The question bank is unchanged; students see nothing yet | **Tested live** | 30 backend and 7 frontend tests (689 and 293 in all). On dev: the paper list has 43; a `ZZ` course named like CLAT got its 5 papers, a bad paper id was refused, the list was changed by hand, and the public course list still shows only id, name and fee. There is no way to delete a course in the app, so I removed my `ZZ` course straight from the table. I then filled AaptPrep's real **CAT (4), CLAT (5) and IPMAT (3)** with the suggested papers; nothing else changed. The new screens weren't clicked in a browser |
| Q11 | **Fee removed from the Courses page:** the Fee column and the Fee boxes (when adding and editing a course) are gone, and a course can be added with just a name. The registration dropdown now shows course names only, without the price. Fees return with payments in Phase 2. Existing courses keep the fee they already had in the database; new ones get 0 | **Tested live** | 2 new backend tests (691 in all); frontend tests updated (293). On dev: a `ZZ` course was added with just a name (fee 0), the list showed it, and I removed it from the table. The page itself wasn't clicked in a browser |
| M8 | **Production and operations:** prod environment, alarms, backups, deploy automation | Not started | |

## How you can test each step
After I finish a step, I'll tell you how to test it, and I keep the instructions here.

### Fastest: the hosted website
The dev website is at **https://d1szng4oy9m4an.cloudfront.net** (see M7 below). Open `/aaptprep/login` there. For the sandbox or your own computer, use the steps that follow.

### Easiest on your own computer: use the screens (F1)
From F1 on, you can test in a browser, like a real user. You need two terminal windows.

**Terminal 1: the API (a local test version, with a fake AWS and no real email)**
```bash
cd /Users/arpit/Documents/claude/transcription-workspace/PragyaPrep.ai/backend
PYTHONPATH=. .venv/bin/python scripts/dev_server.py
```
Login codes and emails are printed in this window.

**Terminal 2: the screens**
```bash
cd /Users/arpit/Documents/claude/transcription-workspace/PragyaPrep.ai/frontend
npm install     # first time only
npm start
```

Open <http://localhost:4200/demo>. (If port 8000 is busy, start the API with `PORT=8001` in front of the command, and open `http://localhost:4200/demo/login?api=http://localhost:8001` once.)

Every page belongs to an institute named in the address: `/demo/...` here, `/aaptprep/...` for the real one.

| Step | What to do | What you should see |
|---|---|---|
| 1 | Open `/demo` | The login page, with a blue header saying **Demo Institute** |
| 2 | Click **Register**, then **Register** with nothing filled in | A red message under **every** field, a summary at the top, and the cursor on the first mistake |
| 3 | Fill in the form (try a mobile like `+91 98765 43210`) and choose a course | A **Thank you** page. A receipt email appears in Terminal 1 |
| 4 | Click **Go to log in**, then **Send me a code** | A blue message: "Your registration is waiting for approval." No code is sent |
| 5 | Log in as `demo-admin@example.com`: ask for a code, read it in Terminal 1, type it in, click **Log in** | The **Registrations** page, with your new registration first |
| 6 | Click **Show details** on it, then **Approve** | A green message "Approved ... We emailed them." An approval email appears in Terminal 1 |
| 7 | Click **Reject** on `pending2@example.com`, type a reason, confirm | The email in Terminal 1 includes your reason |
| 8 | Open the **Approved**, **Rejected**, **Suspended** and **All** tabs. Try **Suspend** and **Reactivate** | Each person moves to the right tab |
| 9 | Click **Courses**. Edit a course (for example make CAT last 180 days), add a course, hide one | The change shows straight away. A hidden course disappears from the registration dropdown |
| 10 | Click **Sign out**. Log in as your new student with a code from Terminal 1 | A **Welcome** page with the approved message |
| 11 | While signed in as the student, type `/demo/admin/registrations` in the address | You are sent back to the student's home page |
| 12 | Open `/nobody/login` and `/closed/register` | "Institute not found", and "This institute isn't active right now" |
| 13 | Make the browser window narrow, or use the browser's phone view | One column, with large fields |

**To use the screens against the real, live dev environment (real data and real email):**
```bash
cd frontend
npx ng serve --configuration live
```
Open <http://localhost:4200/aaptprep>. The dropdown has CLAT, IPMAT and CAT. Register with an email you can read (a Gmail address with a `+` works, like `you+test1@gmail.com`), and the receipt arrives by email. To review it, log in as Ritesh (`sachin.arpit.learning@gmail.com`) with a code from his inbox. If you leave a test registration in the real data, tell me and I'll remove it.

**What is not there yet:** a student can't pay (Phase 2), and there is no custom domain yet.

### Option 1: the API only, on your own computer (the local sandbox)
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

### Option 2: the API only, live in AWS (dev)
The API address is `https://byk6esj2muxebponlkbnsark540cqwpn.lambda-url.ap-south-1.on.aws`. Open `/docs` on that address for the same interactive page. The institutes here are the real ones: `aaptprep` (admin Ritesh, `sachin.arpit.learning@gmail.com`) and `platform` (Arpit, `sachin.arpit@gmail.com`). Codes arrive by real email.

### Run the automated tests
```bash
cd backend
PYTHONPATH=. .venv/bin/python -m pytest -q
```
You should see `691 passed`.

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

### P1 (platform admin page): what to try
The platform admin is still created only by the script (`manage_tenants.py platform-admin`). The page is for everything after that.

In the sandbox (same two terminals as above), open <http://localhost:4200/platform/login> and log in as `owner@example.com` with the code from Terminal 1. You land on `/platform-admin`.

| Step | What to do | What you should see |
|---|---|---|
| 1 | Look at the table | `demo` and `closed`, each with status, admin and created date |
| 2 | **Add an institute** with a short name like `sunrise`, a name, a colour, an admin name and email | "Created ... We emailed ...", the new row, and a welcome email in Terminal 1 |
| 3 | Add another with the same short name, or a bad email | A red message, and the form stays open |
| 4 | **Edit** it: change the colour, set it to **Suspended** | The swatch changes. Opening `/sunrise/login` shows "isn't active right now". Set it back to Active |
| 5 | **Edit**, type a different admin email | A yellow note saying who becomes admin and who is switched off. **Save and switch admin** emails the new admin. The old admin now sees "Your access is paused" at login |
| 6 | Look for a delete button | There is none, and the API answers 405 to DELETE |

Live: run `ng serve --configuration live`, open `/platform/login`, and sign in as Arpit (`sachin.arpit@gmail.com`). The older `aaptprep` record shows "No admin on record" until `link-admin --slug aaptprep --email sachin.arpit.learning@gmail.com` has been run once against dev.

### P2 (correct a student's details): what to try
In the sandbox, log in as `demo-admin@example.com` and open **Registrations**.

| Step | What to do | What you should see |
|---|---|---|
| 1 | Click **Edit** on a student | A form filled with what they gave |
| 2 | Change the city and click **Save** | "Saved ...", and the new city in **Show details**, with "Last edit by you" |
| 3 | Type a bad mobile such as `555` and an email that is already used, then save | A red message under each wrong field. The form stays open |
| 4 | Fix the mobile, type a new email | A yellow note: the old email will stop working and the new address gets an email |
| 5 | Click **Save and change email** | "Their email is now ...". The email appears in Terminal 1. **Show details** lists the earlier email |
| 6 | Try to log in with the old email | "isn't registered". The new one gets a code |

The student's status stays as it was. A student's own **My profile** page comes with F2.

### M4 (content and access): what to try
Use the sandbox's API page, <http://localhost:8000/docs> (or 8001), with `X-Tenant` set to `demo`. There are no screens for this yet, and the sandbox has no real S3 upload target, so the **live** check below is the full one.

**Part A: give access, no files needed.**
1. Log in as `demo-admin@example.com` (code in the terminal), copy the token and click **Authorize**.
2. **GET /api/courses** to copy a course id. **POST /api/admin/registrations/student@example.com/access** with `{"course_id": "..."}`. You should see `active: true` and `expires_at` set by the course's access length (`null` for unlimited).
3. Try it on `pending@example.com`: **409**, "You can only give access to an approved student".
4. **GET /api/admin/registrations/student@example.com/access** lists it. **DELETE** the same path with `/<course id>` ends it.

**Part B: the student's view.** Log in as `student@example.com`, authorize with that token, and open **GET /api/my/courses**. The courses given in Part A appear, with their files. Opening a file without access gives **404**, "We couldn't find that file."

**Part C: files, live on dev.** The upload goes from the browser straight to S3, so use the live API with a real file: **POST /api/admin/courses/{id}/files** with `{"filename": "notes.pdf", "size": <bytes>}` returns a signed form (`url` and `fields`). Post the file to it, then **POST .../files/{file id}/complete**. A real PDF or MP4 becomes `ready`. A renamed text file is refused ("isn't a real PDF") and removed. The screens for this come in F3.

### F2a (content screens): what to try
Use the live dev environment, because an upload goes to real S3. Start the screens against it:

```bash
cd /Users/arpit/Documents/claude/transcription-workspace/PragyaPrep.ai/frontend
```

```bash
npx ng serve --configuration live
```

Open <http://localhost:4200/aaptprep/login> and log in as Ritesh (`sachin.arpit.learning@gmail.com`, code by email).

| Step | What to do | What you should see |
|---|---|---|
| 1 | **Courses**, then **Files** on CLAT | "Files: CLAT" with an **Add a file** form |
| 2 | Choose a PDF. The title fills itself in. Click **Upload** | A progress bar, then "Added ...", and the file listed as **ready** |
| 3 | Rename a text file to `fake.pdf` and upload it | "That isn't a real PDF file, so it was removed." and no row |
| 4 | Try a `.docx` | "Only PDF and MP4 files can be added." |
| 5 | **Registrations**, **Approved** tab, **Show details** on an approved student | A **Course access** section. Choose CLAT, **Give or renew access** |
| 6 | Sign out, and log in as that student (in a private window if you want both open) | **My courses** in the top bar |
| 7 | Open **My courses** | CLAT with your files. **Open PDF** opens a new tab. **Play** plays the video on the page, and you can jump around in it |
| 8 | As admin, **Remove** the student's access. As the student, reload **My courses** | The course is gone |
| 9 | Delete the files you added, with **Delete** then **Yes, delete** | They disappear from the list and from storage |

The origin `http://localhost:4200` must be in the bucket's allowed origins, which it is for dev. If you serve the screens from another address, add it to `cors_origins` in `dev.tfvars` and deploy, or uploads will fail in the browser.

### P3 (logos): what to try
As platform admin, on dev: `npx ng serve --configuration live` (from `frontend`), then log in at <http://localhost:4200/platform/login> as `sachin.arpit@gmail.com`.

| Step | What to do | What you should see |
|---|---|---|
| 1 | **Edit** on an institute | A **Logo** section: "No logo yet" |
| 2 | Choose a PNG or JPG (up to 1 MB), click **Upload logo** | A progress bar, then "Updated the logo of ...", and a preview. It is saved at once, without **Save** |
| 3 | Open `/<institute>/login` | The logo sits next to the name in the top bar |
| 4 | Try a `.gif` or `.svg` | "A logo must be a PNG or JPG picture." |
| 5 | Rename a text file to `fake.png` and upload it | "That isn't a real PNG or JPG picture, so it was removed." |
| 6 | **Replace logo** with another picture | The new one shows, and the old file is deleted |
| 7 | **Remove logo** | Back to the name alone |

Remember to remove any test logo from a real institute afterwards.

### Q1 (question bank): what to try
Log in as an institute admin and open **Question bank** in the top bar (`/<institute>/admin/questions`).

| Step | What to do | What you should see |
|---|---|---|
| 1 | Click **Add a question** | A form. **Topic** is switched off until a paper is chosen |
| 2 | Choose **Physics**, then a topic | Papers are grouped as Language, Domain and General. Topics are only those of the chosen paper |
| 3 | Type a question, four options and a reason for each, but repeat one option and mark no correct answer | Both mistakes are shown next to the form, and what you typed stays |
| 4 | Fix them, mark the correct option, set **Published**, click **Save and add another** | "Added question 1 in Physics · Optics." The list below switches to that paper and topic and shows the question with the correct option marked and each reason. The form stays open with the paper, topic, difficulty and status kept, and the rest cleared, ready for the next question |
| 4b | Add a few more the same way, then click **Done** (or use **Save and close** on the last one) | A counter shows how many you added. The form closes |
| 5 | Use the Paper, Topic and Status filters | Only matching questions |
| 6 | **Edit**, change the wording, save. Then **Delete** and confirm | The change shows. The question is gone |

Delete your test questions afterwards. Students can't see this page or these questions.

### Q2 (upload questions from Excel): what to try
On the Question bank page, use the **Upload many questions** card.

| Step | What to do | What you should see |
|---|---|---|
| 1 | Click **Download template** | `question-bank-template.xlsx`: sheets Instructions, Questions (empty, with dropdowns) and Papers and topics |
| 2 | Fill a few rows (one question per row), make one row wrong (for example a topic from another paper) and repeat one question | |
| 3 | Choose the file | A preview: "N ready · 1 with problems · 1 already in the bank (skipped)". The problem is listed with its row and column. Nothing is saved yet |
| 4 | Click **Import N questions** | "Imported N questions." They appear in the list as drafts unless the Status column said published |
| 5 | Upload the same file again | Everything is skipped as already in the bank. Nothing doubles |
| 6 | Try a `.csv`, or a file with changed column headings | A clear message, nothing saved |

Delete your test questions afterwards.

### Q3 (pictures on questions): what to try
In **Question bank**, click **Add a question** (or **Edit**).

| Step | What to do | What you should see |
|---|---|---|
| 1 | Under the question, choose a PNG or JPG | A progress note, then the picture appears with a **Remove picture** button |
| 2 | Under an option, choose a picture and leave that option's text empty | The picture appears. The hint says text may be empty if the option is only a picture |
| 3 | Fill the rest (the reason is still required for every option), mark the correct one, save | The list shows the picture under the question and under that option |
| 4 | Try a `.gif`, or a picture over 1 MB | "A picture must be a PNG or JPG." or "A picture can be up to 1 MB." Nothing is uploaded |
| 5 | Rename a text file to `fake.png` and choose it | "That isn't a real PNG or JPG picture, so it was removed." |
| 6 | **Edit**, replace or remove a picture, save | The list shows the change, and the old file is deleted from storage |
| 7 | Start adding a question, upload a picture, then **Cancel** | The uploaded picture is deleted from storage |

Delete your test questions afterwards. Deleting a question deletes its pictures too.

### Q4 (pictures in the Excel upload): what to try
On the Question bank page, in the **Upload many questions** card.

| Step | What to do | What you should see |
|---|---|---|
| 1 | **Download template** | The Questions sheet now ends with five optional columns: Question image, Image A, Image B, Image C, Image D |
| 2 | Under "Step 1", choose several PNG or JPG pictures at once | Each shows "ready" (a wrong type or a fake picture shows why it was refused). **Remove** discards one |
| 3 | In the sheet, type a picture's file name (for example `circuit1.png`) in a question's picture column. For a picture-only option, leave its Option text empty and name the picture in its Image column | |
| 4 | Choose the Excel file | The preview says "N ready (M pictures)". A missing picture, or a picture used on two questions, is listed by row and column |
| 5 | **Import** | The questions appear with their pictures. Pictures you uploaded but didn't use are thrown away |

Delete your test questions afterwards.

### Q5 (find questions with pictures): what to try
On the Question bank page, in the **Questions** list.

| Step | What to do | What you should see |
|---|---|---|
| 1 | Look at the list | Each question with a picture on it or on any option has a blue "pictures" tag |
| 2 | Set **Pictures** to **With pictures** | Only those questions |
| 3 | Set it to **Without pictures** | Only the others |
| 4 | Combine it with Paper, Topic or Status | The filters work together |

### Q10 (papers on a course): what to try
In **Courses** (`/aaptprep/admin/courses`).

| Step | What to do | What you should see |
|---|---|---|
| 1 | Look at the table | A **Papers** column: CAT, CLAT and IPMAT already show their papers |
| 2 | Click **Edit** on CAT | A tick list of papers by section, with the course's papers ticked and "4 of 43 selected" |
| 3 | Tick or untick some, click **Save** | The Papers column updates |
| 4 | Under **Add a course**, type `CUET` as the name and click outside the box | All 37 CUET papers get ticked (you can change them) |
| 5 | Type a name like `Foundation` | Nothing is ticked; choose papers by hand |

### Q9 (reading passages): what to try
| Step | What to do | What you should see |
|---|---|---|
| 1 | In **Question bank**, find the **Reading passages** card and click **Add a passage**. Give it a title and some text with a blank line between paragraphs | "Added the passage." and it is listed with "0 questions" |
| 2 | Click **Add a question**, choose the passage in the **Reading passage** dropdown | "Show the passage" appears so you can read it while writing |
| 3 | Save two questions with the same passage | In the list, the passage appears once above both questions |
| 4 | Try **Delete** on the passage | Refused: "2 questions use this passage." |
| 5 | Download the template: it has a **Passages** sheet and a **Passage** column. Put a passage on the Passages sheet and its title on several question rows. Upload it | The preview says "1 new passage"; after Import, the questions share it |

### Q8 (bulk delete): what to try
Use only test questions for this.

| Step | What to do | What you should see |
|---|---|---|
| 1 | Tick two questions and click **Delete selected** | A box: "Delete 2 questions for good?" with a box to type in. The red **Delete 2** button is off |
| 2 | Type `delete` or `DELETE ` | The button stays off. Only exactly `DELETE` turns it on |
| 3 | Click **Keep them** | The box closes, nothing is deleted |
| 4 | Open it again, type `DELETE`, click **Delete 2** | "Deleted 2 questions." and they are gone from the list |

### Q7 (bulk publish): what to try
In **Question bank**, use the Status filter set to **Draft**.

| Step | What to do | What you should see |
|---|---|---|
| 1 | Tick two questions | "2 selected" with **Publish selected**, **Move to draft** and **Clear** |
| 2 | Click **Publish selected** | "Published 2 questions." and the list reloads; they now show as published |
| 3 | Click **Select all N shown**, then **Move to draft** | They go back to draft |
| 4 | Change any filter | The ticks are cleared |

### Q6 (fill-in questions): what to try
In **Question bank**, click **Add a question**.

| Step | What to do | What you should see |
|---|---|---|
| 1 | Set **Type of question** to **Fill in the answer** | The four options go away. An **Answer** section and an **Explanation** box appear. Only the question picture is offered |
| 2 | Answer is **Text**: type `Mumbai | Bombay` | The hint says other accepted answers go after a `|` |
| 3 | Answer is **A number**: type `3.14` and a tolerance `0.01` | |
| 4 | Leave the explanation empty and save | "The explanation is required." next to the box |
| 5 | Fill it in and save | The list shows a "fill in" tag, the answer ("Mumbai or Bombay", or "3.14 (within 0.01)") and the explanation |
| 6 | In the Excel template, set **Type** to `fill_in`, leave the options empty, and fill **Answer**, **Answer type**, **Tolerance** and **Explanation** | The preview names the column of any mistake, for example "Answer: The answer must be a number." |
| 7 | Use the **Type** filter | Only fill-in, or only multiple choice |

Delete your test questions afterwards.

### M7 (hosting): what to try
The dev website is at **https://d1szng4oy9m4an.cloudfront.net**. Open it on any device. There is no start page content yet, so use an institute's address:

| Step | What to do | What you should see |
|---|---|---|
| 1 | Open `https://d1szng4oy9m4an.cloudfront.net/aaptprep/login` | AaptPrep's login page, in its colour, with its logo |
| 2 | Log in as Ritesh (`sachin.arpit.learning@gmail.com`, code by email) | The Registrations page |
| 3 | Refresh the browser on any page | The same page again, not an error |
| 4 | Open `/platform/login` and log in as Arpit | The Institutes page |
| 5 | Add a file to a course (as in F2a) | It uploads. This tests that storage accepts uploads from the website's address |

To put a new version of the screens on the website, from the repo root:

```bash
infra/scripts/deploy-web.sh main dev
```

If the Lambda or the allowed origins change, run `infra/scripts/deploy.sh main dev --yes` first.

### What you can't test yet
Paying for a course (M5), and its screens (the rest of F2 and F3).

## Real data in dev
You asked for real data in the dev table, in place of my old test rows. These are the details you gave me, and what the table holds now.

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

**What is in `pragyaprep-dev`** (read back from AWS on 17 Nov 2026):

| What | Detail |
|---|---|
| Platform | The `platform` institute, and Arpit Jain (`sachin.arpit@gmail.com`) as platform admin |
| Institute | **AaptPrep** (`aaptprep`), active, with a logo, and Ritesh (`sachin.arpit.learning@gmail.com`) as its admin |
| Courses | CLAT, IPMAT and CAT, each with a name lookup row |
| Students | Two registered while you were testing: `arpit.jain.itian@gmail.com` (approved, with access to IPMAT) and `arpit.jain.itain@gmail.com` (suspended) |
| Files | Two IPMAT files you uploaded (a PDF and an MP4), both ready |

My own test rows and files are always removed after each live test. Login codes and rate counters also appear in the table for a while and delete themselves.

## Things I'll need from you along the way
| When | What |
|---|---|
| Now | Nothing |
| Before launch | Request SES production access, a legal check on personal data (students under 18), and a domain |

## Latest test results
**Backend, run on my machine: 691 passed, 0 failed. Frontend: 293 passed, 0 failed. Total: 984.**

| Backend test file | What it covers | Tests |
|---|---|---|
| `test_tenants` | Creating, validating, finding and suspending institutes, the platform admin, the scripts (including the course commands and `link-admin`) | 47 |
| `test_isolation` | One institute can't see or use another's data | 20 |
| `test_wipe_legacy` | The old-data cleanup script | 4 |
| `test_otp_login` | M2 login codes | 31 |
| `test_sessions` | M2 sessions and roles | 15 |
| `test_rate_limits` | M2 rate limits | 11 |
| `test_mailer` | M2 email sender | 7 |
| `test_courses` | M3 courses | 33 |
| `test_registration` | M3 registration | 65 |
| `test_review` | M3 admin review | 33 |
| `test_platform` | P1 platform admin API (list, add, edit, replace admin, no delete, who may call it) | 59 |
| `test_edit_registration` | P2 correcting a student's details and email | 22 |
| `test_content` | M4 files, access, student links, and that a corrected email keeps access | 42 |
| `test_logo` | P3 logos (who may, types and size, checking contents, replace, remove, the public address) | 30 |
| `test_questions` | Q1 question bank (the 37 papers, checks with all mistakes at once, filters, edit, delete, who may, privacy between institutes) | 32 |
| `test_question_import` | Q2 and Q4 Excel upload (template, preview, import, problems by row and column, duplicates, unreadable files, 500-row limit, privacy, pictures named in the sheet) | 39 |
| `test_question_images` | Q3 pictures (who may, types and size, real contents, attach to question and options, replace, remove, delete clean-up, privacy) and Q5 the pictures filter | 41 |
| `test_fill_in` | Q6 fill-in questions (marking rules for text and numbers, checking the admin's answer, the API, switching type, pictures, the Excel columns) | 70 |
| `test_question_status` | Q7 bulk publish (publish, back to draft, counts, bad requests, who may, privacy between institutes) | 15 |
| `test_question_bulk_delete` | Q8 bulk delete (the word DELETE, counts, pictures removed, who may, privacy between institutes) | 19 |
| `test_passages` | Q9 reading passages (the API, limits and unique titles, link from a question, delete rules, privacy, the Excel Passages sheet and column) | 24 |
| `test_course_papers` | Q10 papers on a course (the suggestions by course name, whole-word matching, add and change, bad ids, who may, privacy between institutes) and Q11 courses without a fee | 32 |
| | **Total** | **691** |

| Frontend test file | What it covers | Tests |
|---|---|---|
| `core.spec` | Who is signed in per institute, the interceptor, colours, errors, guards, fees, dates, sizes, the upload service | 38 |
| `register.spec` | Registration page | 16 |
| `login.spec` | Login page: status messages, Register buttons, code step, countdown, redirects by role | 23 |
| `admin-registrations.spec` | Queue, details, decisions, editing a student, course access | 35 |
| `admin-courses.spec` | Courses list, add, edit, hide, papers on a course | 19 |
| `admin-course-files.spec` | Files page: list, upload with progress, refusals, delete | 13 |
| `my-courses.spec` | Student's courses: open a PDF, play a video, renew a link, access ended | 10 |
| `platform-admin.spec` | Institutes page: list, add, edit, admin replacement, logos | 33 |
| `shell.spec` | Page frame, logo in the top bar, student home, start page, not found | 20 |
| `admin-questions.spec` | Question bank page: list, paper and topic dropdowns, add, field errors, edit, delete, filters, adding several in a row, upload card, pictures, pictures filter, fill-in questions, bulk publish, bulk delete, reading passages | 61 |
| `question-upload.spec` | Excel upload card: template download, preview, problems, confirm, wrong file type, picture step | 15 |
| `picture-picker.spec` | Picture picker: upload in three steps, remove, wrong type, too big, server refusals | 10 |
| | **Total** | **293** |

**F1 in a real browser, against the sandbox:** I registered a student through the form (the empty form showed every mistake, then a `+91` mobile was accepted), saw "pending" at login, signed in as the admin with a code from the sandbox log, opened details, approved (email in the log), rejected with a reason (email includes it), edited a course to 180 days, signed out and signed in as the new student, was sent back from an admin address, saw the unknown and switched-off institute pages, and checked a phone-sized window.

**F1 against the live dev API:** the page showed the real institute's name, **AaptPrep**, and its real courses. I registered a clearly labelled test student, approved it from the admin screen ("We emailed them"), saw no email failures in the Lambda log, and **removed the test student afterwards**. For the admin screen I used a session made with the dev signing key, since the real admin login was proven in M2.

**Three problems the browser found that the tests had missed, all fixed:**
1. The admin pages sat against the left edge, because only the register and login cards had a page container. Now every page is inside one.
2. The institute's name in the top bar linked to `/demo/admin%2Fregistrations` (a slash escaped), because I gave the address as one piece. Now each part is separate, and a test checks the address.
3. After a failed submit, the red message under a field stayed even after fixing it. Now it clears when you edit that field, and the summary goes when none are left.


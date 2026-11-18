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
4. **Access.** In Phase 1 the tenant admin gives the student the course by hand, from the student's details. The student then sees it under **My Learning** (the course's coursework). *(Phase 2: the student pays offline with their own UPI app and uploads a screenshot, and the admin verifies it, which grants the access.)*
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
| Course | A dropdown filled from the tenant's own course list (names only, no price). aaptprep starts with IPMAT, CAT and CLAT |

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
- Manage the course list (it fills the registration dropdown): add, rename, change the access length and the subjects, hide or show. (The Courses page no longer shows or sets a fee; fees come back with payments in Phase 2.)
- Give a student a course, renew it, or take it away, from the student's details.
- Add and delete PDF and MP4 files in a course, from the course's **Files** page.
- **Student photos:** an optional photo at registration (positioned in a round window, made small in the browser), changeable or removable by the admin from the edit form, and in a bulk import through the sheet's Photo column plus a Photos step. Shown as round avatars on the Registrations tiles, the top bar, the student's home and the Progress pages, with an initials badge when there is no photo.
- **Search** on Registrations: one box that finds students by any detail on the page (name, email, mobile, address, city, PIN code, gender, birth date, courses, status, who decided, reason, dates); several words must all match.
- **Import students** (button on Registrations): fill in an Excel template with one row per student (email, names, mobile, courses and optional details), see every row checked before anything is saved, then import: each valid student is approved at once with their courses, existing students are skipped, and a welcome email can be sent. A student imported without the optional details can still be edited.
- **Announcements** (admin menu): send a message to everyone, a course or chosen students, as information or action needed (with a button to coursework, tests or results), shown in the students' Notices and optionally emailed. **Remind** on the Progress page sends each student who is behind a notice with their own overdue counts (not more than once a day while unread).
- **Home** (admin menu, and where login lands): tiles for pending registrations, approved students, students behind, tests open now, questions (with drafts) and open courses, each opening the screen that deals with it.
- **Progress** (admin menu): for one course, a table of its students with coursework done, tests taken and average, last active and a status (**Behind**: something overdue; **Not started**; **On track**), most in need first, with search, a Behind-only filter and a CSV download; a **Where students get stuck** tab (sub-topics by how few students completed them); and a page per student with their coursework, overdue items and tests.
- Build a course's **coursework** plan from the course's **Coursework** page: subjects (the course's own), topics and sub-topics, each sub-topic with a note, material (the course's files and links), an optional **finish-by date** (also settable on a topic or subject; anything below follows the nearest date above) and a draft or published status. The admin can **copy** topics and sub-topics from another course (only subjects both courses have): copies are independent, files are shared rather than uploaded again, and dates and status are left out unless the admin chooses to keep them. *(Student side, with the home tile, left navigation, progress and Mark complete, is the next step and not built yet.)*
- **Live classes:** a **Live classes** tab beside the plan on the Coursework page. Upload recordings (MP4) and slides (PDF) several at a time, add classes one by one (title, date, time, description, files, links, draft or published) or in bulk with an Excel template (video and PDF named by their uploaded file name). The sheet is checked row by row before anything is added.
- Keep a **question bank** (see below).
- Build **tests** from the question bank (see below).
- Choose the **subjects (subjects)** each course covers, from the fixed list, with a tick list on the course form. Known course names (CUET, IPMAT, CAT, CLAT) start with their usual subjects, and the admin can change them. This is stored for the student side later.
- *(Phase 2)* Review payments: verify or reject a screenshot, with a reason, and upload the payment QR code.
- *(Phase 2)* Edit the institute's own branding. Today only the platform admin changes the name, colour and logo.

## Correcting a student's details
- The tenant admin can edit any detail of a registration, at any status: name, birth date, gender, mobile, WhatsApp, address, city, PIN code, course and email.
- Changing the email moves the student's record to the new email. The old email stops working, any session on it ends, and the new address gets an email. An email already used at the institute is refused.
- Each edit records who made it and when. The status doesn't change.
- Students editing their own contact details after login comes later, with their own screens.

## Question bank
- Each institute has its own private bank of multiple-choice questions. Only its admin sees it. Students can't see questions yet, and mock tests that use them come later.
- The admin chooses a **subject** and a **topic** from a fixed list shared by all institutes: 43 subjects: the 37 CUET-style subjects (13 languages, 23 domain subjects such as Physics or Accountancy, and General Aptitude) and 6 for management and law entrance exams (Quantitative Ability, Verbal Ability and Reading Comprehension, Data Interpretation, Logical Reasoning, Legal Reasoning, Current Affairs and General Knowledge), each with its own topics.
- A question has the question text, **four options**, the **correct option**, and a **reason for every option** saying why it is right or wrong. It also has a difficulty (easy, medium, hard) and a status (draft or published).
- The admin chooses a subject and topic once and keeps adding questions for that combination: **Save and add another** keeps the subject, topic, difficulty and status, clears the rest and counts the questions added. **Save and close** ends the run.
- **Fill-in questions:** besides multiple choice, a question can be a **fill-in**: one box the student types the answer into, with no options.
  - The answer is **text** or a **number**. For text, the admin lists the accepted spellings separated by `|`, for example `Mumbai | Bombay`, and capitals and extra spaces don't matter. For a number, the student's number is compared as a number (2.50 equals 2.5), with an optional **tolerance**.
  - It has one **explanation** instead of a reason for each option, and may have a question picture but no option pictures.
  - It is added through the form (a **Type** choice) or the Excel upload (optional columns Type, Answer, Answer type, Tolerance and Explanation; a blank Type means multiple choice). The list has a **Type** filter and a "fill in" tag.
  - Students don't see questions yet. The rules that mark a typed answer right or wrong are built and tested, ready for the student side.
- **Pictures:** a question can have one picture (PNG or JPG, up to 1 MB), and each option can have one too. An option may be a picture alone, with its text left empty. Every option still needs its written reason. Pictures can be replaced or removed, and they are deleted from storage when the question is deleted. They can also come with an Excel upload (see below).
- **Upload from Excel:** the admin downloads an `.xlsx` template (dropdowns for subject, topic, correct answer, difficulty and status), fills one row per question with the four options and a reason for each, and uploads it. A preview shows how many are ready, which rows have problems (by row and column) and which are already in the bank. Nothing is saved until the admin confirms. Up to 500 questions per file, `.xlsx` only. Imported questions are drafts unless the Status column says published. **Pictures in the upload:** the admin first chooses all the pictures at once, then types each picture's file name in the optional columns Question image and Image A to D. The preview checks that every named picture was uploaded and that a picture is used on one question only. Uploading the same file twice does no harm.
- The admin can list questions, filter by subject, topic, status and **pictures** (all, with pictures, without pictures), edit and delete them. A question with a picture on it or on any option carries a "pictures" tag. This is worked out from the pictures attached, so it needs no column in the Excel file.
- **Bulk publish:** the admin ticks questions in the list (or **Select all shown**) and clicks **Publish selected**, or **Move to draft**. Any number can be published at once (the screen sends them in groups of 200); questions already in that status are left alone. Handy after an Excel upload of drafts.
- **Bulk delete:** **Delete selected** asks the admin to type `DELETE` before anything is removed, and then deletes the ticked questions and their pictures for good. Any number can be selected (sent in groups of 100).
- **Bulk upload:** the Upload tab takes a **zip** holding Excel files and pictures (or several files chosen together). Pictures are sent automatically, every Excel file is checked, and one combined preview shows ready questions and problems per file. One Import saves everything; duplicates between files are skipped. Up to 30 Excel files and 1000 pictures per run.
- **Reading passages:** a question can have a passage (up to 5,000 characters, paragraph breaks kept). The admin pastes the passage into each related question, and **Save and add another** keeps it filled in. Questions with the same text share one saved passage and are shown together, with the passage once above them; the group header has an edit icon that changes the text for every question in the group. A passage no question uses any more is removed. In the Excel template the **Passage** column holds the text, repeated on each row; older files that name a passage by title still work. The list can be filtered to questions with or without a passage.
- Not yet: pictures in passages and reasons, formulas, several correct answers, per-institute subjects or topics.

## Tests (admin side)
- The tenant admin builds tests on the **Tests** page. A test has: a title and instructions; a **start** and an **end** (date and time pickers, India time; students can attempt it only between them; each is optional); a **duration** in minutes; the **maximum attempts**; the **pass percentage**; **marks for a correct** and **for a wrong** answer (0 or negative, for example -1; decimals such as -0.25 work); whether students may **see the correct answers after submitting**; and the **courses** it is assigned to (checkboxes, for example CAT, IPMAT, CLAT).
- **Adding questions:** *Manually* (choose from the published questions, with search, subject, topic and level filters) or *Automatically* (rules of subject, optional topic, optional level and how many; the system picks random published questions, and can pick again). The test keeps a fixed list, so every student gets the same questions.
- Only published questions can be added. A question on a passage always comes with the rest of its passage, so the picked total can be a little more than asked. The page shows the count, the total marks and the count per subject.
- A test needs at least one question and one course to be published. A question in a published test can't be deleted; deleting a question takes it out of draft tests.
- The list has a **search** by name, a **course** filter and a **status** filter, with a count and a clear button.
- Students take tests from their own **Tests** page (see the Student section).
- **Results:** each test has a Results icon (with the number of attempts) that opens a page with a summary (students, attempts, average, highest, lowest, pass rate and a strip showing how scores spread), a table of every attempt with search, result filter, sort and a "best per student" switch, and a **question analysis** (percent correct per question and the wrong option chosen most, hardest first on request). The admin can open any attempt to see every answer with the right answers and reasons, even when the test hides answers from students. The attempts can be downloaded as a CSV file. A test that students have started can't be deleted (move it to draft).

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
- See only the courses they have been granted, in their own tenant, in **My Learning**. There is no separate My courses page: a course's files reach students through the coursework plan (a file the admin doesn't attach to any sub-topic is not shown to students).
- Open a course, play its MP4 videos (with seeking) and open its PDFs.
- **Notices:** a **Notices** link with an unread badge, a Notices tile on the home page and a Notices page with messages and reminders from the institute; action-needed ones have a button that opens the place to act.
- **Coursework:** a **Coursework** tile on the home page and a **Coursework** page with a left navigation of courses, subjects, topics and sub-topics, each with progress. The student opens the material (PDFs, videos, links), sees the finish-by date (and **overdue** when it has passed and the sub-topic isn't complete), and marks each sub-topic complete or not complete. Only published sub-topics of courses they currently have access to are shown.
- **Live classes:** a **Live classes** tab in My Learning shows the published recordings, slides and links of each course they can open, newest first. Recordings play in the page and slides open in a new tab.
- **Contact support:** the help button at the top opens a form to email the platform admin, with an optional screenshot. The admin replies to the sender's own email address.
- **Take tests:** a **Tests** page lists the tests of the courses the student can open now, with the window, attempts used and best score. A test has an intro (questions, marks, marking, time, pass mark, instructions), then one question at a time with a numbered palette, passages shown with their questions, pictures, typed answers for fill-in questions, mark for review, a countdown, and Submit. Answers save as they go and a refresh resumes the attempt with the time left. The test submits itself when time runs out. The result shows marks, percentage, pass or fail and the counts, and (if the test allows it) a review of every question with the right answer, the student's answer and the reason for each option. Attempts are limited by the test; a started attempt counts.
- **My results:** a switch on the Tests page opens the student's results across all tests: totals (tests taken, attempts, average and best score, tests passed), a bar chart of the last 10 attempts, strengths and weaknesses by subject and topic (weakest first, with a "Practise this" tag under 50%), and a table of every finished attempt with search, a passed or not passed filter and a link to each result.
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

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
| H1 | **Admin home as tiles:** the admin now has a **Home** page (first in the admin menu; login and the logo link go here instead of Registrations) with loud gradient tiles, each a count that opens the screen that deals with it: **Pending** registrations (red when above zero; opens Registrations on the pending list), **Students** (approved; opens the approved list), **Behind** (students behind in any open course, each counted once; red when above zero; opens Progress), **Tests open** (published tests open right now), **Questions** (published, with an "N drafts" chip) and **Courses** (open). The Registrations page now opens on the list named in the address (`?status=approved`). The simple counts come from `GET /api/admin/home`; **Behind** comes from `GET /api/admin/home/behind`, which reads every student's records, so it loads on its own and the tile shows … until it arrives (same few-hundred-students-per-course limit as Progress) | **Tested live** | 11 backend and 11 frontend tests (1,068 and 510 in all). On dev (backend and website deployed): Pending 0, Students 41, Tests open 55, Questions 1,500, Courses 4, and Behind arrived after the others (0, as no demo finish-by date has passed). The simple counts took about 0.34 s once warm (4 s on a cold start). Not done: the platform admin's home |
| N1 | **Announcements and reminders (in the app and by email):** the admin has an **Announcements** page: a title, a message, **Information** or **Action needed** (with a button to Coursework, Tests or Results; only places inside the app), an audience (**everyone**, **students of a course**, or **chosen students** by email address) and a **Send an email too** tick (on by default for action needed, off for information). Each student gets their own notice; a failed email is counted and never undoes the notice. A history shows what was sent, to whom, how many were reached and emailed. On **Progress**, **Remind N** sends every student who is behind in the course a notice of their own ("You have 2 overdue sub-topics and 1 missed test in CAT", with a button to Coursework, or Tests when no coursework is late), and the student page has **Remind** for one student; anyone already reminded about that course in the last day and who hasn't read it is skipped. Students see a **Notices** link with an unread badge in the top bar (red when something needs action), a **Notices** tile on the home page (shown once they have any notice) and a **Notices** page: action-needed first, each with its button (using the button counts as reading it), Mark read and Mark all read. Notices move with the student if their email is changed. Email links use `PRAGYA_FRONTEND_URL` | **Tested live** | 42 backend and 36 frontend tests (1,110 and 546 in all). On dev (backend and website deployed): the admin sent an action notice with a coursework button to one demo student (no email); the student's home showed the red badge on Notices and a red Notices tile (1 action needed); the Notices page listed it with Open coursework and Mark read; the button marked it read, cleared the badge and opened My Learning; an empty title was refused; Remind found nobody behind, so sent nothing (no demo finish-by date has passed). All test records were removed. **Email was not sent for real on dev**: SES can only send to verified addresses until AWS grants production access, and the demo students use example.com; email is covered by the in-memory mailer tests. Not done: automatic daily reminders, WhatsApp or SMS |
| B1 | **Bulk onboarding (Import students):** a **Template** button (saves the Excel template straight away) and an **Import** button on the Registrations page; Import opens **Import students**, which has the template button too. The admin downloads an Excel template (Students sheet with blue required and grey optional headings, a Courses sheet listing the open courses, and a How to fill sheet), fills one row per student and chooses the file. A **preview** checks every row first and saves nothing: counts of ready, already registered and problem rows, and each problem named by its column (several at once). Required: email, first name, last name, mobile (the usual +91/0/space forms are accepted) and one or more courses (names separated by `;`, `,` or `|`, matched without regard to case). Optional: birth date (YYYY-MM-DD or an Excel date), gender, WhatsApp (empty means the mobile), address, city and PIN code. Then **Import N students** creates only the ready rows as **approved** students with each course granted under that course's access length (source `import`, with a batch id and the admin who did it); students already registered in any status are skipped and reported, never overwritten; the admin's own email and a repeated email in the file are flagged. A **Send a welcome email** tick (on by default) emails each new student once, in chunks of 25 so a request stays within its time limit, with a count of how many went and how many could not. Limits: `.xlsx` only, 500 rows, 2 MB. A student imported without the optional details can be edited without filling them in (what is typed is still checked; a student who registered themselves still needs every field) | **Tested live** | 68 backend and 15 frontend tests (1,178 and 561 in all). On dev (backend and website deployed): a 3-row sheet showed 2 ready and 1 problem (bad mobile and unknown course, both named); importing the 2 created approved students (one with two courses and the optional details, one without), with access rows from the import; the blank-field student could be edited and a bad PIN was still refused; the test students were removed. **Welcome email was not sent for real on dev** (Amazon's mail service only reaches verified addresses until AWS grants production access); it is covered by the in-memory mailer tests. Not done: updating existing students, undoing an import (each student carries the batch id so it can be added), CSV files |
| S8 | **Search on Registrations:** a search box above the list searches every detail the page shows, as you type: name, email (and an earlier email), mobile and WhatsApp, address, city, PIN code, gender, birth date, courses, status, who decided or edited and the reason given, and the dates (as stored, for example 2003-03-05, and as shown). Several words must all be found, in any order and across different details ("pune ipmat"); case is ignored; a number typed with a space still matches. It says "Showing 2 of 141", has a clear button and a "no match" message, and keeps the search when another list tab is opened. **Also fixed:** the admin's lists were cut at the newest 200 registrations, which would hide students once an institute has more (for example after a bulk import); every registration is now listed | **Tested live** | 24 frontend tests (586 in all) and 1 backend test (a 230-student list shown in full). On dev (website and backend deployed): the Approved list showed all 141 students, and searches gave pune 14, pune ipmat 2, example.org 100, one mobile number 1, 2004 (birth year) 11, and a no-match message for nonsense, with the full list back after clearing. Not searched: course access details (they load only when a student is opened) |
| S9 | **Registrations as tiles:** the list is now a grid of compact tiles (about three across on a wide screen, one on a phone). Each tile has a round initials badge in a steady colour, name, email, status, course chips, mobile, city and registered date, a coloured top edge by status (pending amber, approved green, rejected red, suspended grey) and the same actions as before. A tile opens to the full row width while its details, edit form or reject box are showing. Search, tabs, Template and Import are unchanged | **Tested live** | 11 new frontend tests (599 in all, no backend change). On dev (website deployed): the Approved tab showed the 141 students as tiles with badges, chips and actions. Not opened live: expanding a tile, editing and rejecting (covered by tests) |
| Q11 | **Question template on the Question bank page:** a **Template** button next to **Add question** saves the Excel template for uploading many questions (`question-bank-template.xlsx`) straight from the page; the Upload tab still has its own | **Tested live** | 2 frontend tests (601 in all). On dev (website deployed): the button was on `/aaptprep/admin/questions` and started a download of `question-bank-template.xlsx` (the save was intercepted in the browser; the file itself comes from the existing, tested template endpoint) |
| AV1 | **Student photos (round avatars):** (1) **Registration page:** an optional photo step: the student chooses a picture, drags and zooms it inside a round window, and **Use photo** makes a 256 by 256 JPEG in the browser (about 6 to 30 KB). After the registration is saved the photo is sent straight to storage with a ten-minute permission issued only for that registration (a signed token tied to the email and institute; storage refuses anything over 300 KB or not a JPEG); if the upload fails the registration still stands and the student is told the institute can add it. (2) **Admin edit form:** the same picker, to add, change or remove a student's photo; the old file is deleted. (3) **Bulk import:** the sheet has an optional **Photo** column (file name) and the Import page has a **Photos** step like the question bank's: choose many pictures or one zip, each is cut to its middle square and made small in the browser, sent under its lower-case file name, and matched by name (not uploaded, or used twice, is a problem on that row; a photo already on a student is not offered again; the sheet is re-checked after photos are added). (4) **Where avatars show:** Registrations tiles, the top bar and the home greeting, and the Progress table and student page; without a photo, or if a link cannot load, the coloured initials badge shows. Photos are stored privately in the institute's own folder and shown through links that last an hour; `avatar_key` is never sent to the browser. **Seed script:** `backend/scripts/student_data/seed_photos.py` gives every student a photo from a folder of portraits (plan, create, status, remove; `male` and `female` sub-folders are matched by gender; ffmpeg prepares each picture). The pictures are not part of the repository (it needs a folder of portraits to run); pictures are used in turn so they repeat evenly, and an unreadable picture is skipped | **Tested live** | 42 backend and 13 script tests (1,234 in all) and 52 frontend tests (653 in all). On dev (backend and website deployed): a test student registered with `photo=true`, the photo went to storage (204), a wrong token was refused (422), the right one attached it, the admin list returned a working link to the JPEG, and storage itself refused a 400 KB upload; in a real browser the cropper opened with a round window and zoom, and **Use photo** produced a 256 by 256 JPEG of 6 KB; the Registrations tile showed the round photo beside a tile with initials. The test students and their file were removed. **Seeded on dev:** all 142 students (demo, imported and the real registration) were given photos from the supplied folders (33 male and 22 female pictures, matched by each student's recorded gender, or by first name where none is recorded (10 imported students), and repeated in turn; none of the 132 with a recorded gender got the other folder's picture); the Registrations tiles show them as round avatars. These are watermarked stock previews, fine for a private dev demo but not for production; a few are illustrations or full-length shots, so some crops show a torso or a drawing. `seed_photos.py remove` takes them all away. Not done: students changing their own photo later (there is no profile page) and face detection |
| P2 | **Correct a student's details:** the admin edits any detail of a registration at any status, including the email (the record moves to the new email, the old email stops working, the new address is emailed). Only changed fields are sent, and a taken email is refused | **Tested live** | 22 backend and 11 frontend tests. Browser check in the sandbox. On dev: registered a test student, approved, a bad edit was refused with both errors at once, the email was changed, the old email then said "not registered", and the test row was removed. No Lambda errors |
| P3 | **Institute logos:** the platform admin adds, replaces and removes an institute's logo (PNG or JPG, up to 1 MB) on the Edit form. It shows next to the name at the top of every page, including login | **Tested live** | 30 backend and 10 frontend tests (419 and 200 in all). On dev with real S3: uploaded a real PNG from the platform page, saw it in the preview and in AaptPrep's top bar, then removed it. Back to no logo, no stray files, no Lambda errors |
| M4 | **Content and access (API):** the admin adds PDF and MP4 files to a course (straight to S3, then checked), gives an approved student access (renewable, ends by the course's access length), and takes it away. A student sees their courses and opens a file through a 5-minute link | **Tested live** | 42 new backend tests (389 in all). On dev with real S3: a real PDF and MP4 were accepted, a fake PDF was removed from S3, a student had no access before the grant and got a working link after, a byte-range download returned 206, and a revoke closed the link. Test rows and files removed. No Lambda errors. No screens yet (F2, F3) |
| M5 | **Payments (API):** QR code, screenshot upload, admin verify or reject, access granted on verify | **Moved to Phase 2** | Decided on 17 Nov 2026. Until then the admin gives access by hand (built in M4) |
| F2a | **Content screens (the screens for M4):** the admin's **Files** page for each course (upload with progress, delete), **Course access** on a student's details (give, renew, remove), and the student's **My courses** page (PDFs open in a new tab, videos play on the page) | **Tested live** | 34 new frontend tests (190 in all). Driven in a real browser against dev with real S3: uploaded a real PDF and MP4 from the page, gave a test student access from the registrations screen, then as that student played the video (it played and seeking worked). Test files and student removed. No Lambda errors |
| F2 | **Frontend: student payment page** (fee, QR code, screenshot upload) | **Moved to Phase 2** | Goes with M5. The course list and viewers are done in F2a |
| F3 | **Frontend: tenant admin payments** (payments queue, QR code and settings) | **Moved to Phase 2** | Goes with M5. Content upload and access are done in F2a |
| M6 | **Deploy to dev and test end to end:** the whole journey from registration to watching a video, through the API and the screens | **Tested live** | Run on 17 Nov 2026 at https://d1szng4oy9m4an.cloudfront.net with a throwaway institute `zz-e2e`, in a real browser. Platform admin added the institute (welcome email sent). Its admin added a course. A student registered through the form and was told "waiting for approval" at login. The admin approved (email sent), uploaded a real PDF and MP4, and gave the student the course. The student saw the course, played the video from S3 and opened the PDF link. Suspending the student cut them off at once, and suspending the institute locked out everyone. No problems found, no Lambda errors, and the institute's rows and files were removed afterwards. Not covered: typing a real emailed login code (done in M2) and a phone-sized screen |
| M7 | **Frontend hosting:** the Angular app on S3 behind CloudFront (HTTPS, deep links work on refresh, the bucket is private), a one-command `deploy-web.sh`, and the site's address added to the allowed origins for the API and S3 uploads | **Tested live** | Address: https://d1szng4oy9m4an.cloudfront.net. Checked with curl (deep links, security headers, a year's caching for hashed files and none for `index.html`, the bucket refuses direct reads, CORS from the site) and in a real browser (login page with the institute's colour and logo, admin screens, a real PDF upload and delete from that address). No Lambda errors |
| Q1 | **Question bank (admin side):** the admin picks a subject and topic from the fixed list of CUET-style subjects (37 at first, 43 since step Q10), writes a multiple-choice question with four options, marks the correct one, and explains why each option is right or wrong. Difficulty and draft/published. List with filters, edit, delete. Private to each institute. Students don't see questions yet | **Tested live** | 32 backend and 14 frontend tests (451 and 214 in all). Added later: **Upload from Excel** (see Q2) and **Save and add another** keeps the subject, topic, difficulty and status, so the admin can enter many questions for one combination. Real browser on the sandbox: both mistakes (a repeated option, no correct answer) were shown at once, then the question saved and listed with the correct option marked. On dev (backend and website deployed): the subject list came back, a `ZZ TEST` question was added, a bad topic was refused with every error, the question was filtered, published and deleted, a call with no login got 401, and AaptPrep's bank is empty again. No Lambda errors. The page itself was not opened against dev |
| Q2 | **Upload questions from Excel:** the admin downloads an `.xlsx` template (dropdowns for subject, topic, correct answer, difficulty and status, an instructions sheet and the subject list), fills one row per question, uploads it, sees a preview (ready, problems with row and column, duplicates), then confirms. Only `.xlsx`, up to 500 rows. Pictures are added in Q4 | **Tested live** | 25 backend and 9 frontend tests (476 and 223 in all). Real browser on the sandbox: a 5-row file previewed as 3 ready, 1 bad topic, 1 duplicate; confirming imported 3 including Hindi text. On dev (the real Lambda): the template downloaded, the preview and import worked, uploading again skipped all as duplicates, a text file and a call with no login were refused, and the test questions were deleted. No Lambda errors. The template was not opened in Excel itself |
| Q3 | **Pictures on questions:** the admin can attach one PNG or JPG (up to 1 MB) to a question and one to each option. An option may be picture-only (the reason is still required). Pictures show in the form and the list, and can be replaced or removed. Deleting a question, or replacing or removing a picture, deletes the file from storage. Students don't see questions yet | **Tested live** | 37 backend and 19 frontend tests (513 and 242 in all). On dev with real S3, from the real website: a real PNG went onto the question and onto option B (which had no text), a fake `.png` was refused and removed from S3, the question saved and showed both pictures, removing the question's picture deleted its file, deleting the question deleted the other, and afterwards there were no files and no question or picture rows left. No Lambda errors |
| Q4 | **Pictures in the Excel upload:** the template gets optional columns Question image and Image A to D. The admin first chooses all the pictures in a picture step on the upload card, then types each picture's file name in the sheet. The preview says how many pictures will be attached and flags a missing picture, or one used twice, by row and column. A picture-only option may leave its text empty | **Tested live** | 14 new backend tests and 7 new frontend tests (527 and 249 in all). On dev from the real website: two real PNGs and a fake `.png` were chosen (the fake one was refused), an Excel file named them, the preview showed 2 ready (2 pictures) and one row with problems (a picture used twice and one not uploaded), the import attached both pictures and they loaded in the list. I then deleted the questions: no files, no rows and no Lambda errors left |
| Q5 | **Find questions with pictures:** each question that has a picture on the question or on any option shows a "pictures" tag, and the list has a **Pictures** filter (All questions, With pictures, Without pictures) that combines with Subject, Topic and Status. It is worked out from the pictures actually attached, so it covers questions added by the form or by Excel, and there is no manual column to keep in step | **Tested live** | 4 backend and 3 frontend tests (531 and 252 in all). On dev: a question with a picture on option B and one without were added, the filter returned each correctly, and both were deleted with no files, rows or Lambda errors left |
| Q6 | **Fill-in questions:** a second question type with one box the student types the answer into. The answer is text (accepted spellings separated by `|`, capitals and extra spaces ignored) or a number (compared as a number, with an optional tolerance). It has one explanation instead of per-option reasons, and may have a question picture. The form has a Type choice, the Excel template has optional columns Type, Answer, Answer type, Tolerance and Explanation, and the list has a Type filter and a "fill in" tag. The marking rules are built and tested; students don't see questions yet | **Tested live** | 70 backend and 12 frontend tests (601 and 264 in all). On dev, from the real website: a fill-in question was added through the form (a missing explanation was refused first), an Excel file with two fill-in rows and a bad number imported 2 and flagged the bad row on its Answer column, and the Type filter showed them. I deleted only my three `ZZ` questions; the 25 real questions already in AaptPrep were not touched. No Lambda errors |
| Q7 | **Bulk publish:** tick questions in the list (or **Select all shown**) and click **Publish selected** to publish them, or **Move to draft** to take them back. Up to 500 at a time; questions already in that status are left alone and counted. Ticks are cleared when the list reloads or a filter changes | **Tested live** | 15 backend and 6 frontend tests (616 and 270 in all). On dev, through the real API: 3 `ZZ` drafts were made, 2 published with one unknown id (changed 2, missing 1), all 3 moved back to draft, an empty list was refused, and the `ZZ` questions were deleted; AaptPrep's real questions were not touched. The new website was deployed; the buttons themselves are covered by the frontend tests and weren't clicked in a browser |
| Q8 | **Bulk delete:** with questions ticked, **Delete selected** opens a box that says how many will be deleted for good (pictures too) and asks the admin to type `DELETE`. The Delete button stays off until the word is typed exactly. The server refuses the call unless it also carries `confirm: "DELETE"`. Up to 500 at a time | **Tested live** | 19 backend and 5 frontend tests (635 and 275 in all). On dev, through the real API: 3 `ZZ` questions were made, a call with the word `delete` was refused and nothing was removed, then 2 plus one unknown id deleted (2 deleted, 1 missing), then the last one; no `ZZ` questions were left, and the real questions were not touched. The deleting of pictures is proved by the backend tests (fake storage). The buttons weren't clicked in a browser |
| Q9 | **Reading passages:** a passage (title and text, up to 5,000 characters) is saved once per institute, and any number of questions can point to it. A **Reading passages** card on the Question bank page adds, edits and deletes passages (a passage that questions use can't be deleted). The question form has a Passage dropdown; the list keeps a passage's questions together with the passage shown once above them, and has a Passage filter. The Excel template has a **Passages** sheet (Title, Text) and an optional **Passage** column on Questions that names a passage by its title; a title already in the bank is reused, and a title with different text is refused so nothing is overwritten | **Tested live** | 41 backend and 11 frontend tests (659 and 286 in all). On dev, with the real template downloaded from the site: a file with a passage and three questions was previewed (2 ready, 1 new passage, the row naming a missing passage flagged on its Passage column, nothing saved), imported (one passage shared by 2 questions, paragraph break kept), deleting the passage while in use was refused (409), and after deleting the questions it could be deleted. Only `ZZ` records were used and all were removed. The new screens weren't clicked in a browser |
| Q10 | **Subjects on a course:** each course now lists the subjects (subjects) it covers. Six new subjects for management and law entrance exams join the shared list (Quantitative Ability, Verbal Ability and Reading Comprehension, Data Interpretation, Logical Reasoning, Legal Reasoning, Current Affairs and General Knowledge), making 43. The course form has a tick list grouped by section with Select all and Clear; typing a known course name (CUET, IPMAT, CAT, CLAT) ticks its usual subjects, and the admin can change them. The course list shows each course's subjects (names, or a count when more than four). The question bank is unchanged; students see nothing yet | **Tested live** | 30 backend and 7 frontend tests (689 and 293 in all). On dev: the subject list has 43; a `ZZ` course named like CLAT got its 5 subjects, a bad subject id was refused, the list was changed by hand, and the public course list still shows only id, name and fee. There is no way to delete a course in the app, so I removed my `ZZ` course straight from the table. I then filled AaptPrep's real **CAT (4), CLAT (5) and IPMAT (3)** with the suggested subjects; nothing else changed. The new screens weren't clicked in a browser |
| Q11 | **Fee removed from the Courses page:** the Fee column and the Fee boxes (when adding and editing a course) are gone, and a course can be added with just a name. The registration dropdown now shows course names only, without the price. Fees return with payments in Phase 2. Existing courses keep the fee they already had in the database; new ones get 0 | **Tested live** | 2 new backend tests (691 in all); frontend tests updated (293). On dev: a `ZZ` course was added with just a name (fee 0), the list showed it, and I removed it from the table. The page itself wasn't clicked in a browser |
| Q12 | **"Papers" renamed "Subjects" everywhere the admin sees it:** the Question bank page (form, filter, list, messages), the Courses page (the tick list, the column, the hints) and the Excel template (the **Subject** column, the **Subjects and topics** sheet, the dropdown messages, the instructions and the preview's problem messages). Files made from the older template, with the column called **Paper**, still upload. Names inside the code and the API (`paper`, `/api/admin/papers`) are unchanged, so nothing stored needed to change | **Tested live** | Backend 693 and frontend 293 tests (986 in all). On dev, the template downloaded from the site has the Subject column and the Subjects and topics sheet, and an Excel file with the old Paper heading still previews as ready |
| U1 | **Sleek look, sample first:** a small icon set drawn in the code (no library), an ⓘ tip for explanations, a one-line page header with the main action on the right, icon-only row actions with tooltips, status dots, and one-line empty states. Applied to the top navigation (icons plus short labels; labels hide on phones) and the **Courses** page (Add course opens a panel; Files, Edit and Hide/Show are icons; access shown as "Unlimited", "365 days"; subjects as a count when more than two; subject tick list in columns). Registrations, Course files and the Question bank (with tabs Questions, Passages, Upload) follow after the look is approved | **Tested** | 298 frontend tests (5 new for the kit, courses tests updated). Checked in a real browser on the sandbox at desktop and phone width, and deployed to dev. Backend unchanged (693) |
| U2 | **Sleek look rolled out to the other admin pages:** **Registrations** (status dots; Approve as a button, Details, Edit, Reject and Suspend as icons; explanations behind ⓘ), **Course files** (icon header, compact upload panel, delete as an icon with a confirm), and the **Question bank**, now with three tabs: **Questions** (a compact filter toolbar, icon Edit and Delete, a bulk bar, passages shown once above their questions), **Passages** and **Upload**. The add-question form is tighter: Type, Subject and Topic on one row; Passage, Difficulty and Status on the next; each option's text and reason side by side; hints behind ⓘ. Behaviour and the API are unchanged | **Tested** | 300 frontend tests (2 new for the tabs; many updated for the new labels and tabs). Checked in a real browser on the sandbox (Registrations, Course files, Question bank list and form), and deployed to dev. Backend unchanged (693). The Passages and Upload tabs were covered by tests, not by a screenshot |
| Q13 | **Passages by pasted text, grouped on screen:** the question form has a **Passage** box; paste the passage into each related question (Save and add another keeps it filled). Questions with the same text (capitals and spaces ignored) share one saved passage and are shown together with the passage once above them; the group header has an edit icon that fixes the text for every question in the group. In Excel the **Passage** column holds the text, repeated on each row, and the Passages sheet is gone from the template (older files that name a passage by title still work). The Passages tab and the passage dropdown are removed, so the Question bank has two tabs, Questions and Upload. A passage no question uses any more is removed automatically | **Tested live** | 24 new backend tests and 7 frontend tests changed or added (713 and 299 in all). On dev, with the real template: two questions with the same pasted text (one in capitals) shared one passage, editing the group changed both, an Excel file repeating a passage on two rows previewed 1 new passage and imported 2 questions in one group, and after deleting my `ZZ` questions the passage count was back to what it was before. The new screens weren't clicked in a browser |
| Q14 | **Bulk upload:** the Upload tab has one box that takes a **zip** (with Excel files and pictures inside, in any folders) or several files chosen together. The browser opens the zip, sends the pictures straight to storage four at a time with a progress bar, has the server check every Excel file, and shows one combined preview (a table with ready, problems and skipped per file, and a "What to fix" list per file). One **Import** saves every ready question, file by file; a question already saved by an earlier file is skipped as a duplicate. Computer clutter in zips (`__MACOSX`, hidden files, Excel lock files) is ignored; unsupported files are counted. Limits: 30 Excel files and 1000 pictures per run, a zip up to 250 MB, each Excel file up to 500 rows and 2 MB, each picture up to 1 MB. A small open-source zip library (JSZip) is loaded only when a zip is chosen | **Tested** | 24 frontend tests for the upload (301 in all, 1,014 with the backend's 713). In a real browser on the sandbox: one zip holding three of your converted Excel files previewed 300 ready in a table, imported in one click, and the list showed 300 questions with their passages grouped. Deployed to dev. Not yet tried with the Data Interpretation pictures, and the preview's "new passages" adds up per file, so a passage shared by two files is counted twice there (it is saved once) |
| T1 | **Tests built from the question bank (admin side):** a new **Tests** page. A test has a title and instructions, a start and an end (date and time pickers, India time, each optional), a duration, the maximum attempts, the pass percentage, marks for a correct and for a wrong answer (the wrong-answer marks are 0 or negative, decimals such as -0.25 are fine), whether students may see the correct answers after submitting, and the courses it is assigned to (checkboxes: CAT, CLAT, IPMAT and so on). Questions are added **Manually** (a picker over the published questions with search, subject, topic and level filters) or **Automatically** (rules of subject, optional topic, optional level and how many; **Pick questions** chooses at random, **Pick again** re-rolls). Either way the test keeps a fixed list, so every student gets the same questions. Only published questions can be added; a question on a passage always brings the rest of its passage; the page shows the count, total marks and a count per subject. A test needs at least one question and one course to be published. A question that is in a published test can't be deleted (single or bulk), and deleting a question takes it out of draft tests | **Tested live** | 79 backend and 17 frontend tests (792 and 318 in all, 1,110 with both). On dev through the real API: a published `ZZ` test was created (2 questions, 6 marks), marks of +1 for a wrong answer were refused, the auto-pick respected the exclusions and reported a shortfall, deleting a question in the published test gave 409 and bulk delete skipped it, then the test and my `ZZ` questions were removed. In a real browser on the sandbox: an automatic test with three rules picked 10 questions (2 pulled in with their passage), saved, and showed in the list. Students can't take tests yet; that is the next step |
| Q15 | **No limit on bulk publish:** the 500-question limit on **Publish selected** and **Move to draft** is gone, so the whole bank (for example all 1,500 questions) can be published in one click. The screen sends the ids in groups of 200 and shows progress ("Publishing… 400 of 1500"); if a group fails it says how many were done and the same click finishes the rest later. The server reads the bank once and changes questions 16 at a time. Bulk delete also works on any number now, in groups of 100, still behind the typed DELETE | **Tested live** | 1 new backend test (publishes 1,200 at once), 4 frontend tests changed or added (792 and 321 in all, 1,113 with both). On dev, 600 `ZZ` questions: one call to publish all 600 took 7.5 seconds and back to draft 7.2 seconds, which is why the screen uses groups (the server's limit per request is 15 seconds); a delete of 500 took 14.5 seconds, so delete is grouped by 100. All `ZZ` questions were removed. The real bank (1,500 draft questions) was not changed |
| T2 | **Search and filters on the Tests page:** above the list, a search box (by words in the test's name, any order, capitals ignored), a course filter (a test shared by several courses shows under each), a status filter (published or draft), a count ("12 of 55 tests"), a clear icon, and a "No tests match" message. The filters work on the list already loaded, so they are instant, and they stay while tests are published, moved to draft or deleted | **Tested** | 6 new frontend tests (327 in all, 1,119 with the backend's 792). Deployed to dev; not looked at in a browser |
| S1 | **Students take tests:** a **Tests** link in the student's menu. The list shows tests for the courses the student can open now (state Open, Upcoming, Ended, In progress or Done; the window; attempts used; best score). The intro page shows the questions, total marks, marking, time, pass mark, window, attempts left and instructions, and an attempts table. **Start** begins the clock and opens the test: one question at a time with a numbered palette (answered, current, marked for review), the passage with its questions, pictures, multiple choice or a typed answer, Previous, Next, Clear answer, Mark for review, a countdown (red in the last five minutes) and Submit (with a count of what was answered). Answers save as the student goes (typed answers after a short pause; a failed save is kept and retried), and a refresh resumes the attempt with the answers and the time left. The server owns the clock: the deadline is fixed at the start, answers up to 3 seconds late are accepted, and later ones submit the attempt for the student. The **result** shows marks, percentage, pass or fail, and correct, wrong and unanswered counts; if the test allows it, a review of every question with the right answer, the student's answer and the reason for every option (filter: all, wrong, not answered). Each attempt freezes the test's questions and marking when it starts; correct answers and reasons are never sent before submitting | **Tested live** | 44 backend tests and 50 frontend tests (836 and 367 in all, 1,203 with both). On dev with a temporary `ZZ` student and a 4-question `ZZ` test (all removed afterwards): the student saw the tests of their course, started (no answers or reasons in the response), saved answers, resumed with them, submitted (marks 0 of 12 for 1 right and 3 wrong at +3 and -1), got a 4-question review, and an admin got 403 on the student endpoints. In a real browser on the sandbox: intro, taking a 7-question test with a passage and a typed answer, a refresh in the middle (time and answers kept), submit and a result with a review. Note: the 55 tests I created start on 18 Nov 2026 at 00:00, so students see them as Upcoming until then. Not done: the admin's view of students' results, the timer running out was tested only in the automated tests |
| S2 | **The admin sees students' results:** a **Results** icon on each test (with the number of attempts started) opens `/admin/tests/:id/results`. It shows a summary (students, attempts and how many are in progress, average, highest, lowest, pass rate) and a bar strip of how scores spread in ten-percent bands; an attempts table (student name and email, attempt number, started, time taken, marks, percentage, passed or not, a clock mark when time ran out) with search by name or email, a result filter (passed, not passed, in progress), a sort (newest, highest, lowest, name) and a Best per student switch; a click on a row opens that attempt with every question, the student's answer, the right answer and every reason, even when the test hides answers from students; a Question analysis table (percent correct with a colour bar, answered of faced, the wrong option chosen most) with a Hardest first switch; and a **Download CSV** of the attempts (formula-safe). A test that students have started can no longer be deleted (move it to draft instead); a test's attempt count is kept on the test, so the list needn't count | **Tested live** | 16 backend and 24 frontend tests (852 and 390 in all, 1,242 with both). On dev with two temporary `ZZ` students and a `ZZ` test (all removed afterwards): the summary, attempt rows (one submitted, one in progress), per-question percentages, the admin's review (4 items) while the student's own copy had none, the attempt count on the list, a 409 when deleting a test with attempts, and 403 for a student on the admin endpoint. In a real browser on the sandbox with two students and four attempts: the summary, bars, filters, a row opened to its review, and the question analysis. The CSV download is covered by automated tests only |
| S3 | **Students see their results across tests:** a **Tests | My results** switch at the top of the student's test pages, and a new **My results** page (`/results`). It shows tiles (tests taken, attempts, average score, best score, tests passed of tests taken, where a test counts as passed if any attempt passed), a bar chart of the last 10 attempts (green passed, red not passed, oldest first, shown once there are two), **Strengths and weaknesses** (accuracy by subject and by topic inside it from every finished attempt, weakest first, with a "Practise this" tag under 50% and colour bars), and **All your results** (every finished attempt, newest first, with search by test name, a passed or not passed filter and an Open link to that attempt's result). Each finished attempt now keeps right, wrong and not-answered counts per topic from the moment it is submitted, so the page adds them up without re-reading questions; the results stay available if a test is later moved to draft | **Tested live** | 12 backend and 12 frontend tests (864 and 402 in all, 1,266 with both). On dev with a temporary `ZZ` student and two `ZZ` tests (removed afterwards): totals, rows, the trend and a topic breakdown (Human geography 2 of 6, India's people and economy 0 of 3) were right, and an admin got 403 on the student endpoint. In a real browser on the sandbox with a student who took two tests four times: the tiles, bars, subject and topic bars with the Practise this tag, the table and the switch. Not done: comparison with other students, certificates, downloads |
| S4 | **Demo student data (scripts):** `backend/scripts/student_data/` makes 10 students per open course with genuine-looking Indian names, example.com emails and dummy phone numbers (4 choose two courses), grants access, and has them take 3 to 7 tests each through the app's own attempt code with a patched clock, so results are real and spread over the last 28 days. Commands `plan`, `create`, `status`, `remove`; deterministic by seed; tagged `demo_seed` so `remove` deletes only them and fixes test attempt counts | **Tested live** | 18 script tests (backend 910 passed in all). On dev (aaptprep): 40 students and 245 attempts created. The students cannot sign in; they fill the admin Results and student result screens. See the README in that folder |
| S5 | **IIM loading cursor:** while any request to the server is running longer than 0.3 s, a ring of 8 IIM badges (IIMA, IIMB, IIMC, IIML, IIMK, IIMI, IIMR, IIMU; real logos can replace them later) spins beside the mouse pointer (in a corner on touch screens; still for reduced motion) and the page cursor becomes "progress". One interceptor counts requests, so no page changed; it never blocks clicks | **Deployed to dev** | 8 frontend tests (421 in all). Checked in a real browser against a deliberately slow API: ring appeared after the delay and went away when the call finished. Website deployed to dev; not yet opened on dev |
| S6 | **Students' test schedule (light):** the student **Tests** page is now grouped as **Overdue**, **Open now** (closing soonest first, with "Closes in 2 days", amber within a day), **Coming up** (opening soonest first, "Opens in 5 h") and **Finished**. A test is **overdue** when its window closed and the student never started it (a test left running past the window counts as taken). The student **home** page has a small **Your tests** card: overdue count and up to five lines (overdue, then closing soonest, then what opens next), hidden when there are no tests. The server sends `overdue`, `minutes_left` and `opens_in_minutes` (India time, the closing minute counts) | **Tested live** | 5 backend and 4 frontend tests (915 and 426 in all). On dev (backend and website deployed): a demo student's list came back with the new fields and the home card and Tests page showed "Closes in 133 days". Overdue was not seen live because no dev test has closed yet; it is covered by automated tests. Not done: email or WhatsApp reminders, a calendar page |
| S7 | **Student home as action tiles:** the home page is a greeting and a grid of solid, loud gradient tiles with a huge white count and almost no text; each links to the screen that deals with it. **To take** (total, with overdue in a white-on-red chip, this week, later; this week means the next 7 days; the tile turns red when something is overdue), **In progress** (only while a test is running), **Courses** (count), **Attempts** (count, average, passed of taken), **Weak subjects** (count of subjects under 50%; hidden when none; the weakest is in the hover title). Each tile loads on its own, so one failed call leaves a quiet tile. Replaces the welcome card and the Your tests list. The same layout is planned for the admin homes | **Tested live** | 9 new frontend tests (431 in all). On dev (website deployed): a demo student's home showed 34 to take (0 this week, 34 later), 2 courses, and 4 attempts with a 59.05% average and 3 of 4 passed. In progress, overdue and weak tiles were not seen live (no data for them); covered by tests. Not done: admin and platform admin homes |
| C1 | **Coursework (admin side):** each course has a **Coursework** action (layers icon) on the Courses page. The page shows the course's subjects (from the course) with the admin's **topics** and **sub-topics**: add a topic (the subject's usual topics are suggested, or type a custom one), add a sub-topic, move either up or down, delete (a topic with its sub-topics, after asking). A sub-topic has a name, a note, a **finish-by date**, **material** (the course's ready PDF and MP4 files, and links) and a **Draft or Published** status (publishing needs a note or some material). A finish-by date can be set on a sub-topic, a topic or a subject; anything below without its own date follows the nearest one above (shown as "Follows the topic's date"). Counts at the top: topics, sub-topics, published, with a date. Deleting a course file takes it out of the plan. Limits: 120 characters a name, 2,000 a note, 20 items of material, 1,500 topics and sub-topics a course. **Students cannot see coursework yet** | **Tested live** | 48 backend and 28 frontend tests (963 and 449 in all). On dev (backend and website deployed): with a temporary `ZZ` course the admin added a topic and two sub-topics (one published with a link and a date), set a subject date (the other sub-topic followed it), a bad date was refused, and the page showed the tree, counts and editor (all removed afterwards). Not done: material upload from this page, Excel import, reminders. Next: the student side (home tile with the coursework count, left navigation of courses, subjects, topics and sub-topics with progress and Mark complete) |
| C3 | **Reuse coursework across courses:** a **Copy from…** button on the Coursework page. Pick another course, tick subjects, topics or single sub-topics (ticking a subject or topic ticks everything under it; only subjects this course also has are offered, and the page says how many were left out), then **Copy N**. A copy is independent (later changes to the other course don't follow) and brings notes and links. **Files are shared, not uploaded again**: the target course gets its own file row pointing at the same stored file, so students of that course can open it, and a stored file is deleted only when no course uses it any more. A topic with the same name receives the new sub-topics; a sub-topic with the same name is skipped. By default dates are left out and sub-topics become Drafts; two ticks, **Keep dates** and **Keep status**, change that. The result says how many were copied, skipped and how many files were added | **Tested live** | 25 backend and 8 frontend tests (1,009 and 457 in all). On dev (backend and website deployed): a temporary `ZZ` course got CAT's Quant and Logical Reasoning plans copied with dates and status kept (6 topics, 18 sub-topics, 2 shared files; the dates matched CAT exactly), Data Interpretation was left out as the course lacks it, and copying again added nothing (18 skipped); the `ZZ` course was removed afterwards. Not done: a live link between courses, an institute-wide file library |
| C4 | **Coursework for students:** a **Coursework** link in the student menu and a **Coursework** tile on the home page (count of sub-topics left, with overdue and this-week chips; red when something is overdue; hidden when there is no coursework). The Coursework page has a **left navigation** of course, subject, topic and sub-topic, each with progress (done/total and a bar; overdue count on a course), and the chosen sub-topic on the right: breadcrumb, name, finish-by line ("Due in 5 days", "Overdue by 5 days" in red, "Done 14 Jan 2027"), note, material (PDFs open in a new tab, videos play in the page, with the same expiring links as My courses; links open in a new tab) and **Mark complete / Mark not complete**. It opens on the first sub-topic not done. Students see only **published** sub-topics of courses they can open now; when access ends the coursework disappears and returns, with the same progress, when access is renewed. Progress is per student and per course, saved as one small row per completed sub-topic, and moves with the student if their email changes. Overdue (date passed, not complete) blocks nothing | **Tested live** | 19 backend and 20 frontend tests (1,028 and 478 in all). On dev (backend and website deployed): a demo student with CAT and CLAT access saw 67 sub-topics (34 + 33), the home tile and the page with the left navigation; marking one complete rolled up to 1 of 67, CAT 1/34 and Arithmetic 1/3, and marking it not complete put everything back to 0. Not seen live: playing a video, overdue (no demo date has passed). Not done: an admin view of every student's progress, reminders |
| L1 | **My Learning (one page for students):** the student menu is now **Home** and **My Learning**. My Learning has three tabs, **Coursework**, **Tests** and **Results** (addresses `/learning`, `/learning/tests`, `/learning/results`), replacing the separate Courses, Coursework, Tests and My results pages. The **My courses** page is removed; its old address, and the old `/coursework`, `/tests` and `/results` addresses, redirect to the matching tab so saved links keep working. Taking a test and a test result keep their addresses, and their back links go to the Tests tab. On the home page the Tests, Coursework and Courses tiles become one **My Learning** tile: the big number is coursework left plus tests to take, with chips for the split ("67 coursework", "34 tests") and an "N overdue" chip; it opens Coursework, or Tests when no coursework is left. Attempts, Weak subjects and In progress tiles stay. **Note:** a course file reaches a student only through a published sub-topic that has it attached; a file attached to no sub-topic is not shown to students | **Tested live** | 12 frontend tests changed or added (473 in all, no backend change). On dev (website deployed): the home tile showed 101 (67 coursework + 34 tests); `/courses` redirected to My Learning; the Coursework, Tests and Results tabs each opened with the right tab marked. Not done: nothing changed on the admin side |
| PV1 | **Admin Progress view:** a **Progress** item in the admin menu. Pick a course (open courses; the first is chosen) to see counts (students, behind, not started, on track) and a table with one row per student who has access: name and email, coursework done/total with a bar and an overdue chip, tests taken of available with the average of each test's best score and a "missed" chip, last active, and a status. Students needing attention come first. There is a search by name or email, a **Behind only** toggle and a **CSV** download of every student of the course. A second tab, **Where students get stuck**, lists each published sub-topic with how many students completed it ("7 of 40" and a bar), least finished first. Clicking a student opens their page: status, counts, overdue coursework with how late, coursework by subject and topic (done, overdue, waiting), and their tests with attempts, best score and state. **Behind** = a finish-by date passed on a sub-topic not marked complete, or a test that closed with no attempt; **Not started** = nothing done and no test submitted; **On track** = the rest. Test counts leave out upcoming and draft tests. Worked out when asked, reading students in parallel, fine for a few hundred per course (store running totals if an institute grows to thousands) | **Tested live** | 24 backend and 21 frontend tests (1,057 and 498 in all) plus 5 script tests. On dev (backend and website deployed): after `seed_coursework.py progress` marked 454 sub-topics complete for 28 demo students, CAT showed 12 students (all on track), each with coursework and test numbers; Where students get stuck listed 34 sub-topics (all 0 of 12 at the top), and a student page showed 4 subjects and 37 tests. CAT's page loaded in about 2 s. Not seen live: Behind, because no demo finish-by date has passed yet (covered by tests). Not done: reminders, a progress tile on the admin home |
| LC1 | **Live classes (admin):** a **Live classes** tab next to the plan on each course's Coursework page. Admin uploads recordings (MP4) and slides (PDF) several at a time, then adds a class one by one (title, date, time, description, files from the uploaded list, links, draft or published) or in bulk: **Template** downloads an Excel sheet (Live classes, Uploaded files, How to fill) and **Upload sheet** previews every row (ready, skipped, error by column) before **Add**. The sheet names video and PDF by their uploaded file name (or title); a class can only be published with a recording, slides, link or note. Edit and delete (with confirm) | **Tested live** | 59 backend and 13 frontend tests (1,297 and 666 in all). On dev: created, refused an empty publish, downloaded the template, previewed and imported a sheet (1 ready, 1 error), then removed the test classes. |
| LC2 | **Live classes (student):** a **Live classes** tab in My Learning (`/learning/live`) listing, per course the student can open now, the published live classes newest first with date, time, description, and the recordings, slides and links. A recording plays in the page and slides open in a new tab, through the same expiring links as coursework (a new link is fetched if one runs out). Drafts and courses without access never show | **Tested live** | 5 backend and 6 frontend tests. On dev: a published class showed for a student with CAT access and a draft did not; test classes removed |
| SP1 | **Contact support:** a help button in the top bar (admins and students) opens a form to write to the platform admin, with an optional screenshot (taken automatically of the page behind the form when it opens, so no address bar or form is in it, with a preview and a Remove button; or chosen, or pasted into the message; large pictures are scaled down in the browser; PNG, JPG or WebP, up to 3 MB, checked by content on the server). It goes out by email to the platform admin with the sender's name, role, institute and page, and the sender's address as Reply-To. Nothing is stored. The platform admin's address is read from the platform tenant record (`admin_email`, filled in by `ensure_platform_admin`) | **Tested live** | 17 backend and 7 frontend tests (1,319 and 679 in all). On dev: SES accepted a message with a screenshot attached (the platform record needed `admin_email`, now set). Not done: a limit on how often one person can send |
| FM1 | **Free mode:** a student sees every active course of the institute in Coursework. Courses they are not enrolled in (no access, or access ended) show a padlock, and their sub-topics show a title and a padlock only, with no note, date or material sent to the browser. One free sample is open to everyone: the first published sub-topic of the first topic of the first course (oldest active course that has one). It opens fully (note, files, links), can be marked complete, and its files open through the usual expiring link. Enrolled students (access granted) see their courses unlocked as before. The home tile counts only what is open. Live classes and tests stay for enrolled students | **Tested live** | 9 new backend tests, 3 updated, 2 new frontend tests (1,328 and 681 in all). On dev: a student enrolled only in IPMAT saw CAT, CLAT and CUET locked, CLAT's first sub-topic open and free, and no note or material on any locked item. Always on for every institute; no on/off switch yet |
| PR1 | **Practice tests (student):** on the Results page, every topic under 75% has a **Practise** button (**Practise this** under 50%). It makes a private practice test of 5 to 30 questions (10 by default) from the institute's published questions of that topic, and opens it. It can be taken again and again, shows answers after each attempt, has no dates, counts in the student's results (so weak areas update), and never shows in the admin's test list or to other students. It appears in the student's Tests with a **Practice** chip. Only students enrolled in a course can make one (up to 100 each) | **Tested live** | 15 backend and 2 frontend tests. On dev a parent made one for a linked student (see PA1); a practice question set grows when questions belong to a passage, so 5 asked can give more |
| EM1 | **Email through Gmail (SMTP) as an alternative to SES:** SES mail sent "from" a Gmail address was accepted by Gmail but never reached inboxes. A new `smtp` email option sends through the sender's own Gmail account with an app password (Google signs the mail; about 500 emails a day, so a stop-gap until a domain is bought). The password lives in SSM as `/pragyaprep/dev/smtp_password` (never in the repo); it is only read when the option is on. Switch with `email_backend = "smtp"` in `infra/accounts/main/dev.tfvars`, switch back with `"ses"` | **Live on dev: email now goes through Gmail** (switched in the uncommitted `infra/accounts/main/dev.tfvars`). A real sign-up code reached an inbox and worked | 3 new backend tests, plus a real email received. Daily cap about 500; buy a domain and switch back to SES before launch. **Found on the Android test app:** Gmail's server sometimes answers slowly (3 to 20 seconds seen), which made a sent code look like a failure and threw the code away; fixed by waiting up to 25 seconds, treating a late final reply as sent, and raising the API time limit to 30 seconds. A slow code email is still possible until we move to SES |
| FT1 | **One free test for free students:** the free home shows the picked course's first published test ("Your free test", questions, minutes, one attempt). It opens the ordinary test pages (start, clock, answers saved as you go, submit, score and answer review), but with **one attempt only** and **no open or close dates** (the test's own limits are ignored for a free student). The test and its questions are read from the sample institute; the attempt is stored under the free student's own account, so nothing is written to the sample institute and its results page does not show free attempts. Only that one test and its own questions are reachable; every other test or question is 'not found'. Free parents have no test. "More tests open on a paid plan" is shown under it | **Deployed to dev; checked in a browser on a local copy (not on dev itself)** (sign up, pick CAT, take the test, submit, result, Home shows Done, a second attempt is refused) | 9 backend and 5 frontend tests (1,444 and 755 in all). Not done: the free test cannot be retaken or reset by the admin; free students have no results history page |
| AN1 | **Android app (Capacitor), first step:** the Angular site is wrapped as an Android project (`frontend/android`, app id `app.pragyaprep.mobile`, PragyaPrep icon and splash), pointing at the dev API. Phone back button works; files open in the in-app browser; the API now allows the app's own origin (`https://localhost`, checked live on dev). Steps to build and install are in `frontend/ANDROID.md` | **Test app (debug APK, 5 MB) built on this computer; the file contents were checked** (app id, name, internet permission, pages bundled). **It has not been run on any phone or emulator yet**; the user will try it | 1 new frontend test (756 in all). Not done: the production AWS environment, privacy policy page, Play listing, signed release bundle, admin downloads inside the app |
| AN2 | **iPhone app project (Capacitor iOS):** `frontend/ios` generated with the same app id, icon, splash and in-app file opening; the API and storage now also allow `capacitor://localhost` (checked live on dev). Steps are in `frontend/ANDROID.md` | **Project generated only. Not built or run: this computer has no Xcode, so no iPhone file exists.** An iPhone app file needs Xcode (Mac App Store) and an Apple ID; TestFlight or the App Store need the paid Apple Developer account | Not done: first build in Xcode, safe-area and file-opening checks on an iPhone, Apple signing, App Store listing |
| HS1 | **Add to Home Screen (iPhone and Android Chrome):** the website now has the PragyaPrep "P" icon, a web manifest, and the settings for a full-screen look (no browser bars) when opened from the Home Screen. The status bar area is white so its text stays readable on any institute colour | **Deployed to dev; the icon, manifest and page tags were checked live (files served, page links them). Not seen on an actual iPhone yet** | Existing Home Screen icons must be deleted and added again to pick up the new icon |
| IP1 | **Institute admin profile (My institute):** the admin's round photo in the top bar opens it. The admin can change the institute's **name, logo, brand colour, description (300 characters), city, contact email and phone, website and up to 8 exam categories**, and their own **name, mobile and photo**. These institute details are public: the page says so, and students see a **Contact your institute** card on their home page (only when something is filled in). The login email and the plan cannot be changed here. Everything is checked first, so one mistake changes nothing; the top bar follows the new name and colour at once | **Deployed to dev; checked in a browser on a local copy as an admin** (open, fill in, save: name in the bar changed live, website and phone were tidied) | 13 backend and 7 frontend tests. Not done: the platform admin cannot yet see or edit these details (next step), no public institute page |
| PA1 | **Platform admin: plans and institute details:** the institutes list now shows each institute's **plan** (free, popular or premium; an older one that says paid counts as premium) and its **size** (students, parents, courses, people waiting). Editing an institute can **change its plan** (moving off Free lifts the 1 student and 1 parent limit; moving onto Free does not remove anyone already approved) and shows the details the institute chose to show (city, contact, website, exam categories; read only here, the institute edits them). An institute admin cannot set a plan | **Deployed to dev; checked in a browser on a local copy as the platform admin** (plan column, sizes) | 4 backend and 2 frontend tests. Popular and Premium are labels only: nothing is gated by them yet |
| BT1 | **Batches:** a new **Batches** page for the institute admin. A batch has a name (unique), one or more **courses**, optional start and end dates, an optional **seat limit**, optional **faculty** name and a short **timetable**. The admin adds approved students from a searchable list and removes them. **Adding a student opens the batch's courses** (with the course's usual access length); **removing** them closes only access the batch itself opened, and only if no other batch of theirs still needs that course, so access the admin gave by hand is never touched. Changing a batch's courses opens or closes them for everyone in it; **archiving** closes them, making it active opens them again. A student can be in several batches. Seat limits are kept (nothing is added if the seats would run out; the limit can't go below the students already in). Students see **My batch** on their home page, parents see their child's batches on the child page (never the other students), and the platform admin's institute sizes now count batches | **Deployed to dev; checked in a browser on a local copy** (create, add a student, then the student sees it) | 17 backend and 12 frontend tests (1,501 and 776 in all). Not done: fees, attendance, a timetable calendar, faculty as real accounts, import of students into a batch from a sheet |
| PU1 | **Pop-ups, drawers and warnings:** one reusable popup (centre box or right-hand drawer; closes with Escape, a tap outside or the cross). Used for: **Submit the test** (a summary of answered, not answered and marked-for-review, the time left, and buttons that jump to each blank question); **Before you begin** (the rules, shown before a new attempt, not when resuming); the admin's **student quick look** drawer (details, courses open, batches, parents, deletion request) from a Quick look eye on approved students and from names inside a batch; and a **one-time welcome** for each kind of person (admin, student, parent, free learner), remembered on that device. Also a **picture viewer** (tap a question or option picture to see it full screen) and an **unsaved-changes warning** when leaving My profile or My institute with changes not saved | **Deployed to dev; checked in a browser on a local copy** (welcome popup, quick look drawer). The test popups are covered by tests only | 2 backend and 15 frontend tests. Not done: a tour that points at parts of the screen, drawers for other lists |
| UX1 | **UX improvements (no Hindi):** the admin home has a **set-up checklist** (institute details, first course, students, questions, an open test; ticks as each exists, links to the right page, can be hidden) and a **Find a student** box (name, email or mobile) that opens the quick look drawer. The student home has a **Today** card (a test to carry on, overdue items, coursework due this week, tests this week, notices needing action, or "all caught up") and a **progress ring** on My Learning. On phones, a student's or parent's links become a **bottom tab bar** with labels. Empty states with one clear message already existed on every list, and students already have a notice centre (Notices with unread counts), so those two were not rebuilt | **Deployed to dev; the Today card and the bottom bar were checked in a browser at phone size on a local copy.** The checklist and search are covered by tests only | 10 frontend tests (799 in all). Not done: global search across courses and tests, an admin notification centre |
| IV1 | **Investor deck (draft):** 13 slides (cover, problem, solution, what is built today, who uses it, business model, market, traction, go to market, roadmap, team, the ask, close) as a private slide-deck artifact. Everything it says about the product is true today (built features, the free tier, the plan labels, the roadmap marked as planned). **Every figure, name, date, quote and price is a yellow dashed placeholder; none was invented.** Speaker notes say what to fill in | **Not rendered or previewed (no browser renderer on this computer); layout checked by hand only.** Private to the owner until shared | Needs from you: audience, stage, market figures with sources, traction, team, the ask |
| AN3 | **Android test app 1.1** (version code 2, installs over the earlier test app): includes everything built on the website that night (My institute, batches, pop-ups, Today card, bottom tab bar, welcome and more). Built with Java 21; the earlier iPhone project is unchanged | **Built; file contents checked (app id, version). Not run on a phone by me** | Final totals at that point: 1,503 backend and 799 frontend tests, all passing |
| PF1 | **Faster Behind tile on the admin home:** the home page used to work out "who is behind" from scratch on every visit (about 10 to 20 seconds on AaptPrep: 5 courses, about 140 members). Now (1) the last answer is **saved on the institute** and shown instantly; if it is over 15 minutes old or missing, the page asks for a **refresh** in the background and swaps the number in (a small "updating…" label shows meanwhile; asking again within a minute returns the saved answer); and (2) each student's records are **read once for all courses** (3 reads a student) instead of once per course. Measured read-only against AaptPrep's real dev data from a laptop: **11.6 s before, 5.3 s after, same answer**; inside AWS it is faster, and most visits now show the saved number in well under a second | **Deployed to dev; tested; timed on real data.** Not clicked through on the live site as the AaptPrep admin | 5 backend tests (including one that counts the reads) and 5 frontend tests (1,508 and 805 in all). Not done: a scheduled nightly refresh and running totals per student (needed beyond a few hundred students); the Progress page still works out each course fresh |
| PF2 | **Faster Progress page (admin):** each course's page is now **worked out once and saved** (the student list and "Where students get stuck" share one pass over the records, instead of two). Opening a course shows the saved page at once with **"Updated <time>"**; if it is over 15 minutes old it is refreshed in the background and swapped in; a **Refresh** button works the latest out on demand (asked again within a minute, it returns the saved page). Each course is saved separately (about 20 KB on AaptPrep; a course too big for one item is just worked out each time). Reminders and announcements still use fresh records, never the saved page. Measured read-only on AaptPrep's dev data from a laptop: the **first visit** to a course builds both views in **2.9 to 5.1 s** (it used to be 2.4 to 6.9 s for the list plus 1.9 to 2.5 s more for the stuck tab); **later visits read one saved item** | **Deployed to dev; tested; timed on real data.** Not clicked through on the live site as the AaptPrep admin | 6 backend tests and 4 frontend tests (1,514 and 809 in all). Numbers can be up to 15 minutes old until Refresh. Not done: nightly refresh, running totals, saving the student detail page |
| PA1 | **Parents:** a new **parent** role. The admin adds parents from **Registrations > Parents**: one by one (name, email, optional mobile, and the email of a child who is already a student) or in bulk with an Excel template (Parents sheet: Email, First name, Last name, Student email with several children separated by `;`, Mobile), previewed row by row before **Add**. Adding the same parent again links another child (up to 6); a child can have several parents; the admin can unlink a child or remove a parent. A parent is emailed how to log in and signs in with an emailed code like everyone else, landing on **My children**: each child with every course they are enrolled in, status, coursework, tests and average. **Details** shows overdue coursework, tests with best scores and the topics under 75% with a **Set practice test** button, which makes a private practice test the child finds in their Tests (marked Practice and with a purple **Set by your parent** tag, in the list and on the test page). A parent sees only their own children and cannot use the student pages; parents are not counted as students. When a student's email changes, parents follow it | **Tested live** | 28 backend and 23 frontend tests (1,371 and 706 in all). On dev: added a ZZ parent, previewed a sheet (1 ready, 1 error), saw the child's courses and details as the parent, set a practice test that the child then saw as set by the parent, an unlinked student gave 404, then removed the test parent and test. Not checked: how the pages look in a browser. Not done: parents on the Progress or Registrations lists; parent self-registration; welcome emails only reach verified addresses on dev |
| LC3 | **Live classes tied to the plan:** every live class now belongs to a **Subject** of the course (required) and optionally a **Topic** and a **Sub-topic** (picked in cascading lists on the form, or by name in the sheet's new Subject, Topic and Sub-topic columns, with a Plan sheet in the template listing the names). A student with access sees the class inside Coursework, under its sub-topic, and under every sub-topic of its topic or subject when it was tagged higher up. Recordings play there and slides open as before. The Live classes tab still lists all of them with where each belongs. Classes made before this have no place and show as such until edited | **Tested live** | 13 new backend and 3 frontend tests (1,380 and 708 in all). On dev: a class tagged to CAT > Quantitative Ability > Arithmetic > Concepts was refused without a subject, and showed under that sub-topic for an enrolled student; test class removed. Not checked in a browser |
| AC1 | **Editing a student's courses changes their access:** when the admin changes the courses on a registration, a course taken off loses its access and a course added is opened (for an approved student). Access to courses the edit does not touch is left alone, and it follows an email change made in the same edit. Before this, only the registered-courses list changed and the student kept seeing the removed course | **Tested live** | 4 new backend tests (1,384 in all). On dev, Arya Modi's CAT access (still active after CAT was taken off her registration) was removed: CAT then showed locked and her other courses stayed open |
| TS1 | **Search and type filter on tests:** the student's **Tests** page has a search box (by test name) and a type list: All types, Course tests, My practice tests, Set by your parent. A parent's child page has the same on one **Tests** table that now lists the child's course tests and practice tests together, each labelled Course, Practice or Set by you, with attempts and best score (the child's practice tests are new in the parent view). Backend: the parent's child detail returns the child's practice tests and who set each | **Tested live** (backend and website deployed) | 1 new backend and 4 new frontend tests (1,385 and 718 in all). Not checked in a browser |
| HP1 | **Public home and pricing pages:** the bare address (`/`) is a short, bold home page for anyone not signed in. A gradient hero ("Crack your exam. Together."), then **I am…** (an institute, a student or a parent), remembered in the browser, which shows one line and three chips for that visitor and marks their plan. A **Peek inside the courses** button opens a popup with the courses as tabs, then subjects, topics (expandable) and sub-topics, with only the first sub-topic of each course open and the rest padlocked; it reads a public, cached, names-only outline (`GET /api/public/glimpse`, no institute name, notes, files, links or drafts; taken from AaptPrep's published coursework until the platform has its own, set by `PRAGYA_GLIMPSE_TENANT`). Below are the three plans with up to four short perks each and a Compare button. The top bar has Home, Pricing and a **Log in** button that asks for the institute's short name and opens its page (the old "Already with an institute?" section is gone). `/pricing` shows Free, Popular and Premium with all perks and what is left out, prices "coming soon" and the buttons switched off. Escape closes the popups. The names pricing, free, signup, home, about and contact can no longer be used as an institute's short name | **Tested live** (backend and website deployed; looked at in a browser) | 3 backend and 21 frontend tests (1,388 and 737 in all). Not done yet, in this order: the free tier for a student or parent with no institute (sign-up, pick a course, one open sub-topic, no institute branding, enquiry email to the platform admin), then free institute sign-up with limits, then tier gating |
| CT1 | **Nav icon contrast and a tighter top bar:** each icon has its own tint; on a dark bar the tints are light, on a light bar (for example lime green) they are deep tones of the same hues, chosen from the brand colour; strokes are bolder. The bar is wider and tighter so the links no longer drop to a second row, the member name is gone from the bar and the institute name is gone from the admin Welcome banner | **Deployed to dev, to be checked by eye** | Styling and layout; 737 frontend tests pass |
| TC1 | **Tile colours by meaning:** admin home tiles now each have their own hue: Pending amber, Students blue, Behind red, Tests open cyan, Questions violet, Courses green (Pending and Courses used to look alike); a tile that needs action still turns red-orange | **Deployed to dev, to be checked by eye** | Styling only |
| SU1 | **First-time sign-up (no approval):** `/signup` (Start free on the home and pricing pages) asks who you are (institute, student or parent), a short form and a 6-digit emailed code, then creates the account and signs you in. **Institute:** its own page on the **Free plan** (name, short name, colour; reserved and taken names refused before any email; up to 3 institutes per email), you become its admin, and the platform admin is emailed. A free institute can approve **one student and one parent** (a clear message at the limit; paid institutes have no limit). **Student or parent with no institute:** joins the shared `free` tenant (shows only "PragyaPrep", no institute branding), picks one course from the platform's sample courses (AaptPrep's, names only), can never change it without asking, and opens only that course's first sub-topic (its note, links and **files**, which open in a new tab through a short-lived link; no other file opens) with the rest of the course shown locked; the Contact support button reaches the platform admin. Codes are hashed, single use, rate limited, and a code for one kind of sign-up won't work for another | **Deployed to dev; the checks that need no inbox were run live** (reserved name, taken name, wrong code); the full code flow needs a real inbox, so please try it | 16 backend and 5 frontend tests (1,406 and 742 in all). Not done yet: a free institute's **content** is not yet limited to one open sub-topic per course (only the member limits are enforced); Popular and Premium tier gating; free learners cannot yet change their course themselves |
| PR1 | **Profiles for students and parents:** the round photo in the top bar now opens **My profile**. The institute owns name and email (shown, not editable). **Student** keeps: photo, mobile, date of birth, up to 5 target exams, exam date, weekly study goal (0 to 80 hours), and which emails they want (announcements, tests, live classes). **Parent** keeps: photo, mobile, relation (Mother, Father, Guardian, Other), progress-summary rhythm (weekly, monthly, off) and a consent tick (time-stamped). Both see their linked people (a student's parents, a parent's children), can **download their data** as a file, and can **ask for deletion**: the institute admin is emailed and decides, nothing is deleted automatically (the request can be cancelled). Everything is checked on the server | **Deployed to dev; checked in a browser on a local copy as a student** (save, reload, deletion request and the admin email); the parent page is covered by tests only | 17 backend and 6 frontend tests (shell test also covers the profile link). Not done yet: the notification choices are stored but nothing reads them yet (only email exists), the parent summary email itself is not built, the institute admin and platform admin profiles are next |
| C2 | **Demo coursework (script):** `backend/scripts/coursework_data/` adds to every open course the same sample PDF and sample video (8-second test video), and a plan of 4 subjects, 3 topics each and 3 sub-topics each (PDF, video, PDF + video + a link), with finish-by dates over the coming weeks (sub-topic, topic and subject; the same subject and topic get the same dates in every course) and about one in eight left as a draft. Commands `plan`, `create`, `status`, `remove` (with `--dry-run`); a course that already has a plan is left alone; everything is tagged so `remove` deletes only it | **Tested live** | 21 script tests. On dev (aaptprep): CAT, CLAT, CUET and IPMAT got 8 files, 45 topics and 135 sub-topics (CAT: 36 sub-topics, 34 published, all dated). The admin Coursework page showed the tree and counts, and a student with CAT access got working links for both sample files (PDF and MP4). See the README in that folder |
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
You should see `792 passed`.

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
| 6 | Sign out, and log in as that student (in a private window if you want both open) | **My Learning** in the top bar |
| 7 | Open **My Learning**, then a sub-topic of that course that has your file attached | The file shows in the sub-topic. **Open** opens a PDF in a new tab. **Play** plays the video on the page, and you can jump around in it (a file is only shown to students once it is attached to a published sub-topic) |
| 8 | As admin, **Remove** the student's access. As the student, reload **My Learning** | The course is gone |
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
| 1 | Click **Add a question** | A form. **Topic** is switched off until a subject is chosen |
| 2 | Choose **Physics**, then a topic | Subjects are grouped as Language, Domain and General. Topics are only those of the chosen subject |
| 3 | Type a question, four options and a reason for each, but repeat one option and mark no correct answer | Both mistakes are shown next to the form, and what you typed stays |
| 4 | Fix them, mark the correct option, set **Published**, click **Save and add another** | "Added question 1 in Physics · Optics." The list below switches to that subject and topic and shows the question with the correct option marked and each reason. The form stays open with the subject, topic, difficulty and status kept, and the rest cleared, ready for the next question |
| 4b | Add a few more the same way, then click **Done** (or use **Save and close** on the last one) | A counter shows how many you added. The form closes |
| 5 | Use the Subject, Topic and Status filters | Only matching questions |
| 6 | **Edit**, change the wording, save. Then **Delete** and confirm | The change shows. The question is gone |

Delete your test questions afterwards. Students can't see this page or these questions.

### Q2 (upload questions from Excel): what to try
On the Question bank page, use the **Upload many questions** card.

| Step | What to do | What you should see |
|---|---|---|
| 1 | Click **Download template** | `question-bank-template.xlsx`: sheets Instructions, Questions (empty, with dropdowns) and Subjects and topics |
| 2 | Fill a few rows (one question per row), make one row wrong (for example a topic from another subject) and repeat one question | |
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
| 4 | Combine it with Subject, Topic or Status | The filters work together |

### Q10 (subjects on a course): what to try
In **Courses** (`/aaptprep/admin/courses`).

| Step | What to do | What you should see |
|---|---|---|
| 1 | Look at the table | A **Subjects** column: CAT, CLAT and IPMAT already show their subjects |
| 2 | Click **Edit** on CAT | A tick list of subjects by section, with the course's subjects ticked and "4 of 43 selected" |
| 3 | Tick or untick some, click **Save** | The Subjects column updates |
| 4 | Under **Add a course**, type `CUET` as the name and click outside the box | All 37 CUET subjects get ticked (you can change them) |
| 5 | Type a name like `Foundation` | Nothing is ticked; choose subjects by hand |

### S3 (students see their results): what to try
Sign in as a student who has finished at least one test.

| Step | What to do | What you should see |
|---|---|---|
| 1 | On the **Tests** page, click **My results** | The totals, a bar chart of recent scores, strengths and weaknesses, and every result |
| 2 | Look at **Strengths and weaknesses** | Subjects and topics with an accuracy bar, weakest first; a "Practise this" tag under 50% |
| 3 | Search or filter **All your results** | The table narrows |
| 4 | Click **Open** on a result | The result of that attempt, with the review if the test allows it |

### S2 (admin sees results): what to try
| Step | What to do | What you should see |
|---|---|---|
| 1 | On the **Tests** page, click the bar-chart icon on a test that students have attempted | The results page: summary tiles and a score-spread strip |
| 2 | Use the search box, the result filter, the sort and **Best per student** | The attempts table narrows and reorders; the count shows "2 of 4 attempts" |
| 3 | Click an attempt row | The attempt opens under the row with every question, the student's answer, the right answer and the reasons |
| 4 | Look at **Question analysis**, click **Hardest first** | Each question's percent correct, and the wrong option chosen most; the hardest on top |
| 5 | Click **Download CSV** | A spreadsheet file of the attempts |

### S1 (students take tests): what to try
Sign in as a student whose course has a published test that is open now (a test shows as Upcoming until its start time).

| Step | What to do | What you should see |
|---|---|---|
| 1 | Click **Tests** in the menu | The tests for your courses, with their state and your attempts |
| 2 | Click **Start** on an open test, then **Start test** | The clock starts; question 1 appears with the numbered palette |
| 3 | Pick options, type an answer to a fill-in question, mark one for review | Blue numbers for answered questions, a dot for the marked one; "Saving…" briefly |
| 4 | Refresh the page | You are back in the same attempt with your answers and the time left |
| 5 | Click **Submit**, then **Yes, submit** | Your marks, percentage and Passed or Not passed, and a review with the right answers and reasons if the test allows it |

### T1 (tests): what to try
Click **Tests** in the menu (publish some questions first: tick them in the Question bank and use Publish selected).

| Step | What to do | What you should see |
|---|---|---|
| 1 | Click **New test**, fill the title, start and end (date and time pickers), duration, maximum attempts, pass percentage, marks for correct (for example 3) and wrong (for example -1) | The fields accept them; a wrong-answer mark above 0 is refused when you save |
| 2 | Tick the courses under **Assign to** | CAT, CLAT, IPMAT and so on |
| 3 | Choose **Manually**, filter or search, tick questions and click **Add** | They move to the list below with the count and total marks; picking a passage question adds its whole passage |
| 4 | Choose **Automatically**, set rules (subject, topic, level, how many) and click **Pick questions** | A random set appears; **Pick again** gives another |
| 5 | Set Status to Published and Save test | It shows in the list with a green dot; try deleting one of its questions in the Question bank and you get a message that it is in a published test |

### Q13 (passages by pasted text): what to try
| Step | What to do | What you should see |
|---|---|---|
| 1 | In **Question bank**, click **Add question**, fill it in and paste a passage into the **Passage** box. Click **Save and add another** | The passage stays filled in for the next question |
| 2 | Write a second question and save | In the list, both questions sit together under the passage, shown once |
| 3 | Click the pencil on the passage header, change the text, **Save passage** | Both questions show the new text |
| 4 | Edit one question and change only its passage text | That question moves to its own group; the other stays |
| 5 | Download the template and paste the same passage text in the **Passage** column of several rows. Upload it | The preview says "1 new passage"; after Import the questions are grouped |

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
**Backend, run on my machine: 864 passed, 0 failed. Frontend: 402 passed, 0 failed. Total: 1266.**

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
| `test_questions` | Q1 question bank (the 37 subjects, checks with all mistakes at once, filters, edit, delete, who may, privacy between institutes) | 32 |
| `test_question_import` | Q2 and Q4 Excel upload (template, preview, import, problems by row and column, duplicates, unreadable files, 500-row limit, privacy, pictures named in the sheet) and Q12 the Subject heading | 41 |
| `test_question_images` | Q3 pictures (who may, types and size, real contents, attach to question and options, replace, remove, delete clean-up, privacy) and Q5 the pictures filter | 41 |
| `test_fill_in` | Q6 fill-in questions (marking rules for text and numbers, checking the admin's answer, the API, switching type, pictures, the Excel columns) | 70 |
| `test_question_status` | Q7 bulk publish (publish, back to draft, counts, bad requests, who may, privacy between institutes) | 15 |
| `test_question_bulk_delete` | Q8 bulk delete (the word DELETE, counts, pictures removed, who may, privacy between institutes) | 19 |
| `test_passages` | Q9 and Q13 reading passages (the API, limits and unique titles, passage text pasted on a question and grouped by text, clean-up of unused passages, privacy, the Excel Passage column) | 45 |
| `test_course_papers` | Q10 subjects on a course (the suggestions by course name, whole-word matching, add and change, bad ids, who may, privacy between institutes) and Q11 courses without a fee | 32 |
| `test_quizzes` | T1 tests (every field and its checks, dates, marks, courses, choosing questions by hand, passages kept together, random picking and its repeatability, questions used by tests, who may, privacy between institutes) | 79 |
| `test_student_tests` | S1 students taking tests (which tests a student sees, the window in India time, starting and resuming, attempt limits, saving and clearing answers and what is refused, the clock and the grace seconds, auto-submit, scoring for choice, fill-in, decimal and negative marks, the review and its absence, frozen rules, privacy between students and institutes) | 44 |
| `test_admin_results` | S2 the admin's results (summary and buckets, attempt rows, unfinished and timed-out attempts, question analysis, one student's attempt with the full review, the attempt counter, deleting a test with attempts, who may, privacy between institutes) | 16 |
| `test_my_results` | S3 a student's results across tests (totals, passed by best attempt, rows newest first, the ten-attempt trend, accuracy by subject and topic and its order, fill-in, unfinished and timed-out attempts, attempts without topic counts, privacy, who may) | 12 |
| | **Total** | **864** |

| Frontend test file | What it covers | Tests |
|---|---|---|
| `core.spec` | Who is signed in per institute, the interceptor, colours, errors, guards, fees, dates, sizes, the upload service | 38 |
| `register.spec` | Registration page | 16 |
| `login.spec` | Login page: status messages, Register buttons, code step, countdown, redirects by role | 23 |
| `admin-registrations.spec` | Queue, details, decisions, editing a student, course access | 35 |
| `admin-courses.spec` | Courses list, add, edit, hide, subjects on a course | 19 |
| `admin-course-files.spec` | Files page: list, upload with progress, refusals, delete | 13 |
| `my-courses.spec` | Student's courses: open a PDF, play a video, renew a link, access ended | 10 |
| `platform-admin.spec` | Institutes page: list, add, edit, admin replacement, logos | 33 |
| `shell.spec` | Page frame, logo in the top bar, student home, start page, not found | 20 |
| `admin-questions.spec` | Question bank page: list, subject and topic dropdowns, add, field errors, edit, delete, filters, adding several in a row, upload card, pictures, pictures filter, fill-in questions, bulk publish, bulk delete, reading passages | 61 |
| `question-upload.spec` | Bulk upload (template download, one or many Excel files, zip with pictures and clutter, picture limits and failures, combined preview, problems per file, import in order, partial failures, clean-up of unused pictures) | 17 |
| `picture-picker.spec` | Picture picker: upload in three steps, remove, wrong type, too big, server refusals | 10 |
| `ui.spec` | The icon kit (every icon draws, sizes, the info tip, short access wording) | 5 |
| `admin-tests.spec` | Tests page (list, search and filters, results link, form with date pickers and courses, picking by hand with filters, passages brought along, automatic rules, errors, edit, publish, delete) | 23 |
| `student-tests.spec` | S1 student list (with the switch to results), intro and attempt pages | 16 |
| `take-test.spec` | S1 taking a test (countdown, palette, saving and retrying, typing pause, clearing, marking for review, submit, time up, finished by the server) | 15 |
| `test-result.spec` | S1 result and review | 8 |
| `admin-test-results.spec` | S2 results page (summary, bars, table, search, filters, best per student, sorting, opening an attempt, question analysis, CSV, empty and error states) | 14 |
| `csv.spec` | S2 the CSV writer (quotes, formula safety, blanks) | 5 |
| `student-results.spec` | S3 the My results page (switch, tiles, trend bars, subjects and topics, table, search and filter, empty and error states) | 11 |
| | **Total** | **402** |

**F1 in a real browser, against the sandbox:** I registered a student through the form (the empty form showed every mistake, then a `+91` mobile was accepted), saw "pending" at login, signed in as the admin with a code from the sandbox log, opened details, approved (email in the log), rejected with a reason (email includes it), edited a course to 180 days, signed out and signed in as the new student, was sent back from an admin address, saw the unknown and switched-off institute pages, and checked a phone-sized window.

**F1 against the live dev API:** the page showed the real institute's name, **AaptPrep**, and its real courses. I registered a clearly labelled test student, approved it from the admin screen ("We emailed them"), saw no email failures in the Lambda log, and **removed the test student afterwards**. For the admin screen I used a session made with the dev signing key, since the real admin login was proven in M2.

**Three problems the browser found that the tests had missed, all fixed:**
1. The admin pages sat against the left edge, because only the register and login cards had a page container. Now every page is inside one.
2. The institute's name in the top bar linked to `/demo/admin%2Fregistrations` (a slash escaped), because I gave the address as one piece. Now each part is separate, and a test checks the address.
3. After a failed submit, the red message under a field stayed even after fixing it. Now it clears when you edit that field, and the summary goes when none are left.


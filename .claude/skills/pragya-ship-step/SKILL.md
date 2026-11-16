---
name: pragya-ship-step
description: Build, verify and ship one step of PragyaPrep.ai work end to end, the way every step so far was done. Use this whenever the user says yes to a planned step, or asks to build, add, fix or change anything in the PragyaPrep.ai backend (FastAPI, DynamoDB, S3), frontend (Angular), or infra, or says "deploy to dev", "test it live", "update the status", "commit and push". It covers tests, a real-browser check, deploy to the dev AWS account, a live test with clean-up of the test data, doc updates, and committing only when asked.
---

# Ship a PragyaPrep.ai step

Every step follows the same loop. The reason for the loop is that the user does not want to be asked to test something I have not tested myself, and every earlier step found a real bug in the browser or on dev that the unit tests had missed.

Read `references/dev-environment.md` before the deploy and live-test parts (commands, ids, the clean-up rules). Read `references/doc-templates.md` before writing docs.

## The loop

1. **Plan.** Put the steps on the task list. If `pragya-next-step` has not scoped this work, do that first. A large or ambiguous change is confirmed with the user before building.
2. **Read the code you will touch.** Match the surrounding style. The conventions below matter more than any personal preference.
3. **Backend first** (`backend/app/`): logic in a module, a thin router, schemas, then tests. Run the whole suite, not just the new file.
4. **Frontend** (`frontend/src/app/`): models, API method, page, route, then specs. Run `npx ng build --configuration development` and the whole test suite.
5. **Real browser check** against the sandbox (or live frontend for anything that touches S3). Unit tests have repeatedly missed layout, links and real network behaviour. Take a screenshot of anything visual.
6. **Deploy to dev** and **test live** with a clearly named test record, then **clean up everything you created** (see the reference).
7. **Update the docs** (status row, counts, how-to-test table, features, a numbered design section).
8. **Wrap up with a summary** the user can read in a minute: what changed, what was checked, what was not, and what is left. Say which test data was removed and mention anything in dev that was not yours and was left alone.
9. **Commit and push only when the user asks.** When they do, do it without commentary and move on.

## Conventions that keep the code consistent

- **Tenant isolation.** Tenant data is reached only through `repo.scoped(slug)`, so keys always carry the tenant prefix. A person or file from another institute is "not found", never "forbidden".
- **Plain messages.** Every error the user can see is a short plain sentence. Forms report every mistake at once, field by field. The server is the judge of forms; the page shows what it says.
- **No delete in the platform API.** A test enforces it, so removals there are `POST .../remove`. Institute and admin changes never delete rows.
- **Uploads** go straight to S3 with a signed form, then the API checks the first bytes of the file and deletes it if it is not what its ending says. Files live under `<institute>/...`.
- **Time** comes from `app.clock`, so tests can move it. Use the fake clock fixture and advance it between actions that need an order.
- **Emails** never make an action fail: use `send_quietly` and report whether it went out.
- **Comments** are written for a beginner, on every section of every file, in plain words. This overrides the usual "no comments" habit.
- **Shell commands** shown to the user have no `#` comments, so they can be copied straight in. Each command is in its own fenced block.

## Checking in the browser

The built-in browser cannot pick files and does not always trigger Angular's form binding. The reference lists the workarounds that worked (injecting a session, attaching files from a page script, reading results with a script). Stop servers you started when you are done.

## When something fails

Report it plainly with the output. If a test fails, fix the cause before moving on rather than weakening the test, unless the test itself is wrong, in which case say so. If a deploy or an AWS call fails because the login expired, ask the user to run the SSO login command from the reference and wait.

## Safety on shared dev data

The dev table and bucket hold real data (the real institute, its courses, and registrations the user made while testing). Only delete rows and files you created, found by a marker in the key such as `zz`, and list them before deleting. Never run the legacy wipe script. Do not commit or push without being asked, and never skip the clean-up, even if the live test fails half-way.

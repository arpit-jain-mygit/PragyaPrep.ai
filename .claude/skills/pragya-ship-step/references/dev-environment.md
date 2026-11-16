# Dev environment: commands, ids and clean-up

Everything below was used and worked during Phase 1. Check a command still exists before relying on it.

## Contents
- Where things are
- Running tests
- Sandbox and the browser
- AWS login and deploy
- Live test on dev
- Clean-up

## Where things are

| Thing | Value |
|---|---|
| Repo root | `PragyaPrep.ai/` (its own git repo, remote `arpit-jain-mygit/PragyaPrep.ai`) |
| Backend | `backend/` (Python venv at `backend/.venv`, run with `PYTHONPATH=.`) |
| Frontend | `frontend/` (Angular, Vitest through `ng test`) |
| Infra | `infra/scripts/deploy.sh`, stacks under `infra/envs/dev/` |
| AWS | account `552808407801`, region `ap-south-1`, SSO profile `pragyaprep-dev` |
| Dev API | `https://byk6esj2muxebponlkbnsark540cqwpn.lambda-url.ap-south-1.on.aws` |
| Table | `pragyaprep-dev` |
| Bucket | `pragyaprep-content-dev-552808407801` (files under `<institute>/...`) |
| Lambda log group | `/aws/lambda/pragyaprep-dev-api` |
| Secrets file | `~/.config/pragyaprep/main-dev.env` (holds `TF_VAR_secret_key`; never print it) |
| Real people on dev | platform admin `sachin.arpit@gmail.com`; AaptPrep admin `sachin.arpit.learning@gmail.com` |

## Running tests

```bash
cd backend && PYTHONPATH=. .venv/bin/python -m pytest -q
```

```bash
cd frontend && npx ng test --watch=false
```

```bash
cd frontend && npx ng build --configuration development
```

Backend tests use moto (a fake AWS) and a movable clock. Frontend tests use jsdom. When a frontend test needs the real upload service replaced, spy on the instance with `vi.spyOn(TestBed.inject(UploadService), 'send')`, because providers can't be overridden after `setupTestBed`.

## Sandbox and the browser

The launch entries live in the workspace's `.claude/launch.json` (one folder above the repo): `pragyaprep-api-sandbox` (port 8001), `pragyaprep-frontend` (4201, sandbox) and `pragyaprep-frontend-live` (4201, live dev API). Start them with `preview_start`. Port 8000 is often taken by an old process.

Sandbox data: institute `demo` (admin `demo-admin@example.com`), `closed` (suspended), platform admin `owner@example.com`, students `student@`, `pending@`, `pending2@`, `rejected@`, `suspended@example.com`. Login codes print in the sandbox's log. The sandbox's S3 is fake, so a real upload only works against the live dev API.

Browser tips that worked:
- Open the page once with `?api=http://localhost:8001` so it talks to the sandbox on 8001.
- To sign in without the email step, call `verify-code` from the page with `fetch`, then store `{session, expiresAt}` under `localStorage['pragyaprep.session.<institute>']`.
- For live dev, mint a token (below) into a JSON file, serve the folder with a tiny local Python server that adds `Access-Control-Allow-Origin: *`, and have the page fetch the JSON and store it. This keeps tokens out of chat.
- Attach a file to an `<input type=file>` from a script: fetch the file from the local server, build a `File`, put it in a `DataTransfer`, set `input.files`, and dispatch a `change` event.
- `form_input` sometimes doesn't update Angular's model. Prefer clicking and typing, or `find` then `form_input`, and check with a script.
- A hot reload (after editing a file) closes open forms. Re-open them.
- Read results with a script (`querySelectorAll`) when a screenshot is stale. Use screenshots for anything visual.

## AWS login and deploy

Check the login first:

```bash
AWS_PROFILE=pragyaprep-dev aws sts get-caller-identity --query Account --output text
```

If it says the token expired, ask the user to run this (it opens a browser, so only they can):

```bash
aws sso login --profile pragyaprep-dev
```

Deploy the backend (rebuilds the Lambda zip and applies):

```bash
infra/scripts/deploy.sh main dev --yes
```

For data created before a feature existed, run a script against dev with `AWS_PROFILE=pragyaprep-dev PRAGYA_TABLE_NAME=pragyaprep-dev PYTHONPATH=.` from `backend/`, for example `scripts/manage_tenants.py link-admin --slug aaptprep --email ...`.

## Live test on dev

1. Mint a short-lived session token with the dev key (source the secrets file, then call `app.security.create_token(secret, email, 'session', ttl_seconds, tenant=slug, role=role)`). Use a role and email that really exist.
2. Use a test person such as `sachin.arpit.learning+zzNAME@gmail.com` (a plus-address of the real admin, so any email arrives in a real inbox) and names starting with `ZZ`.
3. Call the API with `curl` and the header `X-Tenant: <institute>`. For S3 uploads, post the signed form with `curl -F` for each field and the file last. The system Python has no `requests`.
4. After the run, look at the Lambda log: `aws logs tail /aws/lambda/pragyaprep-dev-api --since 30m | grep -ci "error\|traceback"` should print 0.

## Clean-up

Delete only what the test created.

- Files and logos: use the API's own delete or remove calls first (they also delete the S3 object).
- Rows: scan the table with boto3 and delete items whose `PK` contains your marker (for example `zzstudent`). Print what you will delete, then delete. A person's access rows share their `PK`, so they go with the person.
- Check the bucket afterwards: `aws s3 ls s3://pragyaprep-content-dev-552808407801/<institute>/ --recursive`. Objects you did not create (for example the user's own test uploads) stay.
- Rate-limit rows (`RATE#...`) expire on their own. Leave them.
- Stop preview servers and any local helper server, and delete any token JSON files from the scratchpad. Clear `localStorage` in the browser tab.

# PragyaPrep frontend

The screens, built with Angular. Each institute's pages live under its short name, for example `/aaptprep/login`.

## Run it on your computer

You need two terminal windows.

**1. The API (a local test version with a fake AWS and no real email):**

```bash
cd backend
PYTHONPATH=. .venv/bin/python scripts/dev_server.py
```

Login codes and emails are printed in this window.

**2. The screens:**

```bash
cd frontend
npm install        # first time only
npm start
```

Open <http://localhost:4200/demo>. The demo institute has an admin (`demo-admin@example.com`), approved, pending, rejected and suspended students, and the courses CLAT, IPMAT and CAT.

If port 8000 is busy, start the API with `PORT=8001 PYTHONPATH=. .venv/bin/python scripts/dev_server.py`, then open `http://localhost:4200/demo/login?api=http://localhost:8001` once. The tab remembers the address.

## Run it against the live dev environment in AWS

```bash
cd frontend
npx ng serve --configuration live
```

Open <http://localhost:4200/aaptprep>. This uses the real API, the real data and real email.

## Tests

```bash
npx ng test --watch=false
```

## Build for production

```bash
npx ng build
```

The output is in `dist/frontend/browser`. To put it on the dev website (S3 and CloudFront), run `infra/scripts/deploy-web.sh main dev` from the repo root. It builds, copies and clears the cache. The website is at https://d1szng4oy9m4an.cloudfront.net.

## How it is organised

| Folder | What is in it |
|---|---|
| `src/app/core` | Talking to the API, who is signed in, the institute's look, the guards that protect pages |
| `src/app/pages` | One file per screen: start page, register, login, student home and My courses, admin registrations, courses and course files, the platform admin's institutes page, and the page frame |
| `src/environments` | Which API to use: the local test version, or the live one |

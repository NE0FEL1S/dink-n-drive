# Dink n' Drive — Setup Guide (do these by hand)

You need: Node.js 20 or newer, Git, a GitHub account, a Supabase account, and Claude Code installed.

Dashboard menu names can shift slightly over time; if a label differs, look for the closest match.

---

## Part 1 — Create the app and the GitHub repo

1. **Create the Next.js app** (in the folder where you keep projects):
   ```bash
   npx create-next-app@latest dink-n-drive --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
   ```
   Accept the defaults for any other questions.

2. **Add the planning files.** Copy `CLAUDE.md` into the root of `dink-n-drive/`, and `SPEC.md` + `SETUP.md` into a new `docs/` folder:
   ```
   dink-n-drive/
   ├── CLAUDE.md
   ├── docs/
   │   ├── SPEC.md
   │   └── SETUP.md
   └── src/ ...
   ```

3. **Create the GitHub repo:** github.com → **+** → **New repository**
   - Name: `dink-n-drive`
   - Public (good for your portfolio — keys never go in the repo)
   - Do **not** add a README, .gitignore, or license (the app already has them)
   - **Create repository**

4. **Push the project:**
   ```bash
   cd dink-n-drive
   git add .
   git commit -m "Initial Next.js app with project spec"
   git branch -M main
   git remote add origin https://github.com/<your-username>/dink-n-drive.git
   git push -u origin main
   ```

---

## Part 2 — Create the Supabase project

1. supabase.com/dashboard → **New project**
   - Organization: your personal org
   - Name: `dink-n-drive`
   - Database password: click **Generate**, then save it in your password manager (you'll need it to link the CLI)
   - Region: **Southeast Asia (Singapore)** — closest to Cebu
   - Plan: **Free**
   - **Create new project** (takes ~2 minutes)
   - Note: the free plan allows 2 active projects. If you already have 2, pause one you aren't using.

2. **Copy your keys:** Project Settings → **API Keys** (and **Data API** for the URL)
   - Project URL — `https://<project-ref>.supabase.co`
   - **Publishable key** (`sb_publishable_…`, older name: anon key) — safe for the browser
   - **Secret key** (`sb_secret_…`, older name: service_role key) — server only, never share
   - The `<project-ref>` is the random ID in your project URL; you'll need it below.

3. **Create `.env.local`** in the project root:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SECRET_KEY=sb_secret_...
   ```
   `.env.local` is already ignored by Git. Never commit it.

4. **Email sign-in:** Authentication → **Sign In / Providers** → **Email**
   - Enabled: on
   - **Confirm email: off** (we're not sending emails in v1)
   - Save

5. **Site URL:** Authentication → **URL Configuration**
   - Site URL: `http://localhost:3000`
   - Redirect URLs → add `http://localhost:3000/**`
   - (After deploying, add your Vercel URL here too.)

---

## Part 3 — Google sign-in (not used)

Dropped in spec v1.5: the site uses **email + password only**. Leave Google (and every other provider) **disabled** in Supabase → Authentication → Sign In / Providers. Nothing to do here.

---

## Part 4 — Link the Supabase CLI (Claude Code will ask for this in Phase 1)

```bash
npx supabase login
npx supabase init          # only if Claude Code hasn't already
npx supabase link --project-ref <project-ref>
```
It will ask for the database password from Part 2.

Supabase CLI v3 targets a **local** database by default. For this project's remote database always pass `--remote` (e.g. `npx supabase db push --remote`).

---

## Part 5 — Start building with Claude Code

```bash
cd dink-n-drive
claude
```
First message:
> Read CLAUDE.md and docs/SPEC.md, then start Phase 1. Stop when the phase is done.

---

## Part 5b — Make yourself the owner (after Phase 1 is applied)

1. Run the app (`npm run dev`) and sign in once with the account that should be the owner.
2. Supabase dashboard → **SQL Editor** → run (replace the email):
   ```sql
   update public.profiles set role = 'owner' where email = 'you@example.com';
   ```
3. Sign out and back in. `/admin` should now open.

Customers can never change their own role; this SQL step is the only way to create an owner.

---

## Part 6 — Connect Vercel (done at the start of Phase 2)

1. vercel.com → **Add New → Project** → import `dink-n-drive` from GitHub (team "PRISM TECHNOLOGY", Hobby).
2. Add the three environment variables from `.env.local` for **Production and Preview** (mark `SUPABASE_SECRET_KEY` sensitive).
3. Deploy. Then **Settings → Deployment Protection → Vercel Authentication: off**, so preview links (staging, PRs) open without a Vercel login. The e2e tests need this.
4. Supabase → Authentication → URL Configuration → **Redirect URLs**: add `https://dink-n-drive.vercel.app/**` and `https://*-prism-technology.vercel.app/**`. Keep Site URL on `http://localhost:3000` until the Phase 7 launch.

URLs:
- Production (`main`): https://dink-n-drive.vercel.app
- Staging (`staging`): https://dink-n-drive-git-staging-prism-technology.vercel.app
- Each PR branch: `dink-n-drive-git-<branch>-prism-technology.vercel.app` (Vercel posts the link on the PR)

At the Phase 7 launch: set Supabase **Site URL** to the production URL (see Part 8).

---

## Part 7 — Testing (end-to-end, Playwright)

The tests run in a phone-sized iPhone (WebKit), an Android phone (Chromium) and desktop Chrome, against the one Supabase project. Every user and booking they create is tagged `e2e+<run>-…@dinkndrive.test` and deleted when the run ends (leftovers from crashed runs are deleted at the start of the next run, after an hour).

**On GitHub (automatic).** `.github/workflows/e2e.yml` runs on every push to `staging` (so after you merge a PR): it waits until the staging URL serves the pushed commit (`/api/version`), then runs the suite. Docs-only changes and code that already passed are skipped; a newer push cancels the older run. Failed runs upload a `playwright-report` artifact (Actions → the run → Artifacts).

One-time setup — GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**, add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | same as in `.env.local` |
| `SUPABASE_SECRET_KEY` | same as in `.env.local` |

CI deliberately has **no publishable key**, so test files may import only site code that never loads `src/lib/supabase/env.ts` (`src/lib/booking-time`, `src/lib/format`, `src/types`). `npm run lint` enforces this: one bad import stops the whole run before any test starts (that broke CI from PR #20 to #39).

**No Vercel Toolbar on staging.** The toolbar (comments bubble) sits over buttons on phone screens and makes tests fail. Vercel → project → **Settings → Environment Variables**: `VERCEL_PREVIEW_FEEDBACK_ENABLED` = `0`, environment **Preview**, branch **staging** (PR previews of other branches keep the toolbar). It takes effect on staging's next deployment.

**On your computer.**
```bash
npx playwright install chromium webkit   # once
npm run test:e2e                          # starts `npm run dev` if it isn't running
npx playwright test --project=iphone      # one device only
E2E_BASE_URL=https://dink-n-drive-git-staging-prism-technology.vercel.app npm run test:e2e   # against staging
npx playwright show-report                # open the last report
```

If the first run after starting a fresh `npm run dev` fails at sign-in for one device (the login button keeps spinning), that's `next dev` compiling the admin pages for the first time. Run the tests again, or start `npm run dev` yourself and open a page or two before running them. Staging (a real build) doesn't have this.

The GCash QR replacement test is off by default (it swaps the real payment QR and puts it back). Run it on purpose with `E2E_QR_TEST=1 npx playwright test e2e/admin/settings.spec.ts --project=desktop`. Afterwards the old QR file is kept as "the previous one", so other deployments with cached settings still show a working QR.

Admin tests use days 60–360 days ahead (`freeAdminDay()`), outside the 30-day customer window, so they don't take the empty days the booking tests need (`freeTestDay()`). `supabase/checks/booking_checks.sql` also picks a day with nothing booked (5–29 days ahead), so it can run while tests are running.

---

## Part 8 — Go live (Phase 7 launch)

The database is shared by local, staging and production, so every migration is already live; going live is about the app and the settings around it.

**Before the `staging` → `main` PR**
- [ ] CI on `staging` is green (GitHub → Actions → the latest `e2e` run).
- [ ] Vercel → project → Settings → Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` are set for **Production** (checked 2026-11-24).
- [ ] Supabase → Authentication → **URL Configuration**:
  - Site URL: `https://dink-n-drive.vercel.app`
  - Redirect URLs keep `http://localhost:3000/**`, `https://dink-n-drive.vercel.app/**` and `https://*-prism-technology.vercel.app/**`
- [ ] Supabase → Authentication → Sign In / Providers → Email: **Confirm email** stays **off** (no emails in v1).
- [ ] Supabase → Authentication → Policies (Attack Protection): turn on **Leaked password protection** if your plan offers it (it may need the Pro plan; skip it on Free).
- [ ] Supabase → Integrations → Cron: the job `expire-unpaid-holds` runs every minute and is active (checked 2026-11-24). Without it, unpaid holds never free their hours.

**Deploy**
1. Open a PR `staging` → `main` (Claude Code does this only when you say so) and merge it. Vercel deploys `main` to https://dink-n-drive.vercel.app.
2. Check the deployed commit: `https://dink-n-drive.vercel.app/api/version` shows the merge commit of that PR.
3. Smoke test production (creates and deletes tagged test data, like every run):
   ```bash
   E2E_BASE_URL=https://dink-n-drive.vercel.app npx playwright test e2e/smoke
   ```
4. On your own phones: open the site, book an hour as a guest, cancel it (unpaid), and check the keyboard doesn't cover the field you're typing in the booking popup and in Admin → Settings.

**Before the court owner uses it for real**
- **Hosting:** Vercel Hobby is for non-commercial use only. Upgrade the project to **Vercel Pro** (about $20/month) or move to a host whose free plan allows commercial use.
- **Database:** Supabase Free pauses a project after 7 days with no activity and has no point-in-time backups. A busy court keeps it awake; for daily backups and no pausing, use **Supabase Pro** (about $25/month).
- **Owner account:** the owner signs up on the site, then run Part 5b with their email. Remove the developer's owner role when handing over:
  ```sql
  update public.profiles set role = 'customer' where email = 'developer@example.com';
  ```
- **Settings:** the owner checks Admin → Settings (court name, prices, opening hours, hold time, cancellation cutoff and fee, booking window) and the **GCash QR**, which must be their own account's QR.
- **Custom domain (optional):** Vercel → Settings → Domains. Then put the new domain in Supabase **Site URL** and add `https://<domain>/**` to **Redirect URLs**.
- **Forgotten passwords:** customers message the owner, who sets a new password in Admin → Customers after checking the phone number on the account (no emails in v1).

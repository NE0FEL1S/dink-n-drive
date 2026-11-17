# Dink n' Drive — Setup Guide (do these by hand)

You need: Node.js 20 or newer, Git, a GitHub account, a Supabase account, a Google account, and Claude Code installed.

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

## Part 3 — Google sign-in

1. console.cloud.google.com → project picker → **New project** → name `dink-n-drive` → Create, then select it.
2. **APIs & Services → OAuth consent screen** (may appear as **Google Auth Platform**)
   - App name: `Dink n' Drive`
   - User support email + developer contact: your email
   - Audience / user type: **External**
   - Scopes: the defaults (email, profile, openid) are enough
3. **Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Create → copy the **Client ID** and **Client secret**
4. Back in Supabase: Authentication → **Sign In / Providers** → **Google** → enable, paste Client ID and Client secret → Save.
5. **Publish the app:** in the OAuth consent screen / Audience page, click **Publish app** so anyone can sign in. While it's in "Testing", only test users you add can log in. With only the basic email/profile scopes, Google doesn't require a review.

---

## Part 4 — Link the Supabase CLI (Claude Code will ask for this in Phase 1)

```bash
npx supabase login
npx supabase init          # only if Claude Code hasn't already
npx supabase link --project-ref <project-ref>
```
It will ask for the database password from Part 2.

---

## Part 5 — Start building with Claude Code

```bash
cd dink-n-drive
claude
```
First message:
> Read CLAUDE.md and docs/SPEC.md, then start Phase 1. Stop when the phase is done.

---

## Part 6 — Later (Phase 7): Deploy to Vercel

1. vercel.com → **Add New → Project** → import `dink-n-drive` from GitHub.
2. Add the three environment variables from `.env.local`.
3. Deploy, then copy the Vercel URL into:
   - Supabase → Authentication → URL Configuration (Site URL + Redirect URLs)
   - Google Cloud → OAuth client → Authorized JavaScript origins

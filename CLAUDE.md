# Dink n' Drive — Pickleball Court Booking Website

Booking site for a single pickleball court in Cebu, Philippines, with a community feed, a public feedback page, and an owner admin dashboard. Portfolio project that may be handed to the real court owner.

**The full spec is in `docs/SPEC.md`. Read it before starting any phase.** Setup steps the developer does by hand are in `docs/SETUP.md`.

**UI design guide is in `docs/DESIGN.md`** (colors, type, components, mobile checklist). Follow it for all UI work; it is built from the images in `docs/reference/UI reference/`.

**Reference material is in `docs/reference/`** (designs, screenshots, brand assets, copy, owner notes). Check it before each phase, especially before any UI work, and follow it. If a reference conflicts with the spec, ask. `docs/reference/private/` is git-ignored: read it, but never copy its contents into committed files (e.g. the real GCash QR belongs in Supabase Storage, not `public/`).

## Stack
- Next.js (App Router) + TypeScript (strict), Tailwind CSS, `src/` directory, `@/*` import alias
- Supabase: Postgres, Auth (Google + email/password), Storage, RLS, pg_cron — use `@supabase/ssr`
- Hosting: Vercel · Repo: GitHub
- Exports: `exceljs` (.xlsx), `jspdf` + `jspdf-autotable` (PDF) · Uploads compressed with `browser-image-compression`

## Commands
- `npm run dev` — local dev at http://localhost:3000
- `npm run build` / `npm run lint` — run both before saying a phase is done
- `npx supabase migration new <name>` — create a migration in `supabase/migrations/`
- `npx supabase db push` — apply migrations to the linked remote project
- `npx supabase gen types typescript --linked > src/types/database.ts` — regenerate DB types after schema changes

## Core business rules (details in docs/SPEC.md)
- One court. Open 8:00 AM – 12:00 AM daily, Asia/Manila time.
- Bookings are **whole consecutive hours on the hour** (8–9, 8–11; never 9:15). Minimum 1 hour, **no maximum**, cannot pass closing.
- ₱250 per hour. Paddle rental: flat ₱50 per booking that rents paddles, every booking (extensions are new bookings and pay it again).
- Bookable up to 30 days ahead; max 2 unpaid bookings at once **per phone number**.
- Payment: GCash QR shown on site → customer uploads screenshot → owner approves/rejects. Unpaid bookings expire after 15 minutes.
- Unpaid bookings cancel free and instantly any time. Paid bookings: the customer sends a **cancellation request** (with GCash name + number) up to 3 hours before start; the owner approves or declines. Approved → ₱100 fee (saved on the booking at creation) kept, rest refunded manually via GCash; the fee counts as earnings once the refund is marked completed.
- Owner can block hours (stored as `bookings` rows with `kind = 'block'`) and cancel any booking any time with a full refund.
- **Guests can book without an account** (name, email, PH mobile in the booking popup; device-token cookie links the booking to that browser for My Bookings). Signed-in users get details prefilled. Login is required to post, comment, react, give feedback. Browsing is public.
- Prices, hours, hold time, cutoff, fees come from the `settings` table — never hardcode them in UI or logic.

## Conventions
- **Database is the source of truth for rules.** Double-booking prevention uses a `btree_gist` exclusion constraint on `tstzrange(start_at, end_at)` for active statuses. Booking creation, booking limits, cancellation cutoff, and refund amounts run in Postgres functions (`security definer` where needed), not only in the UI.
- **RLS on every table**, no exceptions. Customers read/write only their own rows; public feeds expose only non-sensitive columns; owner role checked via `profiles.role`.
- Never expose customer phone/email or payment screenshots publicly. Availability comes from a function returning time ranges only. Guests are anonymous to Supabase: guest actions (create booking, upload proof, request cancellation, list My Bookings) go through server actions + `security definer` functions that verify the device token hash; never open tables or storage to anonymous writes.
- Money = integer pesos. Timestamps = `timestamptz`; convert to Asia/Manila for display only.
- Each booking stores the rates it was created with (`hourly_rate`, `court_fee`, `paddle_fee`, `total`).
- Soft delete (`deleted_at`) for posts, comments, feedback.
- Schema changes only through new migration files. Never edit a migration that has already been pushed.
- Server Components by default; Server Actions for mutations; validate inputs with `zod`.
- Next.js 16: route protection lives in `src/proxy.ts` (the `middleware` file convention was renamed to `proxy`). Check `node_modules/next/dist/docs/` before using any Next.js API.
- The Supabase secret/service-role key is used only in server code (`src/lib/supabase/admin.ts`), never in client components or `NEXT_PUBLIC_*` vars.
- Never commit `.env.local` or any keys.
- Mobile-first UI; most customers book from their phones (iPhone and Android). Build at 360–430 px first and apply the iPhone & Android checklist in `docs/DESIGN.md` §7 on every screen.

## Out of scope for v1 — do not build
Email sending of any kind, forgot/change password, booking emails, online payment gateways, multiple courts.

## Git workflow
- Branches: `main` (production, deployed) ← `staging` (integration/testing) ← work branches (`phase-1/supabase-setup`, `fix/...`, `docs/...`).
- Start every piece of work on a new branch cut from `staging`. Never commit directly to `main` or `staging`.
- When a phase or fix is done (build + lint pass), merge the work branch into `staging` and push `staging`.
- `staging` is merged into `main` only after the developer has reviewed/tested it and says so.
- Never force-push `main` or `staging`.

## How to work
- Build **one phase at a time** (list below). At the end of each phase: run build + lint, summarize what changed and anything the developer must do by hand (e.g. Supabase dashboard settings), then **stop and wait for review** before the next phase.
- If something in the spec is unclear or conflicts, ask instead of guessing.
- Update the checkboxes below as phases are completed.

## Phases
- [ ] 1. Setup: schema, RLS, storage buckets, auth (Google + email), profile completion, owner role
- [ ] 2. Booking flow: hourly grid with multi-hour selection, paddle logic, payment-proof upload, holds/expiry, My Bookings
- [ ] 3. Admin: payment queue, bookings table + filters, summary cards, Excel/PDF exports, settings
- [ ] 4. Cancellation & refund flow (customer + admin)
- [ ] 5. Community feed: posts, photos, reactions, comments, moderation
- [ ] 6. Public feedback: reuse community components + status, replies, anonymous option
- [ ] 7. Customers tab + owner-assisted reset, earnings chart, mobile polish, testing, Vercel deploy

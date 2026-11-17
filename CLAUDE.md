# Dink n' Drive — Pickleball Court Booking Website

Booking site for a single pickleball court in Cebu, Philippines, with a community feed, a public feedback page, and an owner admin dashboard. Portfolio project that may be handed to the real court owner.

**The full spec is in `docs/SPEC.md`. Read it before starting any phase.** Setup steps the developer does by hand are in `docs/SETUP.md`.

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
- ₱250 per hour. Paddle rental: flat ₱50 per booking; ₱0 if it carries over from the same customer's booking ending at this start time.
- Payment: GCash QR shown on site → customer uploads screenshot → owner approves/rejects. Unpaid bookings expire after 15 minutes.
- Cancel up to 3 hours before start; ₱100 fee kept, rest refunded manually via GCash by the owner.
- Login required to book, post, comment, react, give feedback. Browsing is public.
- Prices, hours, hold time, cutoff, fees come from the `settings` table — never hardcode them in UI or logic.

## Conventions
- **Database is the source of truth for rules.** Double-booking prevention uses a `btree_gist` exclusion constraint on `tstzrange(start_at, end_at)` for active statuses. Booking creation, paddle carry-over, cancellation cutoff, and refund amounts run in Postgres functions (`security definer` where needed), not only in the UI.
- **RLS on every table**, no exceptions. Customers read/write only their own rows; public feeds expose only non-sensitive columns; owner role checked via `profiles.role`.
- Never expose customer phone/email or payment screenshots publicly. Availability comes from a function returning time ranges only.
- Money = integer pesos. Timestamps = `timestamptz`; convert to Asia/Manila for display only.
- Each booking stores the rates it was created with (`hourly_rate`, `court_fee`, `paddle_fee`, `total`).
- Soft delete (`deleted_at`) for posts, comments, feedback.
- Schema changes only through new migration files. Never edit a migration that has already been pushed.
- Server Components by default; Server Actions for mutations; validate inputs with `zod`.
- The Supabase secret/service-role key is used only in server code (`src/lib/supabase/admin.ts`), never in client components or `NEXT_PUBLIC_*` vars.
- Never commit `.env.local` or any keys.
- Mobile-first UI; most customers book from their phones.

## Out of scope for v1 — do not build
Email sending of any kind, forgot/change password, booking emails, online payment gateways, multiple courts.

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

# Dink n' Drive

Booking site for a single pickleball court in Luyang, Cebu (Philippines): hourly court booking with GCash payment, a community photo feed, a public feedback board, and an admin dashboard for the court owner. Built mobile-first, because most players book from their phones.

**Live:** https://dink-n-drive.vercel.app

## What it does

- **Book the court** without an account: pick a day, tap a start hour and extend over free hours, rent paddles, then pay by scanning the court's GCash QR and uploading the receipt. Unpaid holds expire after 15 minutes.
- **My bookings:** upcoming and past games, cancel unpaid bookings, request a refund for paid ones (with the owner's cancellation fee and cutoff). Guests see the bookings made in their browser; accounts see theirs on any device.
- **Community and feedback:** photo posts, reactions and comments; feedback with status (Open / In progress / Resolved), public owner replies and an anonymous option.
- **Admin:** payment review queue, bookings table with filters and Excel/PDF exports, earnings summary and chart, block hours, cancellation and refund workflow, customers grouped by phone number with an owner-assisted password reset, feedback inbox, moderation, and every price and rule in Settings.

## Stack

Next.js 16 (App Router, Server Components and Server Actions) · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth, Storage, pg_cron) · Vercel · Playwright

## How it's built

- **The database enforces the rules.** Double booking is impossible through a `btree_gist` exclusion constraint on booking time ranges. Booking creation, limits, holds, cancellation cutoffs and refund amounts live in Postgres functions, not only in the UI. Prices and hours come from a settings table, and each booking stores the rates it was made with.
- **Row-level security on every table.** Guests are anonymous to Supabase: their actions go through server actions and `security definer` functions that check a hashed device token. Payment receipts sit in a private bucket; public feeds expose only non-sensitive columns.
- **Tested end to end** on an iPhone (WebKit), an Android phone (Chromium) and desktop Chrome, against the staging deployment on every merge, plus rolled-back SQL check suites for every database function (`supabase/checks/`).

## Run it locally

Setup (Supabase project, environment variables, owner account, Vercel, tests) is in [`docs/SETUP.md`](docs/SETUP.md). The full product spec is in [`docs/SPEC.md`](docs/SPEC.md) and the design guide in [`docs/DESIGN.md`](docs/DESIGN.md).

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run build
npm run test:e2e     # Playwright, see docs/SETUP.md Part 7
```

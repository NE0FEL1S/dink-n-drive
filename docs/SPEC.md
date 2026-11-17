# Dink n' Drive — Pickleball Court Website · Build Spec (v1.2)

Status: **Approved plan** · Last updated 2026-11-17

Portfolio project by Arbien Armenion; may be handed over to the court owner for real use.

Changelog
- v1.2 — Court named **Dink n' Drive**. No maximum booking length; bookings are whole hours only, always on the hour.
- v1.1 — Customers can book multiple consecutive hours in one booking.

---

## 1. Business rules

| Rule | Value |
|---|---|
| Court name | Dink n' Drive |
| Courts | 1 |
| Opening hours | 8:00 AM – 12:00 AM, every day (no closed days) |
| Slots | 1-hour slots → 16 per day (first 8–9 AM, last 11 PM–12 AM) |
| Booking length | Any number of **consecutive whole hours** (minimum 1, **no maximum**). Always starts and ends on the hour (8:00–9:00, 8:00–11:00; never 9:15). Cannot run past 12 AM closing. |
| Court fee | ₱250 per hour (e.g. 3 hours = ₱750) |
| Paddle rental | Flat ₱50 per booking, regardless of hours or how many of the 4 paddles they use. Not charged again when the customer extends by booking the hour right after an existing booking. |
| Extending later | Customer books the next free hour(s) as a new booking |
| Payment | Customer scans the owner's GCash QR on the site, uploads a payment screenshot; owner approves or rejects |
| Unpaid hold | A booking without an uploaded screenshot is released after 15 minutes |
| Cancellation | Whole booking only, allowed up to **3 hours before** the booking starts. ₱100 cancellation fee per booking is kept; the rest is refunded to the customer's GCash |
| Accounts | Login required to book, post, comment, react, or give feedback. Browsing is public. |
| Timezone | Asia/Manila for all display and slot logic |
| Money | Whole pesos, stored as integers |

All prices, hours, hold time, cutoff and fees live in a `settings` row so the owner can change them without code. Each booking stores the prices it was made at, so past earnings never change.

---

## 2. Stack

- **Next.js (App Router) + TypeScript**, Tailwind CSS
- **Supabase**: Postgres, Auth (Google + email/password), Storage, Row-Level Security, pg_cron; `@supabase/ssr` for the Next.js client
- **Vercel** hosting, **GitHub** repo
- Exports: `exceljs` (.xlsx) and `jspdf` + `jspdf-autotable` (PDF), generated in the browser
- Image compression in the browser before upload (`browser-image-compression`)

**Not in v1 (added later via settings, no rewrite):** email sending (Resend or Gmail SMTP), forgot/change password, booking emails, online payment gateway.

---

## 3. Auth & roles

- Sign-in: **Google** (primary button) and **email + password** (email confirmation turned off in Supabase).
- First sign-in → complete profile: full name and phone number (required) before booking or posting.
- Roles: `customer` (default) and `owner`. Admin routes are protected by middleware **and** RLS.
- **Owner-assisted reset:** in Admin → Customers, the owner can set a temporary password for an email/password customer after verifying their phone number (server action using the secret/service-role key, server-side only).

---

## 4. Pages

### Public
- `/` — landing: court info, prices, hours, CTA to book, latest community posts
- `/book` — date picker → hourly slot grid (pick start hour, extend over consecutive free hours) → paddle rental toggle → summary → pay
- `/community` — feed of posts
- `/feedback` — public feedback feed with status badges and owner replies
- `/login`

### Customer (signed in)
- `/my-bookings` — upcoming & past bookings, status, upload payment proof, cancel / request refund
- `/profile` — name and phone

### Owner (`/admin`)
- **Overview** — summary cards + earnings chart
- **Bookings** — the bookings table, filters, exports
- **Payments** — queue of bookings awaiting review with screenshot preview; Approve / Reject (with reason)
- **Refunds** — cancellation requests; owner sends GCash refund manually, uploads refund screenshot, marks Refunded
- **Customers** — customer list with bookings count, total hours, total spent, last visit; temporary-password reset
- **Feedback** — inbox: set status, write the public reply, delete abusive items
- **Moderation** — posts and comments, newest first; delete
- **Settings** — prices, hours, hold minutes, cancellation cutoff/fee, GCash QR image, court name

---

## 5. Booking flow

1. Customer picks a date; the page shows the 16 hourly slots as Available / Taken / Past.
2. Taps a start hour, then extends the selection over consecutive free hours. The selection stops at the next taken hour or at closing.
3. Chooses whether to rent paddles. Total updates live: hours × ₱250 + ₱50 if paddles (₱0 paddles if they carry over from the customer's booking that ends right at this start time).
4. Confirms → booking created as **Pending payment** with a 15-minute hold and a booking reference (e.g. `DND-7K3Q9`).
5. Site shows the GCash QR and amount. Customer uploads the screenshot → **Pending review** (no longer expires).
6. Owner approves → **Confirmed**, or rejects with a reason → **Rejected** (hours reopen).
7. If no screenshot within 15 minutes → **Expired** (hours reopen), via a pg_cron job every minute.

**Double-booking protection:** each booking stores a time range (`start_at`, `end_at`). A Postgres **exclusion constraint** (`btree_gist`, `tstzrange(start_at, end_at) WITH &&`) limited to active statuses (`pending_payment`, `pending_review`, `confirmed`) makes the database reject any booking that overlaps another active booking, even if two people submit at the same moment. Check constraints enforce whole hours on the hour, opening hours, and minimum 1 hour.

**Paddle carry-over:** booking creation runs in a database function that checks whether the same customer has an active booking ending exactly at this booking's start with paddle rental. If yes, paddle rental is included at ₱0.

### Statuses
`pending_payment` → `pending_review` → `confirmed` | `rejected`
`pending_payment` → `expired`
`pending_payment` → `cancelled` (free, nothing paid)
`pending_review` / `confirmed` → `cancelled` (fee applies, refund flow)

---

## 6. Cancellation & refunds

- Available from My Bookings until **3 hours before the booking starts** (enforced in the database, not only the UI).
- Cancels the whole booking (no partial-hour cancellation).
- Customer enters GCash account name and number.
- Refund = total paid − ₱100 (e.g. 2 hours with paddles ₱550 → ₱450 back; 1 hour ₱250 → ₱150 back).
- Refund status: `requested` → `refunded`. Owner uploads the refund screenshot when done.
- The GCash number is erased automatically once the refund is marked done.
- Earnings: the ₱100 fee counts as revenue; refunds shown in their own column.

---

## 7. Community page

- Post = caption + **1–2 photos** (compressed in the browser).
- Reactions: 👍 Like and 😂 Haha (one reaction per user per post; can switch or remove).
- Comments (text).
- Owner can delete any post or comment (soft delete).
- Light rate limit on posting (e.g. 5 posts per hour per user), enforced in the database.

## 8. Feedback page (public)

- Same feed style as Community, with optional 0–2 photos.
- Status badge: **Open / In progress / Resolved**.
- Owner reply pinned under the feedback.
- **Anonymous checkbox:** public sees "Anonymous"; the owner still sees the account.
- Reactions and comments work the same as Community.
- Owner can delete abusive feedback.

---

## 9. Admin dashboard — bookings & earnings

**Filters:** Today · This week · This month · Custom range (by play date), plus status filter and customer search.

**Summary cards (follow the filter):** total earnings, court revenue, paddle revenue, cancellation fees, refunds, number of bookings, hours booked, pending payments.

**Earnings rule:** only **Confirmed** bookings count, plus ₱100 fees from cancelled bookings. Pending / Rejected / Expired are listed but excluded.

**Table columns:** reference, play date, time (start–end), hours, customer, phone, email, paddles (Y/N), court fee, paddle fee, total, status, payment screenshot, approved by / at, refund amount.

**Exports (respect current filter):**
- **Excel (.xlsx):** one row per booking + totals row
- **PDF:** header with "Dink n' Drive" and the period, summary totals, bookings table; A4, printable

**Chart:** earnings per day for the selected period.

---

## 10. Data model (draft)

| Table | Key columns |
|---|---|
| `profiles` | id (= auth user), full_name, phone, email, role, created_at |
| `settings` | single row: court_name, hourly_rate, paddle_fee, paddle_count, open_hour, close_hour, hold_minutes, cancel_cutoff_hours, cancel_fee, gcash_qr_path |
| `bookings` | id, ref_code, user_id, start_at, end_at, hours, paddle_rented, hourly_rate, court_fee, paddle_fee, total, status, payment_proof_path, reviewed_by, reviewed_at, reject_reason, created_at |
| `refunds` | booking_id, requested_at, cancel_fee, refund_amount, gcash_name, gcash_number (nulled after refund), status, refund_proof_path, refunded_by, refunded_at |
| `posts` | id, user_id, caption, created_at, deleted_at |
| `post_photos` | id, post_id, path, position (1–2) |
| `feedback` | id, user_id, is_anonymous, message, status, owner_reply, replied_at, created_at, deleted_at |
| `feedback_photos` | id, feedback_id, path, position (1–2) |
| `comments` | id, user_id, target_type (post/feedback), target_id, body, created_at, deleted_at |
| `reactions` | user_id, target_type, target_id, type (like/haha); unique per user + target |

**Constraints on `bookings`:** exclusion constraint against overlapping active bookings; `start_at` and `end_at` exactly on the hour; within opening hours; `hours >= 1`; `end_at = start_at + hours`.

**Storage buckets:** `payment-proofs` (private), `refund-proofs` (private), `community-photos` (public), `feedback-photos` (public), `site-assets` (GCash QR).

**Public availability** is served through a database function that returns taken time ranges only — never customer details.

---

## 11. Build phases

1. Project setup, database schema, RLS, storage buckets, auth (Google + email), profile completion, owner role
2. Booking flow: hourly grid with multi-hour selection, paddle logic, payment-proof upload, holds and expiry, My Bookings
3. Admin: payment queue, bookings table with filters, summary cards, exports, settings
4. Cancellation and refund flow (customer + admin)
5. Community feed: posts, photos, reactions, comments, moderation
6. Public feedback: reuse community components + status, replies, anonymous option
7. Customers tab with owner-assisted reset, earnings chart, mobile polish, testing, deploy to Vercel

---

## 12. Hosting & cost notes

- Everything runs on free tiers for the build and portfolio demo (₱0).
- Supabase free: 500 MB database, 1 GB file storage, pauses after 7 days of no activity (unpause from dashboard).
- Vercel Hobby is non-commercial only. Before the owner uses it for the real business: upgrade to Vercel Pro (~$20/month) or move hosting to a provider whose free plan allows commercial use.
- Email (later): Gmail SMTP (free, no domain) or Resend + a domain (~₱500–900/year). Plug into Supabase Auth settings, then add forgot-password and booking emails.

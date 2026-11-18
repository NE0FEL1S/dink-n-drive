# Dink n' Drive — Pickleball Court Website · Build Spec (v1.4)

Status: **Approved plan** · Last updated 2026-11-19

Portfolio project by Arbien Armenion; may be handed over to the court owner for real use.

Changelog
- v1.4 — **Guest booking:** anyone can book with name, email and phone; accounts are optional for booking (still required to post, comment, react or give feedback). My Bookings also shows guest bookings made in the same browser. Payment proof is uploaded right below the GCash QR. Customer cancellation of a paid booking is now a **request** the owner approves or declines; the ₱100 fee counts as earnings once the refund is marked completed. The unpaid-booking limit is per phone number. Landing page is one screen; booking opens in a popup.
- v1.3 — Pre-build review. Paddle carry-over removed: every booking with paddles pays the flat ₱50. Owner can block hours and cancel any booking with a full refund. New limits: how far ahead people can book and how many unpaid bookings a customer can hold. Cancellation fee is saved on the booking; unpaid bookings cancel free at any time. Comments and reactions use real foreign keys. Rate limits added for feedback and comments. Next.js 16 `proxy` replaces `middleware`.
- v1.2 — Court named **Dink n' Drive**. No maximum booking length; bookings are whole hours only, always on the hour.
- v1.1 — Customers can book multiple consecutive hours in one booking.

---

## 1. Business rules

| Rule | Value |
|---|---|
| Court name | Dink n' Drive |
| Courts | 1 |
| Opening hours | 8:00 AM – 12:00 AM, every day (no closed days). Stored as `open_hour = 8`, `close_hour = 24` (24 = midnight). |
| Slots | 1-hour slots → 16 per day (first 8–9 AM, last 11 PM–12 AM) |
| Booking length | Any number of **consecutive whole hours** (minimum 1, **no maximum**). Always starts and ends on the hour (8:00–9:00, 8:00–11:00; never 9:15). Cannot run past 12 AM closing. Only hours that start in the future can be booked. |
| Booking window | Up to **30 days** ahead (`max_advance_days`) |
| Unpaid limit | At most **2** bookings in `pending_payment` at once **per phone number** (`max_unpaid_bookings`), for guests and signed-in users alike. No captcha. |
| Court fee | ₱250 per hour (e.g. 3 hours = ₱750) |
| Paddle rental | Flat ₱50 per booking that rents paddles, regardless of hours or how many of the 4 paddles they use. Every booking pays it, including an extension booked right after an earlier one. |
| Extending later | Customer books the next free hour(s) as a new booking (paddles ₱50 again if rented) |
| Payment | Customer scans the owner's GCash QR on the site, uploads a payment screenshot; owner approves or rejects |
| Unpaid hold | A booking without an uploaded screenshot is released after 15 minutes |
| Cancellation | Whole booking only. Unpaid bookings cancel free and instantly at any time. For paid bookings (`pending_review` / `confirmed`) the customer sends a **cancellation request** with their GCash name and number, up to **3 hours before** the start; the owner approves or declines it. If approved, the ₱100 fee is kept and the rest is refunded to the customer's GCash. |
| Owner tools | Owner can block hours (maintenance, events, weather) and cancel any booking at any time with a full refund |
| Accounts | **Booking does not need an account:** guests enter full name, email and PH mobile number in the booking popup. Signed-in users have these prefilled. Login is required to post, comment, react or give feedback. Browsing is public. |
| Timezone | Asia/Manila for all display and slot logic |
| Money | Whole pesos, stored as integers |

All prices, hours, hold time, cutoff, fees and limits live in a `settings` row so the owner can change them without code. Each booking stores the prices and cancellation fee it was made at, so past earnings and existing bookings never change.

---

## 2. Stack

- **Next.js 16 (App Router) + TypeScript**, Tailwind CSS
- **Supabase**: Postgres, Auth (Google + email/password), Storage, Row-Level Security, pg_cron; `@supabase/ssr` for the Next.js client
- **Vercel** hosting, **GitHub** repo
- Exports: `exceljs` (.xlsx) and `jspdf` + `jspdf-autotable` (PDF), generated in the browser
- Image compression in the browser before upload (`browser-image-compression`)

**Not in v1 (added later via settings, no rewrite):** email sending (Resend or Gmail SMTP), forgot/change password, booking emails, online payment gateway.

---

## 3. Auth & roles

- Sign-in: **Google** (primary button) and **email + password** (email confirmation turned off in Supabase).
- A trigger on `auth.users` creates the `profiles` row on sign-up and prefills the name from Google when available.
- First sign-in → complete profile: full name and phone number (required) before posting, commenting, reacting or giving feedback. Signed-in users who book without a phone on file enter it in the booking popup and it is saved to their profile. Phone must be a PH mobile number entered as `09XXXXXXXXX`; stored as `+639XXXXXXXXX`.
- **Guests** (no account) can book; see §5. Accounts give prefilled details and My Bookings on any device.
- Roles: `customer` (default) and `owner`. Customers can never change `role`. The first owner is set by hand with SQL (see `docs/SETUP.md`).
- Admin routes are protected by the Next.js **proxy** (`src/proxy.ts`, formerly "middleware") **and** RLS.
- **Owner-assisted reset:** in Admin → Customers, the owner can set a temporary password for an email/password customer after verifying their phone number (server action using the secret/service-role key, server-side only).

---

## 4. Pages

### Public
- `/` — landing: one screen only. Hero with the court name, a one-line price note, and a single "Book now" button that opens the booking popup. No availability, location or community posts on this page (see `docs/DESIGN.md` §5).
- `/book` — the booking flow: date picker → hourly slot grid (pick start hour, extend over consecutive free hours) → paddle rental toggle → summary → pay. Opens as a popup (bottom sheet on phones) from "Book now"; the same UI also works as a full page at `/book`.
- `/community` — feed of posts
- `/feedback` — public feedback feed with status badges and owner replies
- `/login`

### Customer (guest or signed in)
- `/my-bookings` — upcoming & past bookings, status, upload payment proof, **Cancel booking** (request). Signed-in users see their account's bookings on any device; guests see the bookings made in **this browser** (remembered with a secure device token). When a guest signs in on the same browser, those bookings are attached to the account.
- `/profile` — name and phone (signed-in users)

### Owner (`/admin`)
- **Overview** — summary cards + earnings chart
- **Bookings** — the bookings table, filters, exports; **block hours** (pick date + hours, optional note) and remove blocks; **cancel any booking** (full refund, no fee)
- **Payments** — queue of bookings awaiting review with screenshot preview; Approve / Reject (with reason)
- **Refunds** — cancellation requests; owner sends GCash refund manually, uploads refund screenshot, marks Refunded
- **Customers** — guests and account holders, grouped by phone number: bookings count, total hours, total spent, last visit; temporary-password reset (account holders with email/password only)
- **Feedback** — inbox: set status, write the public reply, delete abusive items
- **Moderation** — posts and comments, newest first; delete
- **Settings** — prices, hours, hold minutes, cancellation cutoff/fee, booking window, unpaid-booking limit, GCash QR image, court name

---

## 5. Booking flow

1. Customer picks a date (today up to `max_advance_days` ahead); the page shows the 16 hourly slots as Available / Taken / Past. Blocked hours show as Taken.
2. Taps a start hour, then extends the selection over consecutive free hours. The selection stops at the next taken hour or at closing.
3. Chooses whether to rent paddles. Total updates live: hours × ₱250 + ₱50 if paddles.
4. Enters contact details: **guests** type full name, email and PH mobile number; **signed-in users** see them prefilled (and add a phone if their profile lacks one).
5. Confirms → booking created as **Pending payment** with a 15-minute hold and a booking reference (e.g. `DND-7K3Q9`). Guests get a long random **device token**, stored in an httpOnly cookie, that links the booking to this browser.
6. The same popup shows the GCash QR and amount, with an **Upload proof** button right below the QR. Customer uploads the screenshot → **Pending review** (no longer expires). If they close the popup first, they can upload from My Bookings while the hold lasts.
7. Owner approves → **Confirmed**, or rejects with a reason → **Rejected** (hours reopen).
8. If no screenshot within 15 minutes → **Expired** (hours reopen), via a pg_cron job every minute.

**Booking creation** runs in a database function that, in order:
1. Expires this court's overdue `pending_payment` holds (so the up-to-1-minute cron lag never blocks a slot).
2. Checks: contact details valid (signed in: taken from the profile; guest: name, email and PH mobile number required); start in the future; start no more than `max_advance_days` ahead; within opening hours from `settings`; that **phone number** has fewer than `max_unpaid_bookings` unpaid bookings.
3. Copies `hourly_rate`, `paddle_fee` and `cancel_fee` from `settings` onto the booking, computes `court_fee` and `total`.
4. Generates `ref_code`: `DND-` + 5 characters from an alphabet without look-alikes (no 0, O, 1, I); unique, retried on collision.
5. Inserts with `user_id` (signed in) or the hash of the guest's device token (guest); the exclusion constraint rejects overlaps.

Opening hours are checked in the function, not by a CHECK constraint, because they come from `settings` and changing them must not invalidate existing bookings.

**Payment-proof submission** is a server action plus database function that accepts the upload only if the booking belongs to the caller (their account, or the device token cookie for guests), is still `pending_payment`, and its hold has not run out. Guests are not signed in, so uploads go through a server-issued signed upload URL into the private `payment-proofs` bucket; storage is never opened to anonymous writes.

**Guest access is per browser.** A guest who changes phones or clears cookies loses the My Bookings link to their booking; the owner can still find it by reference or phone and act on it in Admin.

**Double-booking protection:** each booking stores a time range (`start_at`, `end_at`). A Postgres **exclusion constraint** (`btree_gist`, `tstzrange(start_at, end_at) WITH &&`) limited to active statuses (`pending_payment`, `pending_review`, `confirmed`, `cancel_requested`, `blocked`) makes the database reject any booking that overlaps another active booking or an owner block, even if two people submit at the same moment. Check constraints enforce whole hours on the hour, minimum 1 hour, and `end_at = start_at + hours`.

**Owner blocks** are rows in `bookings` with `kind = 'block'`, no customer, all amounts ₱0, status `blocked`, and an optional note. Keeping them in the same table lets one exclusion constraint cover everything. Removing a block deletes the row. Blocks can't be placed over an active customer booking — the owner cancels that booking first.

### Statuses
`pending_payment` → `pending_review` → `confirmed` | `rejected`
`pending_payment` → `expired`
`pending_payment` → `cancelled` (free, nothing paid, any time, instant)
`pending_review` / `confirmed` → `cancel_requested` (customer request; the slot stays held) → `cancelled` (owner approved; fee applies, refund flow) or back to its previous status (owner declined)
`pending_review` / `confirmed` → `cancelled` (owner cancels: full refund, no request needed)
`blocked` (owner blocks only)

---

## 6. Cancellation & refunds

**Customer cancellation (guests and signed-in users, from My Bookings)**
- Whole booking only (no partial-hour cancellation).
- `pending_payment`: **Cancel booking** cancels instantly and free; no refund flow.
- `pending_review` / `confirmed`: **Cancel booking** opens a popup asking for the **GCash account name and number** (PH mobile) for the refund, shows the refund amount, and sends a **cancellation request**. Allowed until **3 hours before the booking starts** (enforced in the database, not only the UI).
- While the request is pending the booking is `cancel_requested` and the slot **stays held**. The customer sees "Cancellation requested" in My Bookings.
- The owner reviews it in Admin → Refunds:
  - **Approve** → booking `cancelled` (`cancelled_by = 'customer'`), refund `approved`. The owner sends the GCash refund, uploads the refund screenshot and marks it **completed**.
  - **Decline** (with a reason shown to the customer) → booking returns to its previous status (`pending_review` or `confirmed`); refund `declined`.
- Refund = `greatest(total − cancel_fee, 0)`, where `cancel_fee` is the fee saved on the booking when it was created (e.g. 2 hours with paddles ₱550 → ₱450 back; 1 hour ₱250 → ₱150 back).

**Owner cancellation**
- Any booking, any time, no cutoff, no fee, no request step. If the booking was `pending_review` or `confirmed`, a refund row is created as `approved` for the full `total` (the owner enters or confirms the customer's GCash details).
- Stored as `cancelled` with `cancelled_by = 'owner'`.

**Both**
- Refund status: `requested` → `approved` → `completed`, or `requested` → `declined`. The customer can see the status and the refund screenshot from My Bookings.
- The GCash number is erased automatically once the refund is marked completed.
- Earnings: the kept ₱100 fee counts as revenue **once the refund is marked completed**; refunds are shown in their own column.

---

## 7. Community page

- Post = caption + **1–2 photos** (compressed in the browser).
- Reactions: 👍 Like and 😂 Haha (one reaction per user per post; can switch or remove).
- Comments (text).
- Owner can delete any post or comment (soft delete). Deleting a post also removes its photos from storage, because the public bucket would keep serving them.
- Rate limits, enforced in the database: **5 posts per hour** and **30 comments per hour** per user.
- Authors appear by `full_name` only (served through a public view). Phone and email are never shown.

## 8. Feedback page (public)

- Same feed style as Community, with optional 0–2 photos.
- Status badge: **Open / In progress / Resolved**.
- Owner reply pinned under the feedback.
- **Anonymous checkbox:** public sees "Anonymous"; the owner still sees the account. The public view returns no author for anonymous feedback. Note: if the author comments on their own anonymous feedback, the comment shows their name.
- Reactions and comments work the same as Community.
- Owner can delete abusive feedback (soft delete; photos removed from storage).
- Rate limit: **5 feedback items per day** per user.

---

## 9. Admin dashboard — bookings & earnings

**Filters:** Today · This week · This month · Custom range (by play date), plus status filter and customer search.

**Summary cards (follow the filter):** total earnings, court revenue, paddle revenue, cancellation fees, refunds, number of bookings, hours booked, pending payments.

**Earnings rule:** only **Confirmed** bookings count (a `cancel_requested` booking still counts until the request is approved), plus kept cancellation fees from customer cancellations whose refund is marked **completed**. Unpaid cancellations, owner cancellations, declined requests' refunds, Pending / Rejected / Expired bookings and owner blocks add ₱0; they are listed (blocks can be hidden by filter) but excluded. Everything is grouped by play date.

**Table columns:** reference, play date, time (start–end), hours, customer, guest / account, phone, email, paddles (Y/N), court fee, paddle fee, total, status, payment screenshot, approved by / at, cancelled by, refund amount.

**Exports (respect current filter):**
- **Excel (.xlsx):** one row per booking + totals row
- **PDF:** header with "Dink n' Drive" and the period, summary totals, bookings table; A4, printable

**Chart:** earnings per day for the selected period.

---

## 10. Data model (draft)

| Table | Key columns |
|---|---|
| `profiles` | id (= auth user), full_name, phone, email, role, created_at |
| `settings` | single row: court_name, hourly_rate, paddle_fee, paddle_count (display only), open_hour, close_hour (24 = midnight), hold_minutes, cancel_cutoff_hours, cancel_fee, max_advance_days, max_unpaid_bookings, gcash_qr_path |
| `bookings` | id, ref_code, kind (`customer` / `block`), user_id (null for guests and blocks), guest_token_hash (guests only; sha-256 of the device token), contact_name, contact_email, contact_phone (snapshot for every customer booking; never public), start_at, end_at, hours, paddle_rented, hourly_rate, court_fee, paddle_fee, cancel_fee, total, status, status_before_request, payment_proof_path, reviewed_by, reviewed_at, reject_reason, cancelled_by (`customer` / `owner`), cancelled_at, block_note, created_at |
| `refunds` | booking_id, requested_at, cancel_fee, refund_amount, gcash_name, gcash_number (nulled once completed), status (`requested` / `approved` / `declined` / `completed`), decline_reason, decided_by, decided_at, refund_proof_path, completed_by, completed_at |
| `posts` | id, user_id, caption, created_at, deleted_at |
| `post_photos` | id, post_id, path, position (1–2) |
| `feedback` | id, user_id, is_anonymous, message, status, owner_reply, replied_at, created_at, deleted_at |
| `feedback_photos` | id, feedback_id, path, position (1–2) |
| `comments` | id, user_id, post_id (nullable FK), feedback_id (nullable FK), body, created_at, deleted_at — exactly one of post_id / feedback_id set |
| `reactions` | user_id, post_id (nullable FK), feedback_id (nullable FK), type (like/haha) — exactly one target set; unique per user + target |

**Constraints on `bookings`:** exclusion constraint against overlapping active bookings and blocks; `start_at` and `end_at` exactly on the hour; `hours >= 1`; `end_at = start_at + hours`; `kind = 'block'` ⇔ `status = 'blocked'`, with no user, guest token or contact details; a `customer` booking has contact name, email and phone and exactly one of `user_id` / `guest_token_hash`. Opening hours and limits are enforced in the booking function (see §5).

**Storage buckets:**
| Bucket | Read | Write |
|---|---|---|
| `payment-proofs` (private) | owner + that booking's customer | that booking's customer |
| `refund-proofs` (private) | owner + that booking's customer | owner |
| `community-photos` (public) | anyone | post author; owner can delete |
| `feedback-photos` (public) | anyone | feedback author; owner can delete |
| `site-assets` (public, GCash QR) | anyone | owner |

**Public availability** is served through a database function that returns taken time ranges only (customer bookings and blocks alike) — never customer details.

---

## 11. Build phases

1. Project setup, database schema, RLS, storage buckets, auth (Google + email), profile completion, owner role
2. Booking flow: hourly grid with multi-hour selection, paddle logic, payment-proof upload, holds and expiry, My Bookings
3. Admin: payment queue, bookings table with filters, summary cards, exports, settings, block hours
4. Cancellation and refund flow (customer + admin, including owner cancellation)
5. Community feed: posts, photos, reactions, comments, moderation
6. Public feedback: reuse community components + status, replies, anonymous option
7. Customers tab with owner-assisted reset, earnings chart, mobile polish, testing, deploy to Vercel

---

## 12. Hosting & cost notes

- Everything runs on free tiers for the build and portfolio demo (₱0).
- Supabase free: 500 MB database, 1 GB file storage, pauses after 7 days of no activity (unpause from dashboard).
- Vercel Hobby is non-commercial only. Before the owner uses it for the real business: upgrade to Vercel Pro (~$20/month) or move hosting to a provider whose free plan allows commercial use.
- Email (later): Gmail SMTP (free, no domain) or Resend + a domain (~₱500–900/year). Plug into Supabase Auth settings, then add forgot-password and booking emails.

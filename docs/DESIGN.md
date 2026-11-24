# Dink n' Drive — Design Guide

Source references: `docs/reference/UI reference/`
- **Palette 2 (colors):** deep navy, warm orange, glacier blue, icy white. Serif headline with an orange second line. Frosted-glass panel over a photo.
- **Palette 1 (feel):** clean and airy. White cards on a very light background, lots of whitespace, soft shadows, thin borders, short orange underline under section titles, small orange "eyebrow" labels, round icon chips, numbered steps (01 · 02 · 03), pill buttons.

**Rule of thumb:** palette 2's colors, palette 1's restraint. Mostly white and ice. Navy carries the text, and orange is used sparingly for the one action that matters on each screen.

**Mobile first, always.** Nearly every customer books on a phone (iPhone and Android). Design and build at 360–430 px wide first. Desktop is the stretched version, not the other way round.

---

## 1. Colors

Hex values were sampled from palette 2 and adjusted where needed for readable contrast (WCAG AA). Contrast ratios are listed for text uses.

### Brand
| Token | Hex | Use |
|---|---|---|
| `navy-900` | `#0F1B33` | Headlines, primary text (17:1 on white) |
| `navy-700` | `#1F3453` | Body text (12.5:1) |
| `slate-500` | `#5B6B82` | Secondary text, captions, labels (5.4:1 on white, 5.1:1 on `ice-50`) |
| `slate-300` | `#8A97A8` | Disabled text and placeholders only (not for real content) |
| `orange-500` | `#E8601C` | Accent: headline highlight word, section underline bar, icons, eyebrow text at ≥ 18px. **Not** for small text or button backgrounds (only 3.4:1). |
| `orange-600` | `#BF4A12` | Primary buttons (white text, 5.0:1), small orange text, links in orange, selected slot fill |
| `orange-700` | `#9E3D0F` | Primary button pressed state |
| `orange-50` | `#FFF3EC` | Orange tint: icon chips, eyebrow pill background, selected-slot tint |
| `glacier-700` | `#0B4F82` | Secondary accent: info states, "Pending review", links in body text (8.5:1) |
| `glacier-50` | `#E6F0F8` | Info tint backgrounds |

### Surfaces
| Token | Hex | Use |
|---|---|---|
| `white` | `#FFFFFF` | Cards, sheets, inputs |
| `ice-50` | `#F4F8FB` | Page background |
| `ice-100` | `#EAF1F7` | Taken slots, subtle fills, skeleton loaders |
| `line` | `#DFE7EF` | Borders and dividers (1px) |

### Illustration only
| Token | Hex | Use |
|---|---|---|
| `ball-yellow` | `#E3F04B` | The pickleball in the 3D hero and small ball motifs. Decorative only: never text, buttons, or status. |

### Status (badges = tinted background + dark text, never bright fills)
| Status | Text | Background |
|---|---|---|
| Confirmed · Resolved · Refunded | `#16794A` | `#E8F6EE` |
| Pending payment · Open · Refund requested | `#9A5B00` | `#FDF3E1` |
| Pending review · In progress | `#0B4F82` | `#E6F0F8` |
| Rejected | `#B42318` | `#FDECEA` |
| Expired · Cancelled · Blocked | `#4B5563` | `#EEF1F4` |

Error red (`#B42318`) and brand orange must never sit next to each other in a way that makes orange read as "error".

Light mode only for v1. Set `color-scheme: light` so phones in dark mode don't recolor form controls.

---

## 2. Typography

| Role | Font | Notes |
|---|---|---|
| Display (hero and page titles only) | **Fraunces** (serif, via `next/font/google`) | Gives palette 2's sophisticated serif feel. Weight 600. Use sparingly: landing hero, page H1. |
| Everything else | **Plus Jakarta Sans** (via `next/font/google`) | Clean geometric sans like palette 1. Weights 400 / 500 / 600 / 700. |

Mobile type scale:
| Style | Size / line height | Weight |
|---|---|---|
| Hero (serif) | 36 / 40 | 600, second line in `orange-500` |
| H1 page title (serif) | 28 / 34 | 600 |
| H2 section title (sans) | 20 / 28 | 700, with the 24×3 px orange underline bar below |
| H3 card title | 17 / 24 | 600 |
| Body | 16 / 24 | 400 |
| Small / caption | 14 / 20 | 500, `slate-500` |
| Eyebrow label | 12 / 16, uppercase, 0.06em tracking | 600, `orange-600` on `orange-50` pill |

- Never below 14 px for real content. **Inputs are always ≥ 16 px**, or iOS Safari zooms in on focus.
- Money uses tabular numbers (`font-variant-numeric: tabular-nums`), formatted `₱1,250`.
- Times shown as `8:00 AM – 11:00 AM`, Asia/Manila.

---

## 3. Shape, spacing, depth (the "clean" from palette 1)

- **Spacing:** 4 px grid. Page side padding 16 px on phones (20 px ≥ 390 px wide). 24–32 px between sections. Generous padding inside cards (16–20 px).
- **Radius:** cards 16 px · inputs and slot tiles 12 px · buttons and badges fully rounded (pill) · photos 16 px.
- **Borders:** 1 px `line` on cards and inputs. Don't double up a border and a heavy shadow.
- **Shadow (one soft level):** `0 1px 2px rgb(15 27 51 / 0.04), 0 8px 24px rgb(15 27 51 / 0.06)`. Use it for cards and the sticky bottom bar only.
- **Glass (from palette 2):** frosted panel (`white/70` + `backdrop-blur-md` + 1 px white/60 border) is allowed **only** on the landing hero card (in front of the 3D paddle) and the sticky top header. Always provide a solid fallback (`@supports not (backdrop-filter: blur(1px))`) because blur is slow on low-end Android phones.
- **Icons:** one outline icon set (Lucide), 20–24 px, `navy-700`, or `orange-500` inside a round `orange-50` chip (palette 1 style).
- **Whitespace over decoration:** no gradients on buttons, no background patterns, no more than one accent color per component.

---

## 4. Components

**Buttons**
- Primary: `orange-600` fill, white 16 px semibold text, pill shape, **min height 48 px**, full width on phones. Pressed: `orange-700` plus a slight scale (0.98). Only one primary button per screen.
- Secondary: white fill, 1 px `line` border, `navy-900` text.
- Ghost/text: `glacier-700` text, no border.
- Loading state keeps the width and shows a spinner, and the button is disabled to prevent double-submits.

**Cards:** white, 16 px radius, `line` border or soft shadow, 16–20 px padding.

**Section header (palette 1 signature):** H2 title, a 24×3 px `orange-500` bar under it, optional "See all →" text link on the right.

**Inputs:** 48 px tall, 12 px radius, `line` border, focus ring 2 px `orange-500` at 40% opacity plus an `orange-600` border. Label above (never placeholder-only). Error text in `#B42318` below.

**Badges:** pill, 12 px semibold, colors from the status table.

**Bottom sheet:** phones use bottom sheets instead of centered modals (confirm booking, cancel booking, reaction picker). Rounded top 20 px, drag handle, respects the bottom safe area.

**Toasts:** top of screen on phones (the bottom is where thumbs and the sticky bar live).

**Empty states:** short friendly line plus one action ("No bookings yet. Book your first game →").

**Skeletons** in `ice-100` instead of spinners for lists and the slot grid.

---

## 5. Key screens (mobile layout)

**Landing `/`: one screen, no scrolling** (decided with the developer, 2026-11-17)

Follows the composition of reference image 2 (the bear breaking out of ice/glass), without the person. Approved prototype: https://claude.ai/artifact/QfKzsLRhC5LZYXgo35ZvNR (private to the developer).

- **Scene (drawn in code):**
  - **Sky (winter twilight, updated 2026-11-23):**
    - Deep indigo overhead, fading through blue and lavender to the golden horizon, with soft sun rays.
    - Faint early stars in the upper sky (a few with small glints).
    - **One cloud style everywhere:** every cloud is drawn by the same cumulus painter, so they all match.
      - It's a full, towering shape (a bumpy base row, a middle tier and a domed top), never thin bands.
      - **Pure white**, with soft blue-grey shading in the creases and underneath for volume, so the orange accents stand out.
      - Bottoms are round and bumpy, **never flat**.
      - Each cloud is one merged shape, never visible overlapping circles.
    - Upper-sky cumulus are scattered across the top, stretched about 1.5× wider than tall so they read as long, drifting banks. The horizon bank (in place of the bear image's snowy peaks) is two overlapping rows of the same clouds.
    - No moon (tried; it looked out of place).
  - **Court:** a **blue court with a red kitchen** (the non-volley zones next to the net), white lines including the kitchen lines, and a net.
  - **Benches:** wooden **benches** along both sidelines.
  - **Snow:** clearly visible **snow** at three depths, about 1 flake per 2,800 px², up to 440. Small flakes have a faint blue outline so they still show over the white glass. With `prefers-reduced-motion` it's a still frame.
  - **Floodlights:** court floodlight poles along both sides, with lamp banks, warm glows and soft light beams on the court (additive blending).
  - **Horizon:** a warm golden-hour band (peach to apricot) under the blue sky, with warm-shadowed clouds.
  - **String lights:** warm festoon bulbs strung from pole top to pole top across the whole scene, with soft glows. About 1 in 5 bulbs is a warmer orange.
  - **Windscreen fence:** a branded fence along the far baseline (navy, an orange top stripe, "DINK N' DRIVE · LUYANG" repeated), with chain-link mesh above it.
  - **Snow details:** snow caps on the bench seats and backrests. On laptops only, soft snowbanks with sparkles fill the bottom corners; phones skip them to keep their clean look.
- **Frosted ice slab (compact, so the scene shows around it):**
  - **Size:** about 68% of the width on laptops (up to 1000 × 660 px). Full width on phones, between the top bar and the bottom call to action.
  - **Thicker frost:** a whiter base (about 35–55%), a 16 px blur, a fine noise grain, and a soft white glow along the inside edges.
  - **Edge:** a thin crisp 1.5 px rim, like the reference.
- **Ice break (modeled on the bear reference):**
  - **Hole:** chunky and saw-toothed, sitting behind the paddle head.
  - **Edge:** a **thick, faceted icy edge band** (10–20 px on laptops, 6–11 px on phones). Each chunk is shaded bright white-blue or deeper blue depending on which way it faces the light, like ice bent toward the viewer.
  - **Crushed ice:** a softly blurred, whiter zone around the opening.
  - **Shards:** big two-tone shards jutting into the opening, plus loose shards flying out at different depths.
  - **Cracks and glints:** a few short tapered cracks with branches (no spiderweb rings), and small twinkling glints on the ice.
  - **Placement:** the break stays inside the slab and clear of the text. The slab's shadow shares the hole, so no gray box shows through.
- **Paddle:** fully **in front** of the glass and sharp, as if it just smashed through, with a deep drop shadow. On laptops the handle runs out past the slab's bottom edge.
- **Ball hitting the paddle:** the ball sits on the paddle face (upper-left), half in front of the glass. It has speed lines trailing toward the lower-left where it came from, an impact burst of short white rays, and a ring that pulses every 2.2 s. On laptops it never overlaps the text column.
- **The real court (added 2026-11-23; replaced the old "Booking pass" illustration):** one photo of the actual court with the developer and friends (consent given). Bystanders in the background (children) were edited out; the original, the clean master and a second shot stay in `docs/reference/private/court-photos/`. Web copy: `public/landing/court.webp`, 2048 × 1536, no EXIF.
  - **Laptops only: photo card** in the open column left of the slab, where the booking pass was. Same frosted frame and 1.5 px rim as the slab, the same 3D tilt (`rotateY(16deg) rotateZ(-4deg)`), gentle float and parallax, and a small **snow mound** resting on its top edge. The photo is 5:6 (cover, centred on the players), with the caption "**The real court** / Luyang, Cebu" and an orange-gradient location-pin badge. It scales to the column and is hidden when the column is narrower than 250 px.
  - **It's a photo, not a link:** no click, no full-screen viewer (tried; a big photo next to the illustrated scene didn't look good). Phones don't show it, so their hero stays as it was.
- **Outside the glass:** on laptops, a floating frosted "₱250 / hour" chip on the left. The live "Open now" status moved into the slab's status row (see **Status row**).
  - **Right side:** three one-line chips styled like "₱250 / hour":
    - "**Night games** till midnight", from `close_hour`;
    - "**4 paddles** to rent · ₱50", from `paddle_count` and `paddle_fee`;
    - "Book up to **30 days** ahead", from `max_advance_days`.

    They form a **ladder**: each rung steps 28 px left of the one above (22 or 18 px if needed), **following the paddle's tilted right edge**, with **equal 90 px gaps**. The top rung sits 16 px from the window edge (parallax drifts up to 14 px), and the ladder is placed **as high as it can go** while clearing the paddle.
    - The paddle's real outline is measured from the image (`PADDLE_RIGHT` in `scene.ts`), so the rungs hug the edge as it pulls in toward the handle.
    - The 90 px gap comes first, with the biggest paddle that allows it, down to 78%. Then 80 or 70 px gaps, but only with a paddle of at least 85%. Otherwise the chips hide, because a tiny paddle is worse than no ladder.
    - Results: 90 px gaps at 1366 (paddle about 78%), 1440 (about 94%), 1536 and 1920 px (full size). The chips are hidden at 1280 px and below.
    - Column chips are slightly compact (42 px tall, 13.5 px text) so they fit.
  - The paddle icon is drawn as solid shapes (face, handle and ball), because outlines at 16–18 px read as a search icon.
- **Entrance moment:** on load the paddle smashes out with an overshoot, the cracks draw outward, the shards burst from the hole and the ball flies in. It runs once, takes about 1 s, and is skipped with `prefers-reduced-motion`.
- **Nav (moved out of the slab 2026-11-23):** a normal site header.
  - It's a **full-width frosted white bar pinned to the very top, edge to edge** (safe-area aware), and **its content runs edge to edge too**: logo at the far left, the account area at the far right.
  - The links sit in the middle with generous spacing (8 px gaps, 18 px side padding); the active link is an orange-gradient chip. The inner-page header uses the same wider spacing.
  - Before the account area there's a small frosted **live "Cebu time" clock chip** (Manila time, ticks each minute), shown only when the bar is at least 900 px wide.
  - **Log in** is orange-gradient. Signed in, the **avatar circle is the same orange gradient as Book now** (on every page's header).
  - The links show only when the bar is wide enough (container query, about 770 px); otherwise they fold into the orange-gradient menu button.
  - The slab sits below the bar.
- **Status row (replaces the nav inside the slab):** three items, evenly spaced, at the top of the slab.
  - Left: a frosted **segmented pill group** in the old nav's style. The first segment is an **orange-gradient chip "📍 Luyang"**, then "Open daily" and the hours ("8 AM – 12 AM", from `settings`).
  - Center: an **orange-gradient badge "✓ No account needed"**, midway between the group and the open pill. It's a true selling point (guests can book), and it's not a second CTA.
  - Right: the live **"● Open now · till 12 AM"** / **"Closed · opens 8 AM"** pill (Manila time), at the same 42 px height.
  - The badge shows only when the row is at least 720 px wide.
  - On phones the pill group shows centered; the badge and the open pill are hidden.
- **Logo (reworked 2026-11-23):** an orange-gradient app tile holding a bold white **"D"** (for Dink and Drive).
  - **The D** is slanted forward like a drive shot and like the italic "n'" in the wordmark.
  - **Its round hollow centre holds a lime pickleball** with a ring of six holes, framed by an even ring of the tile's orange.
  - **A small white frost sparkle** sits in the top-right corner, echoing the ice glints on the slab.
  - **One source:** `src/components/logo-mark.ts` feeds the header, landing nav, and Apple icon. `src/app/icon.svg` is a static copy generated from it.
  - **Wordmark:** **Dink *n'* Drive** (Fraunces 750, "n'" in italic orange) over "PICKLEBALL · LUYANG" in small spaced caps.
- **Wording** (structured like the CK Grounds reference the developer liked, written in our own words):
  - Location pill: "📍 Luyang · open daily" (in the status row)
  - Headline: **"Book your hour." / "*Own the kitchen.*"** (the second line is italic with an orange gradient; "the kitchen" is the players' name for the non-volley zone)
  - Paragraph: "Luyang's own pickleball court, open **8 AM to midnight**." (hours from `settings`).
  - **How it works row** (laptops only), under the paragraph: numbered steps **01 Pick your hours — 02 Pay with GCash — 03 Show up & play**, with small orange-gradient number circles (palette 1's numbered steps). It replaces the paragraph's old second sentence, so nothing is said twice. It's no wider than the paragraph.
  - **Vertical rhythm (laptops):** the headline block fills the room between the status row and the feature cards. Beyond 48 px outer gaps, up to 32 px more goes between each group (headline / paragraph / steps / button), so there's no big empty band above the headline or after **Book now**.
  - Features row: at the bottom of the screen on phones (white text). On laptops it's **three small frosted cards on the slab's bottom edge** (16 px apart), each with an orange icon circle, a bold label and a short second line: "15-min slot hold / while you pay", "Pay with GCash / scan, then upload", "Paddles for ₱50 / per booking". The cards are no wider than the headline text. The headline block is centered between the status row and the cards, so the slab has no empty band at the bottom.
  - One button, **"Book now →"**, directly under the paragraph. On phones the whole text block and the button are **centered**; on laptops they're left-aligned. "My bookings" lives only in the nav and menu, never as a second hero button.
  - Features: "15-min slot hold" · "Pay with GCash" · "Paddles for ₱50"
  - Hours, prices and hold minutes in the copy must come from `settings`.
- **Orange-gradient buttons** (Book now, Log in, the active nav link, the menu button, Continue): a gradient from `#FB8C47` at the top to `#EC6620` at the bottom, with a white inner top highlight and an orange glow shadow. White text, weight 800, with a faint text shadow. White on this orange is only about 3:1, enough for accessibility only on large bold text (Book now at 19–20 px). The smaller labels fall below AA, which the developer accepted.
- **Motion (2.5D, no three.js):** gentle float, and parallax that follows the pointer or finger, with paddle, ball, shards and chips at different depths.
- **Nothing else on the landing page:** no availability, no location map, no footer. Available hours appear only in the booking popup.
- **Assets:** the paddle and ball must be replaced with the court's own before launch. The prototype uses manufacturer product shots, which carry a brand logo and are copyrighted. They're also low-resolution (upscaled 2× for the prototype). Export as WebP/AVIF with transparency at 2–3× display size, via `next/image`. The court photos above are already the court's own.

**Inner pages (every page except `/`)** (added with the developer, 2026-11-23)

- **Sky band:** a soft golden-hour sky sits behind the sticky header and fades into the `ice-50` page. It uses the landing palette: deep blue at the top, a peach horizon, a warm sun glow low on the right, a few clouds and static snowflakes. It's about 340 px tall on phones and 420 px on laptops. Pure CSS (`.site-sky` in `globals.css`), with no canvas or animation, so it stays cheap on low-end Android. It's rendered by `SiteShell` (`src/components/site-shell.tsx`).
- **Header** over the sky: frosted white at 82% opacity with a 14 px blur (solid 94% white fallback).
- **Content cards** float over the sky band: white, 16 px radius, soft shadow (as in §4).
- **Page titles that sit on the sky, not inside a card** (Admin, My bookings, Community, Feedback) use `PageHeader`:
  - white serif H1 with a soft shadow (white on the upper sky blues is ≥ 4:1, AA for large text);
  - a white eyebrow pill with orange text;
  - the 24×3 px orange bar.
  - Never put small body text directly on the sky; it goes in a card.

**Booking popup** (opened by "Book now"; also reachable directly at `/book`)

Steps in the sheet: date strip → hour grid → paddles toggle → **contact details** (guests: full name, email, PH mobile with `autoComplete` name/email/tel; signed-in users: prefilled, editable phone if missing) → Continue → **GCash QR + amount + 15-minute countdown, with the "Upload proof" button right below the QR** → "Pending review" confirmation with the booking reference. Guests see a note that the booking is saved in My Bookings on this browser.

**My Bookings → Cancel booking:** unpaid bookings cancel instantly (confirm sheet). Paid bookings open a sheet asking for GCash account name and number, showing the refund amount (total − ₱100) and the 3-hour cutoff, then show "Cancellation requested" until the owner approves or declines.

On phones it's a bottom sheet; on laptops, a centered dialog. `/book` renders the same booking UI as a page, for direct links. In Next.js, use an intercepting route so the popup and the page share code. The prototype shows the flow: date strip → hour grid → paddles toggle → total → "Continue to payment".
- **Date strip:** horizontal, swipeable chips for today plus up to `max_advance_days` (`Tue 18`). The selected chip is filled `navy-900` with white text. A small calendar button opens a full date picker for far dates.
- **Slot list:** 16 rows, each a 56 px tall tile showing "8:00 AM – 9:00 AM" and a state:
  - Available: white, `line` border, `navy-900` text.
  - Selected: `orange-600` fill, white text. The tiles in a multi-hour selection join visually (shared edges).
  - Taken (or blocked): `ice-100` fill, `slate-500` text, label "Booked". Not tappable.
  - Past: hidden for today, or shown collapsed as "Earlier hours".
  - Interaction: tap a start hour, then tap a later hour to extend the range (or use the "+ 1 hour" / "− 1 hour" buttons in the sticky bar). The selection stops at the next taken hour.
- **Sticky bottom bar** (thumb zone, above the home indicator): "3 hours · 8:00–11:00 AM", paddles toggle, total `₱800`, and a primary "Continue" button. It's always visible once something is selected.
- **Built (Phase 2C):**
  - The popup is `src/app/@modal/(.)book` (a native `<dialog>`: bottom sheet below 640 px, centred 560 px dialog above). Esc, the ✕ button or a tap on the dimmed backdrop go back in history. `/book` renders the same `BookingFlow` as a page, with the bar sticking to the bottom of the window.
  - Tapping: a free hour starts a selection; a later or earlier free hour extends it if every hour between is free (otherwise it starts a new selection there); tapping inside the selection shrinks it (the first hour alone clears it). − / + in the bar do the same one hour at a time.
  - Availability refreshes every minute and when the tab comes back. If someone books part of the selection meanwhile, it's dropped with a notice ("Someone just booked part of those hours").
  - After the last hour of the day has started, the popup opens on tomorrow. Today's passed hours collapse into one line ("Earlier hours (8:00 AM – 2:00 PM) have passed").
  - Paddles: a switch in the bar, "Rent paddles · ₱50 / Flat fee per booking · 4 paddles". The calendar button opens the native date picker limited to the booking window.
- **Built (Phase 2D), checkout in the same popup / page:**
  - **Your details:** a summary card (day, time, court × hours, paddles, total) with "Change hours", then the form. Guests: full name, email, mobile (`09XXXXXXXXX`), "No account needed. This booking will be saved on this browser." and a "Log in" link. Signed in: a grey card with their name, email and phone ("Edit in your profile"); only a missing phone (or name) is asked for, and it's saved to the profile. Button: "Book and pay ₱X" (orange gradient), with "We hold your hours for 15 minutes while you pay with GCash." under it.
  - **Pay:** the `#FDF3E1` "Pay within mm:ss" banner with the reference on the right; "Send exactly ₱X via GCash" in large serif numbers; the GCash QR (from `settings.gcash_qr_path` in the public `site-assets` bucket, max 240 px wide) with "Save QR to Photos" (downloads the image) and the numbered steps; then "Upload your GCash receipt": a dashed drop area → preview + "Change" → "Send payment proof". The photo is compressed in the browser (JPEG, ≤ 1800 px, ~0.8 MB) and uploaded through a one-time signed URL.
  - **While paying,** a tap on the dimmed backdrop doesn't close the popup, and ✕ / Esc ask first ("You can still upload … from My bookings until the timer runs out").
  - **Time's up:** if the countdown ends first, "Time's up" explains the hours were released, with "Pick hours again".
  - **Done:** green check, "Payment sent for review", a blue "Pending review / DND-XXXXX" badge, a guest note that the booking is saved in My bookings on this browser, and "Go to My bookings".
  - Errors from the database read as plain sentences (e.g. "This mobile number already has 2 unpaid bookings…"); if the hours were just taken, it returns to the hour list with a notice.

**Pay** (after confirming)
- Hold countdown ("Pay within 14:32") in a `#FDF3E1` banner.
- Amount in large tabular numbers.
- GCash QR on a white card. **Phones can't scan their own screen**, so include:
  - A **"Save QR to Photos"** button, with the steps "Open GCash → Scan QR → Upload from gallery".
  - On iPhone, also say "or long-press the QR and tap Save to Photos".
- "Upload payment screenshot": a big dashed-border drop area (`accept="image/*"`, which opens the photo picker or camera on both platforms), with a preview and a "Change" option before submitting.

**My Bookings:** tabs "Upcoming / Past". Each booking is a card with ref code, date, time, total, status badge, and the next action (Upload proof · Cancel · View refund).
- **Built (Phase 2E):** `PageHeader` on the sky ("Your games" / "My bookings"), then for guests a white note ("These are the bookings made on **this browser**. Log in or create an account to keep them on any device."). Tabs are a white pill with "Upcoming (n)" / "Past (n)"; the active one is `navy-900`.
  - **Cards:** status badge + reference on top, day, time range (large), "2 hours · paddles rented · ₱550", then one line for the state: pending payment shows the `#FDF3E1` "Pay within mm:ss or the hours are released." with **Pay now** (orange gradient) and **Cancel**; pending review / confirmed / expired / cancelled each get a short sentence; rejected shows the owner's reason in a red tint.
  - **Upcoming** = active and not finished, soonest first; **Past** = finished, cancelled, expired or rejected, newest first. A hold that runs out moves to Past on its own.
  - **Pay now** opens the same pay step as the booking popup in a sheet. **Cancel** (unpaid only) opens a sheet: "It's free, because you haven't paid yet…", a red-text "Yes, cancel booking" and "Keep it". Paid bookings get their cancel request in Phase 4.
  - Empty: "No upcoming games." with **Book the court** (opens the booking popup).
  - Signing in or creating an account on this browser moves its guest bookings to the account.

**Community / Feedback:** single-column feed. Photo cards with 16 px radius, author name and time, caption, a reaction bar (👍 😂 with counts) and a comments link. A floating "+ Post" button bottom-right, above the safe area and the nav.
- **Built (Phase 5B):** `/community` with `PageHeader` ("Players' corner" / "Community"), then white cards in one column (max 576 px). Shared pieces for Phase 6 live in `src/components/feed/` (`FeedCard`, `FeedPhotos`, `ReactionBar`; `PostCard` wraps them for posts).
  - **Card:** 40 px `orange-50` initials circle, name (15 px bold), time in Manila ("Just now", "5 min ago", "3 h ago", then "Nov 24, 3:41 PM") plus "· Edited"; the caption keeps its line breaks; photos inset 16/20 px with a 16 px radius.
  - **Photos:** one photo keeps its own shape, cropped only beyond 4:5 tall or 1.91:1 wide; two photos sit side by side at 4:5 with a 4 px gap. The shape comes from the file name (`1-1280x960.webp`), so nothing jumps while loading. Photos skip the image optimizer (already compressed when posted) and load lazily, except the first post's.
  - **Reaction bar:** under a 1 px divider; 48 px pills "👍 3" / "😂 Haha" (the label shows when the count is 0) and "💬 2 comments" on the right. Your own reaction is an `orange-50` pill with `orange-600` text. Guests are sent to log in, and accounts without a name + phone to Profile.
  - **Paging:** 10 posts, then a white **Load more posts** button; at the end "You're all caught up." Empty: camera chip, "No posts yet.", and a white **Share a photo** (members) / **Log in to post** (guests) / **Complete your profile** button.
- **Built (Phase 5C):** posting and your own posts.
  - **+ Post:** a floating orange-gradient pill (56 px tall) bottom-right, 16 px above the home indicator (32 px from the corner on laptops). The page has extra bottom padding so it never covers the last card. Guests go to log in; accounts without a name + phone go to Profile.
  - **New post sheet:** a dashed "Add photos" area ("1 or 2, from your gallery or camera"). Picked photos show as 4:5 previews in two columns with a round navy ✕ (48 px target); with one photo the second tile is "Add another". Picking more than two keeps the first two and says so. Then "Photos can't be changed after posting.", the caption box (optional, with a "37/2,000" count), and the gradient **Post** button ("Preparing photos…" → "Uploading…" → "Posting…"). Closing with unsaved work asks first.
  - Photos are compressed to JPEG (max 1600 px, ~600 KB) and named `<n>-<w>x<h>.jpg`. The new post appears at the top with the green "Posted!" toast.
  - **⋯ on your own posts** (48 px, top-right of the card): **Edit caption** (sheet with the caption box, a note that photos can't be changed, **Save caption**) and a red-text **Delete post** (sheet "Delete this post?", red-outline **Yes, delete post** / **Keep it**, as in My bookings).
- **Built (Phase 5D):** reactions and comments.
  - **Reacting:** members tap 👍 or 😂 to react, tap it again to remove it, or tap the other one to switch. The bar changes at once (your reaction becomes the `orange-50` pill) and goes back with a red toast if the server says no. Guests and accounts without a name + phone are still sent to log in / Profile.
  - **Comments:** "💬 2 comments" opens a **Comments** sheet for everyone. Comments run oldest first: 32 px initials, then a rounded `ice-50` bubble with the name (14 px bold) and text, then the time below. Your own comments add a red-text **Delete**, which asks inline ("Delete this comment?" → **Yes, delete** / **Keep it**).
  - The write box is pinned to the bottom of the sheet: a round 48 px field (grows to ~5 lines) and a 48 px orange-gradient send button. On laptops Enter sends and Shift+Enter adds a line. A count shows past 900 characters. Guests and incomplete profiles see a white **Log in to comment** / **Complete your profile to comment** button there instead.
  - **Sheets on laptops** (≥ 640 px) are now as tall as their content (class `sheet-fit` on `Sheet`), not 88% of the screen. Long ones still stop at that height and scroll inside. The "Book now" popup keeps its own sizing.
- **Built (Phase 6B), `/feedback`:** `PageHeader` ("Your voice" / "Feedback", "Ideas, issues and praise for the court. The owner replies right here."), then the same one-column feed built from `FeedCard` (`FeedbackCard` in `src/components/feed/`).
  - **Status filter:** a white pill row like the My Bookings tabs: **All** · Open · In progress · Resolved (`?status=`; All, newest first, is the default). The active chip is `navy-900` with white text and turns active as soon as it's tapped. It stays one row at 360 px (chips size to their words); from 640 px it shrinks to fit its content.
  - **Card:** the status badge (Open amber, In progress blue, Resolved green, from the status table) sits top-right on the name row. Anonymous items show a grey `ice-100` circle with a person icon and the name **Anonymous**. Only the author's own session sees **Anonymous (you)**. Photos (0–2) work as on Community.
  - **Owner reply:** pinned under the message and photos, above the reaction bar. It's an `ice-50` box (12 px radius, inset like the photos) with a small `orange-50` reply-arrow chip, "Reply from {court name}" (from settings) in 14 px bold, the reply in 15 px, and its time below.
  - **Paging:** 10 items, **Load more feedback** (keeps the filter), "You're all caught up." Empty: speech-bubble chip, "No feedback yet." with **Log in to give feedback** / **Complete your profile**. A filter with no items says so ("No open feedback right now.") with a **Show all feedback** link.
- **Built (Phase 6C), giving feedback:**
  - **+ Feedback:** the same floating orange-gradient pill as + Post (`ComposeButton` in `src/components/feed/`, shared by both pages). Guests go to log in, accounts without a name + phone to Profile. With no feedback yet, the empty card shows a white **Give feedback** button.
  - **Give feedback sheet:** "Your feedback" box first (required, "What should we fix, add or keep doing?", 2,000-character count), then the shared photo picker (`PhotoPicker`: "Add photos" / "Optional · up to 2, from your gallery or camera", 4:5 previews, "Photos can't be changed after sending."), then a **Post anonymously** row on `ice-50`: a 24 px rounded checkbox (`orange-600` when ticked) with "Everyone sees “Anonymous” instead of your name. The owner can still see it's you." Then the gradient **Send feedback** ("Preparing photos…" → "Uploading…" → "Sending…") and "You can delete your feedback later, but not edit it." Closing with unsaved work asks first.
  - Photos are compressed like posts and stored as `<feedback_id>/<n>-<w>x<h>.jpg`. The new item appears at the top with a green "Thanks! Your feedback is on the page." toast. On the In progress or Resolved filter, the toast says where to find it instead.
  - **⋯ on your own feedback** (next to the status badge): one red-text **Delete feedback** item. The sheet reads "Delete this feedback?" and lists what goes with it (photos, reactions, comments, the owner's reply), with **Yes, delete feedback** / **Keep it**.
- **Built (Phase 5E), Admin → Moderation** (`/admin/moderation`, shield icon, before Settings): `PageHeader` "Moderation", then a white pill switch **Posts (n)** / **Comments (n)** (`?view=`), like Refunds. Live items only, newest first, 20 per page with **← Newer** / **Older →** and "Page 1 of 3".
  - **Post card:** initials, name, "today, 7:41 PM · email" (the owner sees the email, cut off with "…" on phones), caption (up to 4 lines, or "No caption"), 80 px photo thumbnails, "1 reaction / 1 comment" on the right, then a red-outline **Delete post** (full width on phones, right-aligned from 640 px).
  - **Comment card:** the same header, "On Paolo Reyes's post: “caption…”", the comment in an `ice-50` bubble, then **Delete comment**.
  - Delete asks in a sheet ("Delete this post?" / "Delete this comment?": what disappears, that the author isn't notified, "This can't be undone."), with **Yes, delete …** / **Keep it**. Then a green toast. A deleted post's photo files are removed from storage.

**Admin:** usable on a phone (the owner will check payments on the go). The Payments queue is a card list with a large screenshot preview and Approve/Reject buttons. Tables become stacked cards below 768 px. Desktop gets a left sidebar.
- **Built (Phase 3B):** `src/app/(site)/admin/layout.tsx` + `admin-nav.tsx`. Sections: Overview · Bookings · Payments · Refunds (Phase 4) · Moderation (Phase 5) · Settings (Customers and Feedback join in their phases).
  - **Below 1024 px:** a white pill row of tabs on the sky (same look as the My Bookings tabs: active `navy-900` with white text), scrolling sideways when it doesn't fit (all of 360–430 px today). The current tab is always scrolled into view.
  - **From 1024 px:** a sticky white sidebar card (232 px) with an "ADMIN" label and 48 px rows with Lucide icons; the active row is `orange-50` with `orange-600` text, like the header nav. Its top lines up with the page's eyebrow pill.
  - **Payments badge:** `orange-600` pill with the number of payments waiting for review (hidden at 0), streamed in after the nav renders. **Refunds** has the same badge: cancellation requests to decide + refunds to send.
  - Each section page uses `PageHeader` (eyebrow "Admin", title = section name), with no subtitle (small text doesn't go on the sky).
- **Built (Phase 3C), Payments:** one card per booking waiting for review, oldest receipt first.
  - **Card:** reference + "Sent today, 3:42 PM"; day, time range (20 px bold), "2 hours · paddles rented"; an `ice-50` box "The receipt should show **₱550**" (serif, tabular); customer name with a Guest/Account chip, tap-to-call phone (`glacier-700`), email.
  - **Receipt preview:** the full screenshot (`object-contain`, up to 440 px tall on phones, 400 px on laptops) on `ice-100`, with a white "Full size" chip that opens it in a new tab (a signed link that works for an hour).
  - **Order:** phones stack details → receipt → buttons; from 768 px the receipt is a 240 px column on the left.
  - **Buttons:** Reject (white with red text and border) and Approve (orange-600), side by side. Approve acts at once; Reject opens a sheet with the booking summary, three quick reasons as chips (Amount doesn't match · Screenshot unclear · Not received) that fill in a full sentence, an editable "Reason for the customer" box (500 characters, counter), a red-text "Reject payment" and "Back".
  - After each action a **toast** pinned under the header says what happened ("DND-XXXXX approved. The customer now sees it as confirmed."), so it's seen wherever the list is scrolled (`src/components/ui/toast.tsx`; green ones hide after 6 s, red ones stay until ✕). If another tab already handled it, the card is dropped with a notice.
  - The receipt box has a fixed height (420 px phones, 400 px laptops) and images load lazily, so cards don't jump under the owner's thumb while receipts load.
  - **Empty:** "All caught up" with "See all bookings →".
  - **Phase 4:** a booking whose customer asked to cancel before the payment was checked also waits here, with an amber note "The customer asked to cancel. Check the payment first…" (approve → the request waits in Refunds; reject → the request closes, no refund).
- **Built (Phase 4C), Refunds:** a pill row like the My Bookings tabs, **Requests (n) · To send (n) · History** (links, `?view=`; opens on To send when there are no requests). Cards are white, one column on phones, two columns inside the card from 768 px.
  - **Request card:** reference + "Asked today, 3:42 PM"; day, time (20 px bold), hours; customer (name + Guest/Account chip, tap-to-call phone, email); an `ice-50` box Paid / Cancellation fee (kept) / **Refund if approved**; "Refund to GCash" name and number. **Decline** (red outline) and **Approve** (orange-600). Approve asks first in a sheet ("Approve cancelling DND-…?" → what happens to the hours and how much to send → **Approve cancellation** / Back). Decline opens a sheet like Reject payment: two quick reasons (Too close to game time · GCash details unclear), a 500-character reason, **Decline request** / Back.
  - **Payment not checked yet:** an amber note linking to Payments, and Approve is disabled until the payment is approved there.
  - **To send card:** "Send by GCash **₱450**" (serif, like the receipt box) with "₱550 paid − ₱100 fee you keep" or "Full refund: you cancelled this booking"; **To:** name, the number in 20 px bold with a **Copy** chip; the customer. Right side (or below on phones): "After sending, add the GCash screenshot", a dashed drop area → preview (320 px, `object-contain`), then **Mark refunded** (compresses, uploads to refund-proofs, completes; the GCash number is erased).
  - **History:** latest 30 decided refunds: Refunded (green badge, amount, to whom, when, fee kept / full refund, "Refund screenshot" link) or Declined (grey badge, when, the reason).
  - Toasts under the header after each action, like Payments; a card handled in another tab is dropped with a notice.
- **Built (Phase 4B), My Bookings cancellation:** paid upcoming bookings get a full-width white **Cancel booking** button under the status line (disabled with "Cancellations close 3 hours before the game…" inside the cutoff). The sheet "Cancel this booking?" shows the booking, an `ice-50` box You paid / Cancellation fee / **Refund to your GCash**, GCash account name + number (prefilled), a note that the hours stay held, red-text **Send cancellation request** and **Keep booking**. Cards then say what's happening: request waiting (amount, name, masked number `0917 ••• 4567`), declined (amber box with the reason), refund approved, or refunded (green box, kept fee, **View refund screenshot** → sheet with the image).
- **Built (Phase 3D), filters:** a white card with a title ("Earnings" on Overview, "Filters" on Bookings) and the period on the right ("November 2026"), then pill chips Today · This week (Mon–Sun) · This month · Custom range (active = `navy-900`). Custom range adds From / To date fields (stacked below 420 px). Bookings adds a Status select (submits on change; "All, including blocks" / "All except blocks" / each status) and a Search field (reference, name, phone as typed `09…`, email, block note), then "Apply filters". Everything is in the URL. Overview defaults to This month, Bookings to Today.
- **Built (Phase 3D), Overview cards:** below the payments card and the filter card. Total earnings is the big card (serif ₱, 2 columns; 2×2 on laptops), then Court revenue, Paddle revenue, Cancellation fees, Refunds, Bookings, Hours booked (small white cards, 22 px bold numbers, a short grey hint), and Pending payments (2 columns wide, links to Payments when there are any). 2 columns on phones, 4 from 1024 px.
- **Built (Phase 3D), Bookings list:** "7 bookings" count, then **cards below 1280 px** (1 column on phones, 2 from 768 px; the sidebar leaves too little room for a table until 1280) and a **table from 1280 px** with 5 columns: Booking (reference, day, time · hours), Customer (name + Guest/Account chip, phone, email), Amount (total, court, paddles), Status (badge + who cancelled / refund / rejection reason), Receipt / review (receipt link, "Approved by … · date"). Owner blocks show "Owner block" and the note. 50 per page with Previous / Next.
- **Built (Phase 3G), Settings:** one white card per group (Court · Prices · Opening hours · Booking rules · Cancellations), each with a bold title, a short grey note where it matters ("Bookings already made keep the prices they were made with."), and fields in two columns from 640 px. Money fields have a ₱ prefix; counts have a grey unit on the right ("min", "days ahead", "hours before"); hours are selects ("12:00 AM (midnight)"). Errors show under each field, and the page scrolls to the first one.
  - A white **Save settings** bar sticks to the bottom of the screen while the form is on screen, with "Last changed … by …" and any form error.
  - **GCash QR** card below: "Now" (the current QR, max 240 px) and "Replace" (dashed drop area → preview → **Save new QR**). Small JPG/PNG/WebP files are uploaded unchanged (QR edges stay sharp); big photos are shrunk. The previous QR file is kept for a while (other deployments may still show it from cached settings).
  - Saving shows a toast under the header.
- **Built (Phase 3F), Exports:** two small white buttons, **Excel** and **PDF** (download icon), on the right of the "7 bookings" line. They download every booking matching the current filter (all pages), built on the server at `/admin/bookings/export`.
  - **Excel:** "Bookings" sheet (navy header row, frozen, with filters; ₱ money format; one row per booking; an ice "Totals" row of the confirmed bookings) and a "Summary" sheet (court name, period, filter, the 8 summary values).
  - **PDF:** A4 landscape. "Dink n' Drive" (bold), "Bookings · period", the filter and generation time; the 8 summary values as a grid; the bookings table (navy header, light stripes, Totals footer); footer with the period and page number. Money reads "PHP 1,250", because the PDF's built-in fonts have no ₱ sign.
- **Built (Phase 4D), owner cancel:** customer bookings that are unpaid, paid or have a request open get a red-text **Cancel booking** button (like Remove block): bottom-right of the card's footer, under the status badge in the table. It opens a sheet "Cancel DND-…?":
  - **Paid:** an `ice-50` box "Full refund, no fee **₱550**" (serif); a blue note on unchecked payments ("If the receipt isn't real, reject it in Payments instead: that gives no refund"); **Customer's GCash name / number**, prefilled from the customer's open request (hint "From the customer's cancellation request.") or else the booking contact ("Check it with the customer."); a line that the refund then waits in Refunds → To send; red-text **Cancel and refund in full** / Keep booking.
  - **Unpaid:** "Nothing was paid yet, so there's no refund." and **Cancel booking** / Keep booking.
  - **After:** the sheet turns into "DND-… cancelled" with a green check, what the customer sees, "Send ₱550 by GCash, then mark it refunded in Refunds", **Go to Refunds** (paid) and **Done** (refreshes the list).
- **Built (Phase 3E), Block hours:** two white buttons above the filters, **Block hours** and **Upcoming blocks** (the list filtered to blocks from today on), side by side on phones.
  - **Block hours** opens a sheet: a Day field (any day from today, also past the customer booking window), a hint, then the day's hours as 56 px tiles. Free hours are white ("Free"); picked ones `navy-900` with a ✓ (navy, not the customers' orange, so it reads as an owner action); booked ones `ice-100` with the customer's name and status; blocked ones `#EEF1F4` with "Blocked · note" and a red-text **Remove block** on the block's first hour. Passed hours collapse into one line. Picking works like the booking grid: tap a start, tap a later free hour to extend.
  - The bottom of the sheet is pinned (like the booking popup's bar): the result message, an optional **Note** ("only you see it") and the primary **Block 9:00 – 11:00 AM** button.
  - **Remove block** (in the sheet and on block rows in the list) asks first, inline: "Remove the 3:00 – 5:00 PM block? Customers can book these hours again." → **Yes, remove** / **Keep it**.

---

## 6. Navigation

- **Top navigation everywhere** (decided with the developer; no bottom tab bar). Logo on the left. From 1024 px up the links (Home · Community · Feedback · My bookings) are **centered in the header**, with the active one as an `orange-50` pill, and an orange "Log in" button (or the avatar when signed in) on the right. Below 1024 px (phones and tablets): "Log in"/avatar plus a menu button that opens the links in a dropdown with 48 px rows.
- On the landing page the nav is a full-width frosted bar pinned to the top, edge to edge (the slab below it opens with a status row). On other pages it's a sticky frosted header with the same content (`top: env(safe-area-inset-top)`), over the sky band described under "Inner pages" in §5.
- Account menu (avatar): My bookings, Profile, Admin (owner only), Sign out.

---

## 7. iPhone & Android checklist (apply on every screen)

**Layout and viewport**
- `viewport` export: `width=device-width, initial-scale=1, viewport-fit=cover`. Don't disable zoom.
- Use `env(safe-area-inset-*)` padding for the sticky header, the booking sheet's bottom bar, and all bottom sheets (notch, Dynamic Island, home indicator, Android gesture bar).
- Use `100dvh` / `min-h-dvh`, never `100vh` (iOS Safari's toolbar makes `vh` too tall).
- Test widths: **360** (common Android), **390/393** (iPhone 14–16 / Pixel), **430** (Pro Max). No horizontal scroll at 360.

**Touch**
- Tap targets ≥ 48 × 48 px (meets both Apple's 44 pt and Android's 48 dp), with ≥ 8 px between targets.
- Primary actions sit in the bottom half of the screen (thumb zone).
- No hover-only UI. Every hover style has an `:active` pressed equivalent.
- `-webkit-tap-highlight-color: transparent` with our own pressed states.
- `touch-action: manipulation` on buttons (no double-tap zoom delay).
- `overscroll-behavior: contain` on bottom sheets and horizontal scrollers.

**Forms and keyboard**
- Inputs ≥ 16 px font (prevents iOS zoom).
- Phone: `type="tel"`, `inputMode="tel"`, `autoComplete="tel"`. Email: `type="email"`, `autoComplete="email"`. Name: `autoComplete="name"`. Password: `autoComplete="current-password"` / `"new-password"`.
- `enterKeyHint` set ("next", "done", "send").
- The sticky bottom bar must not cover a focused input when the keyboard is open.

**Browser chrome**
- `themeColor` set to `#FFFFFF` (colors the Android Chrome address bar and the iOS status area).
- `apple-touch-icon` and a web manifest with app name and icons, so "Add to Home Screen" looks right on both.
- Native `<input type="date">` looks different on iOS and Android, so use the custom date strip as the main control.

**Performance (many customers use mid/low-end Android on mobile data)**
- `next/image` with proper `sizes`, lazy-load below the fold, compress uploads (already in the spec).
- Limit `backdrop-filter` to the two allowed places.
- Animations ≤ 200 ms, transform/opacity only. Respect `prefers-reduced-motion`.
- Keep client components small. Server Components by default.

**Accessibility**
- Contrast pairs from section 1 only.
- Visible focus ring (keyboard / switch control users).
- Slot tiles are real `<button>`s with an `aria-pressed` / `aria-label` like "8:00 to 9:00 AM, available".
- Status is never shown by color alone (badges always have text).

---

## 8. Tailwind v4 tokens (to paste into `src/app/globals.css` in Phase 1)

```css
@theme {
  --color-navy-900: #0F1B33;
  --color-navy-700: #1F3453;
  --color-slate-500: #5B6B82;
  --color-slate-300: #8A97A8;
  --color-orange-500: #E8601C;
  --color-orange-600: #BF4A12;
  --color-orange-700: #9E3D0F;
  --color-orange-50:  #FFF3EC;
  --color-glacier-700: #0B4F82;
  --color-glacier-50:  #E6F0F8;
  --color-ice-50:  #F4F8FB;
  --color-ice-100: #EAF1F7;
  --color-line:    #DFE7EF;

  --color-success: #16794A;  --color-success-bg: #E8F6EE;
  --color-warning: #9A5B00;  --color-warning-bg: #FDF3E1;
  --color-info:    #0B4F82;  --color-info-bg:    #E6F0F8;
  --color-danger:  #B42318;  --color-danger-bg:  #FDECEA;
  --color-neutral: #4B5563;  --color-neutral-bg: #EEF1F4;

  --font-display: var(--font-fraunces), Georgia, serif;
  --font-sans: var(--font-jakarta), system-ui, sans-serif;

  --radius-card: 16px;
  --radius-control: 12px;
  --shadow-soft: 0 1px 2px rgb(15 27 51 / 0.04), 0 8px 24px rgb(15 27 51 / 0.06);
}
```
Note: these override Tailwind's default `orange-*` and `slate-*` shades with the same names. That's intended, so a stray `bg-orange-500` still lands on-brand.

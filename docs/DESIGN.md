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
  - **Sky:** glacier blue with soft sun rays, and towering white cumulus on the horizon in place of the bear image's snowy peaks.
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
- **Booking pass (laptop showcase, fills the open column left of the slab):** a frosted ticket tilted in 3D (`rotateY(16deg) rotateZ(-4deg)`), floating and following the parallax. It shows the logo tile, "Booking pass · Dink n' Drive", a green "Confirmed" stamp, "Saturday, Nov 21 / 7:00 – 9:00 PM", tiles for Hours 2 · Paddles Rented · Paid via GCash, a perforated tear line, reference "DND-7K3Q9", total ₱550 (in orange) and a barcode. It's an illustration of what customers get after booking, not live data. It scales to the column and is hidden when the column is narrower than 250 px and on phones.
- **Outside the glass:** on laptops, floating frosted chips: "₱250 / hour" on the left, and a live **"Open now · till 12 AM"** status (green dot, from Manila time and `settings`) above the top-right corner.
- **Entrance moment:** on load the paddle smashes out with an overshoot, the cracks draw outward, the shards burst from the hole and the ball flies in. It runs once, takes about 1 s, and is skipped with `prefers-reduced-motion`.
- **Nav:** on laptops it sits inside the slab: logo, then the links in a frosted pill group (the active link is an orange-gradient chip), then an orange-gradient "Log in". On phones it's a frosted top bar with the logo, "Log in" and an orange-gradient menu button.
- **Logo:** an orange-gradient app tile with a white paddle and a lime ball, plus the wordmark **Dink *n'* Drive** (Fraunces 750, "n'" in italic orange) over "PICKLEBALL · LUYANG" in small spaced caps.
- **Wording** (structured like the CK Grounds reference the developer liked, written in our own words):
  - Location pill: "📍 Luyang · open daily"
  - Headline: **"Book your hour." / "*Own the kitchen.*"** (the second line is italic with an orange gradient; "the kitchen" is the players' name for the non-volley zone)
  - Paragraph: "Luyang's own pickleball court, open **8 AM to midnight**. Pick your hours, pay with GCash, then just show up and play." Phones show only the first sentence.
  - Features row (at the bottom of the screen on phones, under the button on laptops).
  - One button, **"Book now →"**, directly under the paragraph. On phones the whole text block and the button are **centered**; on laptops they're left-aligned. "My bookings" lives only in the nav and menu, never as a second hero button.
  - Features: "15-min slot hold" · "Pay with GCash" · "Paddles for ₱50"
  - Hours, prices and hold minutes in the copy must come from `settings`.
- **Orange-gradient buttons** (Book now, Log in, the active nav link, the menu button, Continue): a gradient from `#FB8C47` at the top to `#EC6620` at the bottom, with a white inner top highlight and an orange glow shadow. White text, weight 800, with a faint text shadow. White on this orange is only about 3:1, enough for accessibility only on large bold text (Book now at 19–20 px). The smaller labels fall below AA, which the developer accepted.
- **Motion (2.5D, no three.js):** gentle float, and parallax that follows the pointer or finger, with paddle, ball, shards and chips at different depths.
- **Nothing else on the landing page:** no availability, no location map, no footer. Available hours appear only in the booking popup.
- **Assets:** must be the court's own photos before launch. The prototype uses manufacturer product shots, which carry a brand logo and are copyrighted. They're also low-resolution (upscaled 2× for the prototype). Export as WebP/AVIF with transparency at 2–3× display size, via `next/image`.

**Booking popup** (opened by "Book now"; also reachable directly at `/book`)

On phones it's a bottom sheet; on laptops, a centered dialog. `/book` renders the same booking UI as a page, for direct links. In Next.js, use an intercepting route so the popup and the page share code. The prototype shows the flow: date strip → hour grid → paddles toggle → total → "Continue to payment".
- **Date strip:** horizontal, swipeable chips for today plus up to `max_advance_days` (`Tue 18`). The selected chip is filled `navy-900` with white text. A small calendar button opens a full date picker for far dates.
- **Slot list:** 16 rows, each a 56 px tall tile showing "8:00 AM – 9:00 AM" and a state:
  - Available: white, `line` border, `navy-900` text.
  - Selected: `orange-600` fill, white text. The tiles in a multi-hour selection join visually (shared edges).
  - Taken (or blocked): `ice-100` fill, `slate-500` text, label "Booked". Not tappable.
  - Past: hidden for today, or shown collapsed as "Earlier hours".
  - Interaction: tap a start hour, then tap a later hour to extend the range (or use the "+ 1 hour" / "− 1 hour" buttons in the sticky bar). The selection stops at the next taken hour.
- **Sticky bottom bar** (thumb zone, above the home indicator): "3 hours · 8:00–11:00 AM", paddles toggle, total `₱800`, and a primary "Continue" button. It's always visible once something is selected.

**Pay** (after confirming)
- Hold countdown ("Pay within 14:32") in a `#FDF3E1` banner.
- Amount in large tabular numbers.
- GCash QR on a white card. **Phones can't scan their own screen**, so include:
  - A **"Save QR to Photos"** button, with the steps "Open GCash → Scan QR → Upload from gallery".
  - On iPhone, also say "or long-press the QR and tap Save to Photos".
- "Upload payment screenshot": a big dashed-border drop area (`accept="image/*"`, which opens the photo picker or camera on both platforms), with a preview and a "Change" option before submitting.

**My Bookings:** tabs "Upcoming / Past". Each booking is a card with ref code, date, time, total, status badge, and the next action (Upload proof · Cancel · View refund).

**Community / Feedback:** single-column feed. Photo cards with 16 px radius, author name and time, caption, a reaction bar (👍 😂 with counts) and a comments link. A floating "+ Post" button bottom-right, above the safe area and the nav.

**Admin:** usable on a phone (the owner will check payments on the go). The Payments queue is a card list with a large screenshot preview and Approve/Reject buttons. Tables become stacked cards below 768 px. Desktop gets a left sidebar.

---

## 6. Navigation

- **Top navigation everywhere** (decided with the developer; no bottom tab bar). Logo on the left. On laptops the links are Home · Community · Feedback · My bookings, with the active one as an `orange-50` pill, and an orange "Log in" button (or the avatar when signed in) on the right. On phones: "Log in"/avatar plus a menu button that opens the links in a dropdown with 48 px rows.
- On the landing page the nav sits inside the glass panel. On other pages it's a sticky frosted header with the same content (`top: env(safe-area-inset-top)`).
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

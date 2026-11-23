"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { LogoMark } from "@/components/logo";
import { MobileNav } from "@/components/nav-links";
import { mountLandingScene } from "./scene";

export type LandingCopy = {
  openHour: number;
  closeHour: number;
  /** "8 AM to midnight" */
  hoursText: string;
  /** "8 AM – 12 AM" */
  hoursRange: string;
  /** "₱250" */
  rateText: string;
  /** "₱50" */
  paddleFeeText: string;
  holdMinutes: number;
  /** How far ahead people can book (settings.max_advance_days). */
  maxAdvanceDays: number;
  /** "midnight" (closing time in words) */
  closeWords: string;
  /** settings.paddle_count (display only) */
  paddleCount: number;
  /** Booking pass illustration: 2 hours + paddles at current prices, e.g. "₱550". */
  sampleTotalText: string;
};

const SHARDS = 9;

/**
 * One-screen landing (DESIGN.md §5): painted court scene, frosted ice slab with
 * the paddle smashing through, snow, parallax. Static markup renders on the
 * server; the scene script positions and animates it after hydration.
 */
export function LandingScene({ copy, account }: { copy: LandingCopy; account: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    return mountLandingScene(rootRef.current, { openHour: copy.openHour, closeHour: copy.closeHour });
  }, [copy.openHour, copy.closeHour]);

  return (
    <div ref={rootRef} className="landing">
      <canvas data-l="bg" className="l-bg" aria-hidden="true" />

      <main className="l-scene">
        <div data-l="stage" className="l-stage l-intro">
          <svg data-l="shadow" className="l-panel-shadow" aria-hidden="true">
            <path data-l="shadow-path" fill="rgb(4 24 48 / 0.30)" fillRule="evenodd" />
          </svg>

          <div data-l="panel" className="l-panel" aria-hidden="true" />
          <svg data-l="fx" className="l-fx" aria-hidden="true" />
          <div data-l="paddle" className="l-paddle">
            <div className="l-par">
              {/* TEMPORARY: manufacturer product shot from the prototype; replace with the court's own photo before launch (DESIGN.md §5). */}
              <Image src="/landing/paddle.webp" alt="" fill sizes="(max-width: 699px) 50vw, 320px" preload draggable={false} />
            </div>
          </div>
          <svg data-l="trail" className="l-trail" aria-hidden="true" />

          {Array.from({ length: SHARDS }, (_, i) => (
            <div key={i} data-l="shard" className="l-shard" aria-hidden="true">
              <div className="l-par">
                <div className="l-glass" />
              </div>
            </div>
          ))}

          <nav data-l="nav" className="l-nav" aria-label="Main">
            <div className="l-nav-row">
              <Link className="l-logo" href="/" aria-label="Dink n' Drive home">
                <LogoMark className="" gradientId="l-tile-nav" />
                <span className="l-wm">
                  <b>
                    Dink <em>n&apos;</em> Drive
                  </b>
                  <small>Pickleball · Luyang</small>
                </span>
              </Link>
              <div className="l-links">
                <Link href="/" aria-current="page">
                  Home
                </Link>
                <Link href="/community">Community</Link>
                <Link href="/feedback">Feedback</Link>
                <Link href="/my-bookings">My bookings</Link>
              </div>
              <div className="l-nav-right">
                <span className="l-clock" aria-label="Current time in Cebu">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5V12l3 2" />
                  </svg>
                  <span>
                    <b data-l="clock-time" />
                    <small>Cebu time</small>
                  </span>
                </span>
                {account}
                <MobileNav className="l-menu" />
              </div>
            </div>
          </nav>

          {/* Status row at the top of the slab (replaces the old in-slab nav): where + whether it's open now. */}
          <div data-l="info" className="l-info l-abs">
            {/* Segmented pill group in the old nav's style: the orange-gradient chip is the place,
                then when it's open. */}
            <div className="l-seg">
              <span className="l-seg-on">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
                  <circle cx="12" cy="9.5" r="2.4" />
                </svg>
                Luyang
              </span>
              <span>Open daily</span>
              <span className="l-seg-hours">{copy.hoursRange}</span>
            </div>
            <span className="l-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              No account needed
            </span>
            <span data-l="open-pill" className="l-open">
              <span className="l-dot" />
              <span data-l="open-text" />
            </span>
          </div>

          <div data-l="head" className="l-head l-abs">
            <h1>
              <span>Book your hour.</span>
              <span>
                <em>Own the kitchen.</em>
              </span>
            </h1>
            <p className="l-para">
              Luyang&apos;s own pickleball court, open <b>{copy.hoursText}</b>.
              <span className="l-more"> Pick your hours, pay with GCash, then just show up and play.</span>
            </p>
            <div className="l-book-wrap">
              <Link className="l-book l-grad" href="/book">
                Book now
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>

          <div data-l="cta" className="l-cta l-abs">
            <ul className="l-features">
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="13" r="8" />
                  <path d="M12 9v4l2.5 1.5M9.5 2.5h5" />
                </svg>
                <span>
                  <b>{copy.holdMinutes}-min slot hold</b>
                  <small>while you pay</small>
                </span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
                  <path d="M10.5 18h3" />
                </svg>
                <span>
                  <b>Pay with GCash</b>
                  <small>scan, then upload</small>
                </span>
              </li>
              <li>
                <PaddleIcon />
                <span>
                  <b>Paddles for {copy.paddleFeeText}</b>
                  <small>per booking</small>
                </span>
              </li>
            </ul>
          </div>

          <span data-l="chip-price" className="l-chip" aria-hidden="true" style={{ "--depth": "16px" } as React.CSSProperties}>
            <i>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 20V4h5a4 4 0 0 1 0 8H8" />
                <path d="M5 8h14M5 11.5h14" />
              </svg>
            </i>
            <span>
              <b>{copy.rateText}</b> / hour
            </span>
          </span>
          <span data-l="chip-lights" className="l-chip l-chip-col" aria-hidden="true" style={{ "--depth": "-14px" } as React.CSSProperties}>
            <i>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="3" width="14" height="7" rx="1.6" />
                <path d="M8.5 6.5h0M12 6.5h0M15.5 6.5h0" strokeWidth="2.8" />
                <path d="M12 10v11M8.5 21h7M7 13.5l-2.5 2M17 13.5l2.5 2" />
              </svg>
            </i>
            <span>
              <b>Night games</b> till {copy.closeWords}
            </span>
          </span>
          <span data-l="chip-paddles" className="l-chip l-chip-col" aria-hidden="true" style={{ "--depth": "-14px" } as React.CSSProperties}>
            <i>
              <PaddleIcon />
            </i>
            <span>
              <b>{copy.paddleCount} paddles</b> to rent · {copy.paddleFeeText}
            </span>
          </span>
          <span data-l="chip-ahead" className="l-chip l-chip-col" aria-hidden="true" style={{ "--depth": "-14px" } as React.CSSProperties}>
            <i>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
                <path d="M3.5 10h17M8 3v4M16 3v4" />
                <path d="M8.5 14.5h2M13.5 14.5h2" />
              </svg>
            </i>
            <span>
              Book up to <b>{copy.maxAdvanceDays} days</b> ahead
            </span>
          </span>

          {/* Illustration of what customers get after booking, not live data (DESIGN.md §5). */}
          <div data-l="pass" className="l-pass" aria-hidden="true">
            <div className="l-pass-in">
              <div className="l-pass-top">
                <LogoMark className="" gradientId="l-tile-pass" />
                <div>
                  <small>Booking pass</small>
                  <b>Dink n&apos; Drive</b>
                </div>
                <span className="l-ok">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  Confirmed
                </span>
              </div>
              <div className="l-pass-when">
                <span>Saturday, Nov 21</span>
                <b>7:00 – 9:00 PM</b>
              </div>
              <dl className="l-pass-rows">
                <div>
                  <dt>Hours</dt>
                  <dd>2</dd>
                </div>
                <div>
                  <dt>Paddles</dt>
                  <dd>Rented</dd>
                </div>
                <div>
                  <dt>Paid via</dt>
                  <dd>GCash</dd>
                </div>
              </dl>
              <div className="l-perf" />
              <div className="l-pass-foot">
                <div>
                  <small>Reference</small>
                  <b>DND-7K3Q9</b>
                </div>
                <div className="l-total">
                  <small>Total</small>
                  <b>{copy.sampleTotalText}</b>
                </div>
              </div>
              <div className="l-bars" />
            </div>
          </div>

          <div data-l="ball" className="l-ball">
            <div className="l-par">
              {/* TEMPORARY: manufacturer product shot from the prototype; replace with the court's own photo before launch. */}
              <Image src="/landing/ball.webp" alt="" fill sizes="(max-width: 699px) 104px, 150px" draggable={false} />
            </div>
          </div>
        </div>
      </main>

      <canvas data-l="snow" className="l-snow" aria-hidden="true" />
    </div>
  );
}

/** Pickleball paddle + ball as solid shapes (reads clearly at 16px; outlines looked like a search icon). */
function PaddleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <g transform="rotate(-22 11 12)">
        <rect x="5.5" y="1" width="12" height="12.5" rx="4" />
        <rect x="9.9" y="12.5" width="3.2" height="10.5" rx="1.5" />
      </g>
      <circle cx="20" cy="19.2" r="2.7" />
    </svg>
  );
}

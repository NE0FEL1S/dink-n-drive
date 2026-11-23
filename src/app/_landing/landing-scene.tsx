"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { MobileNav } from "@/components/nav-links";
import { mountLandingScene } from "./scene";

export type LandingCopy = {
  openHour: number;
  closeHour: number;
  /** "8 AM to midnight" */
  hoursText: string;
  /** "₱250" */
  rateText: string;
  /** "₱50" */
  paddleFeeText: string;
  holdMinutes: number;
  /** How far ahead people can book (settings.max_advance_days). */
  maxAdvanceDays: number;
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

          <nav data-l="nav" className="l-nav l-abs" aria-label="Main">
            <div className="l-nav-row">
              <Link className="l-logo" href="/" aria-label="Dink n' Drive home">
                <LogoTile />
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
                {account}
                <MobileNav className="l-menu" />
              </div>
            </div>
          </nav>

          <div data-l="head" className="l-head l-abs">
            <span className="l-loc">
              <i>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
                  <circle cx="12" cy="9.5" r="2.4" />
                </svg>
              </i>
              Luyang <span>· open daily</span>
            </span>
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
                {copy.holdMinutes}-min slot hold
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
                  <path d="M10.5 18h3" />
                </svg>
                Pay with GCash
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <g transform="rotate(-35 12 12)">
                    <rect x="7.5" y="2.5" width="9" height="11" rx="4.2" />
                    <path d="M12 13.5v8" />
                  </g>
                </svg>
                Paddles for {copy.paddleFeeText}
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
          <span data-l="chip-ahead" className="l-chip" aria-hidden="true" style={{ "--depth": "-18px" } as React.CSSProperties}>
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
          <span data-l="chip-open" className="l-chip" aria-hidden="true" style={{ "--depth": "-14px" } as React.CSSProperties}>
            <span className="l-dot" />
            <span data-l="open-text" />
          </span>

          {/* Illustration of what customers get after booking, not live data (DESIGN.md §5). */}
          <div data-l="pass" className="l-pass" aria-hidden="true">
            <div className="l-pass-in">
              <div className="l-pass-top">
                <LogoTile simple />
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

function LogoTile({ simple = false }: { simple?: boolean }) {
  const id = simple ? "l-tile-pass" : "l-tile-nav";
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FB8C47" />
          <stop offset="1" stopColor="#E8601C" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill={`url(#${id})`} />
      {!simple && <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="11.25" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.5" />}
      <g transform="rotate(-38 19 21)">
        <rect x="12.5" y="7" width="13" height="16" rx="6" fill="#fff" />
        {!simple && <rect x="15.5" y="12" width="7" height="1.6" rx="0.8" fill="#EC6620" opacity="0.55" />}
        <rect x="17" y="22" width="4" height="11" rx="2" fill="#fff" />
      </g>
      <circle cx="29.5" cy="10.5" r="4.6" fill="#D4F02E" stroke="#0F1B33" strokeWidth="1.2" />
      {!simple && (
        <>
          <circle cx="28.2" cy="9.4" r="0.8" fill="#0F1B33" opacity="0.6" />
          <circle cx="30.9" cy="11.6" r="0.8" fill="#0F1B33" opacity="0.6" />
        </>
      )}
    </svg>
  );
}

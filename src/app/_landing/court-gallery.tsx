"use client";

import Image from "next/image";
import { useRef, useState, type RefObject } from "react";

/**
 * Photos of the real court (DESIGN.md §5, "Court photo"). Background bystanders were
 * edited out; the full-size originals stay in docs/reference/private/court-photos/.
 */
export const COURT_PHOTOS = [
  { src: "/landing/court-1.webp", alt: "Four players raising their paddles at the net on the Dink n' Drive court in Luyang" },
  { src: "/landing/court-2.webp", alt: "The same four players posing by the net, with the blue court and red kitchen behind them" },
] as const;

/**
 * Full-screen lightbox in a native <dialog> (focus trap, Esc to close, top layer).
 * Photos swipe sideways on phones; arrows and arrow keys on laptops. Images load only once it opens.
 */
export function CourtGallery({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(COURT_PHOTOS.length - 1, i));
    track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
  };
  const close = () => dialogRef.current?.close();

  return (
    <dialog
      ref={dialogRef}
      className="l-gallery"
      aria-label="Photos of the court"
      onClose={() => {
        trackRef.current?.scrollTo({ left: 0 });
        setIndex(0);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        if (e.key === "ArrowLeft") go(index - 1);
      }}
      // a click on the dark area around the photo closes it
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t === e.currentTarget || t.classList.contains("l-gal-slide")) close();
      }}
    >
      <div className="l-gal-top">
        <p>
          <b>The real court</b>
          <span>Luyang · {index + 1} / {COURT_PHOTOS.length}</span>
        </p>
        <button type="button" className="l-gal-btn" onClick={close} aria-label="Close photos" autoFocus>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div
        ref={trackRef}
        className="l-gal-track"
        onScroll={(e) => {
          const t = e.currentTarget;
          setIndex(Math.round(t.scrollLeft / Math.max(1, t.clientWidth)));
        }}
      >
        {COURT_PHOTOS.map((p, i) => (
          <figure key={p.src} className="l-gal-slide" aria-label={`Photo ${i + 1} of ${COURT_PHOTOS.length}`}>
            <Image src={p.src} alt={p.alt} width={2048} height={1536} sizes="(max-width: 1240px) 100vw, 1200px" draggable={false} />
          </figure>
        ))}
      </div>

      <div className="l-gal-nav">
        <button type="button" className="l-gal-btn" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous photo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span className="l-gal-dots" aria-hidden="true">
          {COURT_PHOTOS.map((p, i) => (
            <i key={p.src} className={i === index ? "on" : undefined} />
          ))}
        </span>
        <button
          type="button"
          className="l-gal-btn"
          onClick={() => go(index + 1)}
          disabled={index === COURT_PHOTOS.length - 1}
          aria-label="Next photo"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </dialog>
  );
}

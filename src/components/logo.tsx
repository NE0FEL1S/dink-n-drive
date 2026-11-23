import Link from "next/link";

/** App tile from the approved landing prototype (docs/reference/landing-prototype). */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={`${className} flex-none drop-shadow-[0_4px_8px_rgb(236_102_32/0.35)]`}>
      <defs>
        <linearGradient id="dnd-logo-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FB8C47" />
          <stop offset="1" stopColor="#E8601C" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#dnd-logo-tile)" />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="11.25" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.5" />
      <g transform="rotate(-38 19 21)">
        <rect x="12.5" y="7" width="13" height="16" rx="6" fill="#fff" />
        <rect x="15.5" y="12" width="7" height="1.6" rx="0.8" fill="#EC6620" opacity="0.55" />
        <rect x="17" y="22" width="4" height="11" rx="2" fill="#fff" />
      </g>
      <circle cx="29.5" cy="10.5" r="4.6" fill="#D4F02E" stroke="#0F1B33" strokeWidth="1.2" />
      <circle cx="28.2" cy="9.4" r="0.8" fill="#0F1B33" opacity="0.6" />
      <circle cx="30.9" cy="11.6" r="0.8" fill="#0F1B33" opacity="0.6" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" aria-label="Dink n' Drive home" className="flex min-h-12 items-center gap-2 text-navy-900 sm:gap-2.5">
      <LogoMark className="size-8 sm:size-9" />
      <span className="grid leading-none">
        <b className="font-display text-[17px] font-bold tracking-[-0.02em] whitespace-nowrap sm:text-[19px]">
          Dink <em className="px-px font-semibold text-orange-600">n&apos;</em> Drive
        </b>
        <small className="mt-1 text-[8.5px] font-extrabold tracking-[0.16em] whitespace-nowrap text-navy-700/85 uppercase sm:text-[9.5px] sm:tracking-[0.2em]">
          Pickleball · Luyang
        </small>
      </span>
    </Link>
  );
}

import Link from "next/link";
import { logoMarkupString } from "./logo-mark";

/**
 * The Dink n' Drive mark: a forward-slanted white "D" holding a lime pickleball,
 * on the orange tile, with a frost sparkle. Markup comes from logo-mark.ts (a trusted
 * static string), the single source shared with the app icons.
 */
export function LogoMark({ className = "size-9", gradientId = "dnd-logo-tile" }: { className?: string; gradientId?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={`${className} flex-none drop-shadow-[0_4px_8px_rgb(236_102_32/0.35)]`}
      dangerouslySetInnerHTML={{ __html: logoMarkupString(gradientId) }}
    />
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

import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "cta" | "secondary" | "ghost";

const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold " +
  "transition-[transform,background-color,filter] duration-150 select-none " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60";

const variants: Record<Variant, string> = {
  // DESIGN §4: one primary per screen; orange-600 fill, white text.
  primary: "bg-orange-600 text-white hover:bg-orange-700 active:bg-orange-700",
  // DESIGN §5: orange-gradient CTA (Book now, Log in, Continue).
  cta: "btn-grad hover:brightness-105 active:brightness-95",
  secondary: "border border-line bg-white text-navy-900 hover:bg-ice-50 active:bg-ice-100",
  ghost: "text-glacier-700 hover:bg-glacier-50 active:bg-glacier-50",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`.trim();
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant };

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant };

export function ButtonLink({ variant = "primary", className = "", ...props }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`size-5 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

import type { ComponentProps } from "react";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-soft)] ${className}`}
      {...props}
    />
  );
}

/** Small orange eyebrow pill (DESIGN §2). */
export function Eyebrow({ className = "", ...props }: ComponentProps<"span">) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-orange-600 ${className}`}
      {...props}
    />
  );
}

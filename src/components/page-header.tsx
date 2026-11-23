import type { ReactNode } from "react";

/**
 * Page title that sits on the sky band (inner pages whose title is not inside a card):
 * white serif H1 with a soft shadow, optional eyebrow pill, orange underline bar.
 * White on the sky's upper blues is ≥ 4:1 (AA for large text). DESIGN.md §5 "Inner pages".
 */
export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="grid gap-2">
      {eyebrow && (
        <span className="inline-flex w-fit items-center rounded-full bg-white/90 px-3 py-1 text-xs font-semibold tracking-[0.06em] text-orange-600 uppercase shadow-[0_4px_12px_rgb(4_24_48/0.12)]">
          {eyebrow}
        </span>
      )}
      <h1 className="font-display text-[28px] leading-[34px] font-semibold text-white [text-shadow:0_1px_2px_rgb(4_24_48/0.35),0_6px_18px_rgb(4_24_48/0.25)] sm:text-[34px] sm:leading-[40px]">
        {title}
      </h1>
      <span className="h-[3px] w-6 rounded-full bg-orange-500" aria-hidden="true" />
      {children && <div className="text-[15px] leading-6 text-white/90 [text-shadow:0_1px_2px_rgb(4_24_48/0.35)]">{children}</div>}
    </div>
  );
}

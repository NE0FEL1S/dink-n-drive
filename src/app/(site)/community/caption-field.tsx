"use client";

import { useId } from "react";

export const CAPTION_MAX = 2000;

/** Caption textarea (16 px so iOS doesn't zoom), with a character count. */
export function CaptionField({
  label,
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-navy-900">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={CAPTION_MAX}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder="How was the game?"
        aria-describedby={`${id}-count`}
        className={
          "max-h-60 min-h-24 w-full resize-y rounded-[var(--radius-control)] border border-line bg-white px-4 py-3 text-base leading-6 text-navy-900 " +
          "placeholder:text-slate-300 outline-none transition-[border-color,box-shadow] duration-150 " +
          "focus:border-orange-600 focus:ring-2 focus:ring-orange-500/40 disabled:bg-ice-50"
        }
      />
      <p id={`${id}-count`} className="text-right text-sm text-slate-500 tabular-nums">
        {value.length.toLocaleString("en-PH")}/{CAPTION_MAX.toLocaleString("en-PH")}
      </p>
    </div>
  );
}

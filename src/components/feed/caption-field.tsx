"use client";

import { useId } from "react";

export const CAPTION_MAX = 2000;

/** Caption / message textarea (16 px so iOS doesn't zoom), with a character count. Community and Feedback. */
export function CaptionField({
  label,
  value,
  onChange,
  disabled,
  autoFocus,
  placeholder = "How was the game?",
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  /** A line under the label (e.g. what makes good feedback). */
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-navy-900">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="-mt-0.5 text-sm text-slate-500">
          {hint}
        </p>
      )}
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={CAPTION_MAX}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint ${id}-count` : `${id}-count`}
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

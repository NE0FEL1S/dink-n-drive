"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type Props = {
  /** Renders the trigger; receives the props it must spread on its <button>. */
  trigger: (props: {
    "aria-expanded": boolean;
    "aria-controls": string;
    "aria-haspopup": "menu";
    onClick: () => void;
  }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  className?: string;
};

/**
 * Minimal dropdown: closes on outside tap, Escape, or when an item calls close().
 * Rows inside should be ≥ 48px tall (DESIGN §6).
 */
export function Dropdown({ trigger, children, align = "right", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        "aria-expanded": open,
        "aria-controls": panelId,
        "aria-haspopup": "menu",
        onClick: () => setOpen((value) => !value),
      })}
      <div
        id={panelId}
        role="menu"
        hidden={!open}
        className={`absolute top-[calc(100%+8px)] z-50 grid min-w-56 overscroll-contain rounded-[var(--radius-card)] border border-line bg-white p-1.5 shadow-[0_16px_40px_rgb(15_27_51/0.18)] ${align === "right" ? "right-0" : "left-0"} ${className}`}
      >
        {children(close)}
      </div>
    </div>
  );
}

export const menuItemClass =
  "flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-control)] px-3.5 text-left text-[15px] font-semibold text-navy-900 hover:bg-ice-50 active:bg-ice-100";

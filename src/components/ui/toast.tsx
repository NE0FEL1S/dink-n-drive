"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

type Props = {
  tone: "success" | "error";
  children: React.ReactNode;
  onDismiss: () => void;
  /** Hides itself after this long (ms). Errors stay until dismissed. */
  autoHideMs?: number;
};

/**
 * A message pinned near the top of the screen, under the header (DESIGN §4: toasts go at
 * the top on phones, away from thumbs). Visible wherever the list has been scrolled to.
 */
export function Toast({ tone, children, onDismiss, autoHideMs = 6000 }: Props) {
  useEffect(() => {
    if (tone === "error") return;
    const id = window.setTimeout(onDismiss, autoHideMs);
    return () => window.clearTimeout(id);
  }, [tone, autoHideMs, onDismiss, children]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+76px)] z-30 flex justify-center px-4 md:top-[calc(env(safe-area-inset-top)+84px)]">
      <div
        role={tone === "error" ? "alert" : "status"}
        className={
          "pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-[var(--radius-control)] py-1 pr-1 pl-4 text-sm font-medium shadow-[var(--shadow-soft)] ring-1 " +
          (tone === "error" ? "bg-danger-bg text-danger ring-danger/20" : "bg-success-bg text-success ring-success/20")
        }
      >
        <p className="min-w-0 flex-1 py-2.5">{children}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid size-11 shrink-0 touch-manipulation place-items-center rounded-full hover:bg-white/50 active:bg-white/70"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { CloseGuardContext } from "@/components/close-guard";

/**
 * A popup controlled by state (DESIGN §4): bottom sheet on phones, centred dialog on laptops.
 * Same look as the "Book now" popup (`.booking-sheet`). Content can register a close guard
 * (useCloseGuard): then a backdrop tap is ignored and ✕ / Esc ask first.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const guard = useRef<string | null>(null);
  const titleId = useId();
  const setGuard = useCallback((message: string | null) => {
    guard.current = message;
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.focus({ preventScroll: true });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);
  useEffect(() => {
    const dialog = ref.current;
    return () => dialog?.close(); // also when the page hides it (cacheComponents keeps routes mounted)
  }, []);

  const close = () => {
    if (guard.current && !window.confirm(guard.current)) return;
    onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      tabIndex={-1}
      className="booking-sheet sheet-fit outline-none"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !guard.current) onClose();
      }}
    >
      <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden="true" />
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="absolute top-3 right-3 z-10 grid size-12 touch-manipulation place-items-center rounded-full text-navy-700 hover:bg-ice-50 active:bg-ice-100"
      >
        <X className="size-6" aria-hidden="true" />
      </button>
      <header className="shrink-0 px-4 pt-3 pr-16 pb-3 sm:px-6 sm:pt-6">
        <h2 id={titleId} className="font-display text-[22px] leading-[28px] font-semibold text-navy-900">
          {title}
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6">
        {open && <CloseGuardContext value={setGuard}>{children}</CloseGuardContext>}
      </div>
    </dialog>
  );
}

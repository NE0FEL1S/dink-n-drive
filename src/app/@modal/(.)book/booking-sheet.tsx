"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * The "Book now" popup (DESIGN.md §4–5): a bottom sheet on phones, a centred dialog on
 * laptops. It's a native <dialog> (focus trap, Esc, top layer). Closing goes back in
 * history, so the URL returns to the page underneath.
 */
export function BookingSheet({ children }: { children: ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.focus({ preventScroll: true }); // start on the sheet itself, not on the close button
    // cacheComponents keeps a closed route mounted but hidden (<Activity>): close the modal
    // dialog then, or the page underneath would stay inert
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="booking-sheet-title"
      tabIndex={-1}
      className="booking-sheet outline-none"
      onCancel={(e) => {
        e.preventDefault();
        router.back();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) router.back(); // tap on the dimmed backdrop
      }}
    >
      <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden="true" />
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Close"
        className="absolute top-3 right-3 z-10 grid size-12 touch-manipulation place-items-center rounded-full text-navy-700 hover:bg-ice-50 active:bg-ice-100"
      >
        <X className="size-6" aria-hidden="true" />
      </button>
      {children}
    </dialog>
  );
}

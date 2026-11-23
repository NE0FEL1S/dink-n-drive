import { Suspense } from "react";
import { BookingData, BookingSkeleton, BookingSubtitle } from "@/app/(site)/book/booking-data";
import { BookingSheet } from "./booking-sheet";

/**
 * Intercepts /book when it's opened from inside the app (e.g. "Book now" on the landing
 * page) and shows the booking UI in a popup over the current page. A direct visit or a
 * refresh renders the full page at src/app/(site)/book instead.
 */
export default function BookModal() {
  return (
    <BookingSheet>
      <header className="shrink-0 px-4 pt-3 pr-16 pb-4 sm:px-6 sm:pt-6">
        <h2 id="booking-sheet-title" className="font-display text-[24px] leading-[30px] font-semibold text-navy-900">
          Book the court
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          <Suspense fallback={null}>
            <BookingSubtitle />
          </Suspense>
        </p>
      </header>
      <Suspense
        fallback={
          <div className="px-4 sm:px-6">
            <BookingSkeleton />
          </div>
        }
      >
        <BookingData variant="sheet" />
      </Suspense>
    </BookingSheet>
  );
}

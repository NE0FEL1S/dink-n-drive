import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { BookingData, BookingSkeleton, BookingSubtitle } from "./booking-data";

export const metadata: Metadata = { title: "Book the court" };

/**
 * /book as a full page (direct links, refresh). "Book now" on the landing page opens the
 * same UI as a popup instead (src/app/@modal/(.)book).
 */
export default function BookPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-6 min-[390px]:px-5 sm:pt-12">
      <Card className="p-5 sm:p-7">
        <h1 className="font-display text-[28px] leading-[34px] font-semibold text-navy-900">Book the court</h1>
        <p className="mt-1 text-[15px] text-slate-500">
          <Suspense fallback={null}>
            <BookingSubtitle />
          </Suspense>
        </p>
        <div className="mt-5">
          <Suspense fallback={<BookingSkeleton />}>
            <BookingData variant="page" />
          </Suspense>
        </div>
      </Card>
      <div className="h-[calc(2rem+env(safe-area-inset-bottom))]" />
    </main>
  );
}

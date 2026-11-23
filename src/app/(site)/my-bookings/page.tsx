import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { getProfile } from "@/lib/auth";
import { nowMs } from "@/lib/booking-time";
import { readDeviceToken } from "@/lib/device-token";
import { gcashQr } from "@/lib/gcash";
import { getPublicSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { BookingList } from "./booking-list";

export const metadata: Metadata = { title: "My bookings" };

/**
 * My Bookings (SPEC §4): signed-in customers see their account's bookings (plus any guest
 * bookings still unclaimed in this browser); guests see the bookings made in this browser,
 * found through the device-token cookie. Unpaid ones can be paid or cancelled here.
 */
export default function MyBookingsPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] min-[390px]:px-5 sm:pt-12">
      <PageHeader eyebrow="Your games" title="My bookings">
        Upcoming games, payments and past bookings.
      </PageHeader>
      <div className="mt-6">
        <Suspense fallback={<ListSkeleton />}>
          <MyBookingsData />
        </Suspense>
      </div>
    </main>
  );
}

async function MyBookingsData() {
  await connection();
  const [profile, token, settings, supabase] = await Promise.all([getProfile(), readDeviceToken(), getPublicSettings(), createClient()]);
  const { data, error } = await supabase.rpc("my_bookings", { p_guest_token: token ?? undefined });

  if (error) {
    return (
      <p role="alert" className="rounded-[var(--radius-card)] bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger">
        We couldn&apos;t load your bookings. Please refresh the page.
      </p>
    );
  }

  return (
    <BookingList
      bookings={data ?? []}
      serverNow={nowMs()}
      isGuest={!profile}
      qr={gcashQr(settings.gcash_qr_path)}
      holdMinutes={settings.hold_minutes}
    />
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading your bookings">
      <div className="h-[52px] animate-pulse rounded-full bg-white/70" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-[var(--radius-card)] bg-white/70" />
      ))}
    </div>
  );
}

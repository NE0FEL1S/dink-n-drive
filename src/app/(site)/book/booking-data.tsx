import { connection } from "next/server";
import { getProfile } from "@/lib/auth";
import { loadTakenHours } from "@/lib/availability";
import { manilaDay, nowMs as readClock } from "@/lib/booking-time";
import { hourLabel, peso } from "@/lib/format";
import { getPublicSettings } from "@/lib/settings";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { toLocalPhMobile } from "@/lib/phone";
import { BookingFlow } from "./booking-flow";

/**
 * Loads what the booking UI needs (settings, today in Manila, today's taken hours) and
 * renders it. Shared by the /book page and the "Book now" popup (@modal/(.)book).
 * Reads the clock, so render it inside <Suspense>.
 */
export async function BookingData({ variant }: { variant: "sheet" | "page" }) {
  await connection();
  const [s, profile] = await Promise.all([getPublicSettings(), getProfile()]);
  const nowMs = readClock(); // request time (after connection())
  const today = manilaDay(nowMs);
  let taken: number[] | null = null;
  try {
    taken = await loadTakenHours(today, s);
  } catch {
    taken = null; // the client retries
  }

  return (
    <BookingFlow
      variant={variant}
      today={today}
      nowMs={nowMs}
      initialTaken={taken}
      settings={{
        hourlyRate: s.hourly_rate,
        paddleFee: s.paddle_fee,
        paddleCount: s.paddle_count,
        openHour: s.open_hour,
        closeHour: s.close_hour,
        maxAdvanceDays: s.max_advance_days,
        holdMinutes: s.hold_minutes,
      }}
      account={
        profile
          ? { name: profile.full_name, email: profile.email, phone: profile.phone ? toLocalPhMobile(profile.phone) : null }
          : null
      }
      qr={s.gcash_qr_path ? gcashQr(s.gcash_qr_path) : null}
    />
  );
}

/** Public URLs of the GCash QR in the site-assets bucket (plain + "download" variant for Save QR). */
function gcashQr(path: string) {
  const url = `${SUPABASE_URL}/storage/v1/object/public/site-assets/${path.split("/").map(encodeURIComponent).join("/")}`;
  return { url, downloadUrl: `${url}?download=dink-n-drive-gcash-qr.jpg` };
}

/** "₱250 per hour · open 8 AM – 12 AM" (from settings). */
export async function BookingSubtitle() {
  const s = await getPublicSettings();
  return (
    <>
      <span className="tabular">{peso(s.hourly_rate)}</span> per hour · open {hourLabel(s.open_hour)} – {hourLabel(s.close_hour)}
    </>
  );
}

export function BookingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading available hours">
      <div className="h-5 w-32 rounded bg-ice-100" />
      <div className="mt-3 flex gap-2 overflow-hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-[68px] w-[58px] shrink-0 animate-pulse rounded-[var(--radius-control)] bg-ice-100" />
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-[var(--radius-control)] bg-ice-100" />
        ))}
      </div>
    </div>
  );
}

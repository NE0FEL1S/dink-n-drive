"use server";

import { z } from "zod";
import { bookingError, type BookingErrorInfo } from "@/lib/booking-errors";
import { readDeviceToken } from "@/lib/device-token";
import { createClient } from "@/lib/supabase/server";

export type CancelResult = { ok: true } | { ok: false; error: BookingErrorInfo };

/** Unpaid booking → cancelled (free, instant). The database checks ownership and status. */
export async function cancelUnpaidBooking(bookingId: string): Promise<CancelResult> {
  if (!z.uuid().safeParse(bookingId).success) return { ok: false, error: bookingError("not_found") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_unpaid_booking", {
    p_booking_id: bookingId,
    p_guest_token: (await readDeviceToken()) ?? undefined,
  });
  if (error) return { ok: false, error: bookingError(error.message) };
  return { ok: true };
}

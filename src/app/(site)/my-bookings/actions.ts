"use server";

import { z } from "zod";
import { bookingError, type BookingErrorInfo } from "@/lib/booking-errors";
import { readDeviceToken } from "@/lib/device-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { gcashNameSchema, phMobileSchema } from "@/lib/validation";

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

export type RequestCancellationResult =
  | { ok: true; refundAmount: number }
  | { ok: false; error: BookingErrorInfo; fields?: Partial<Record<"gcashName" | "gcashNumber", string>> };

const requestSchema = z.object({
  bookingId: z.uuid(),
  gcashName: gcashNameSchema,
  gcashNumber: phMobileSchema,
});

/**
 * Paid booking → cancellation request (SPEC §6). The database checks ownership, status
 * and the cutoff, and works out the refund from the fee saved on the booking.
 */
export async function requestCancellation(input: { bookingId: string; gcashName: string; gcashNumber: string }): Promise<RequestCancellationResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Partial<Record<"gcashName" | "gcashNumber", string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "bookingId") return { ok: false, error: bookingError("not_found") };
      if (key === "gcashName" || key === "gcashNumber") fields[key] ??= issue.message;
    }
    return { ok: false, error: { message: "Check the GCash details below." }, fields };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_cancellation", {
    p_booking_id: parsed.data.bookingId,
    p_gcash_name: parsed.data.gcashName,
    p_gcash_number: parsed.data.gcashNumber,
    p_guest_token: (await readDeviceToken()) ?? undefined,
  });
  if (error || !data?.[0]) {
    const info = bookingError(error?.message, error?.details);
    return { ok: false, error: info, fields: info.field === "gcashName" || info.field === "gcashNumber" ? { [info.field]: info.message } : undefined };
  }
  return { ok: true, refundAmount: data[0].refund_amount };
}

export type RefundProofResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * A short-lived link to the owner's refund screenshot. Guests can't read storage, so
 * my_refund_proof() checks that this caller (account or this browser) owns the booking,
 * and the link is signed with the secret key only after that.
 */
export async function refundProofUrl(bookingId: string): Promise<RefundProofResult> {
  if (!z.uuid().safeParse(bookingId).success) return { ok: false, error: bookingError("not_found").message };
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("my_refund_proof", {
    p_booking_id: bookingId,
    p_guest_token: (await readDeviceToken()) ?? undefined,
  });
  if (error || !path) return { ok: false, error: "We couldn't find a refund screenshot for this booking." };

  const { data, error: signError } = await createAdminClient().storage.from("refund-proofs").createSignedUrl(path, 5 * 60);
  if (signError || !data) return { ok: false, error: "We couldn't load the screenshot. Please try again." };
  return { ok: true, url: data.signedUrl };
}

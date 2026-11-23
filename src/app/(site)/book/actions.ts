"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { loadTakenHours } from "@/lib/availability";
import { bookingError, type BookingErrorInfo } from "@/lib/booking-errors";
import { addDays, manilaDay } from "@/lib/booking-time";
import { ensureDeviceToken, readDeviceToken } from "@/lib/device-token";
import { getPublicSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, fullNameSchema, phMobileSchema } from "@/lib/validation";

/* ---------------------------------------------------------------------------------------------- */
/* availability                                                                                    */
/* ---------------------------------------------------------------------------------------------- */

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type AvailabilityResult = { ok: true; day: string; taken: number[] } | { ok: false; day: string };

/** Taken hours for a day in the booking window (today … today + max_advance_days). */
export async function fetchAvailability(day: string): Promise<AvailabilityResult> {
  const parsed = daySchema.safeParse(day);
  if (!parsed.success) return { ok: false, day };

  const s = await getPublicSettings();
  const today = manilaDay(Date.now());
  if (parsed.data < today || parsed.data > addDays(today, s.max_advance_days)) return { ok: false, day };

  try {
    return { ok: true, day, taken: await loadTakenHours(parsed.data, s) };
  } catch {
    return { ok: false, day };
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* create booking                                                                                  */
/* ---------------------------------------------------------------------------------------------- */

export type CreatedBooking = { id: string; ref: string; holdExpiresAt: string; total: number };

export type CreateBookingResult =
  | { ok: true; booking: CreatedBooking; serverNow: number }
  | { ok: false; error: BookingErrorInfo; fields?: Partial<Record<"name" | "email" | "phone", string>> };

const slotSchema = z.object({
  startAt: z.iso.datetime(),
  hours: z.number().int().min(1).max(24),
  paddles: z.boolean(),
});

export type CreateBookingInput = z.input<typeof slotSchema> & { name?: string; email?: string; phone?: string };

/**
 * Creates a pending_payment booking with create_booking(). Guests send name, email and
 * phone, and get the device-token cookie. Signed-in customers' details come from their
 * profile; a missing phone (or name) is sent here and saved to the profile by the function.
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const slot = slotSchema.safeParse(input);
  if (!slot.success) return { ok: false, error: bookingError("invalid_hours") };

  const profile = await getProfile();
  const fields: Partial<Record<"name" | "email" | "phone", string>> = {};
  let name: string | undefined;
  let email: string | undefined;
  let phone: string | undefined;

  const check = <T>(key: "name" | "email" | "phone", schema: z.ZodType<T>, value: unknown) => {
    const r = schema.safeParse(value ?? "");
    if (!r.success) fields[key] = r.error.issues[0]?.message ?? "Check this field.";
    return r.success ? r.data : undefined;
  };

  if (profile) {
    if (!profile.full_name) name = check("name", fullNameSchema, input.name);
    if (!profile.phone) phone = check("phone", phMobileSchema, input.phone);
  } else {
    name = check("name", fullNameSchema, input.name);
    email = check("email", emailSchema, input.email);
    phone = check("phone", phMobileSchema, input.phone);
  }
  if (Object.keys(fields).length) {
    return { ok: false, error: { message: "Please check the highlighted fields." }, fields };
  }

  const token = profile ? null : await ensureDeviceToken();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_booking", {
    p_start_at: slot.data.startAt,
    p_hours: slot.data.hours,
    p_paddles: slot.data.paddles,
    p_name: name,
    p_email: email,
    p_phone: phone,
    p_guest_token: token ?? undefined,
  });

  const row = data?.[0];
  if (error || !row) {
    const info = bookingError(error?.message, error?.details);
    return { ok: false, error: info, fields: info.field ? { [info.field]: info.message } : undefined };
  }

  return {
    ok: true,
    serverNow: Date.now(),
    booking: { id: row.booking_id, ref: row.ref_code, holdExpiresAt: row.hold_expires_at, total: row.total },
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* payment proof                                                                                   */
/* ---------------------------------------------------------------------------------------------- */

const idSchema = z.uuid();

export type StartUploadResult = { ok: true; path: string; uploadToken: string } | { ok: false; error: BookingErrorInfo };

/**
 * Step 1 of the upload: check (in the database) that this caller owns the booking and its
 * hold is live, then issue a one-time signed upload URL into payment-proofs/<booking id>/.
 * Storage itself stays closed to anonymous writes.
 */
export async function startProofUpload(bookingId: string): Promise<StartUploadResult> {
  if (!idSchema.safeParse(bookingId).success) return { ok: false, error: bookingError("not_found") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("check_payment_upload", {
    p_booking_id: bookingId,
    p_guest_token: (await readDeviceToken()) ?? undefined,
  });
  if (error) return { ok: false, error: bookingError(error.message) };

  const path = `${bookingId}/${Date.now()}-${randomBytes(6).toString("hex")}.jpg`;
  const { data, error: urlError } = await createAdminClient().storage.from("payment-proofs").createSignedUploadUrl(path);
  if (urlError || !data) return { ok: false, error: bookingError(undefined) };
  return { ok: true, path: data.path, uploadToken: data.token };
}

export type SubmitProofResult = { ok: true } | { ok: false; error: BookingErrorInfo };

/** Step 2: the file is in storage; record it (booking → pending_review). */
export async function submitProof(bookingId: string, path: string): Promise<SubmitProofResult> {
  if (!idSchema.safeParse(bookingId).success) return { ok: false, error: bookingError("not_found") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_payment_proof", {
    p_booking_id: bookingId,
    p_path: path,
    p_guest_token: (await readDeviceToken()) ?? undefined,
  });
  if (error) return { ok: false, error: bookingError(error.message) };
  return { ok: true };
}

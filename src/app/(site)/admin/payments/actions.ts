"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { adminError } from "@/lib/admin-errors";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ReviewResult = { ok: true } | { ok: false; error: string; stale?: boolean };

const rejectSchema = z.object({
  bookingId: z.uuid(),
  reason: z.string().trim().min(1).max(500),
});

/** Pending review → confirmed. The database checks the owner role and the status again. */
export async function approvePayment(bookingId: string): Promise<ReviewResult> {
  await requireOwner();
  if (!z.uuid().safeParse(bookingId).success) return { ok: false, error: adminError("not_found") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_approve_payment", { p_booking_id: bookingId });
  if (error) {
    if (error.message === "not_pending_review") refresh();
    return { ok: false, error: adminError(error.message), stale: error.message === "not_pending_review" };
  }
  refresh(); // the queue, the Payments badge and the Overview count
  return { ok: true };
}

/** Pending review → rejected with a reason the customer sees in My bookings. The hours reopen. */
export async function rejectPayment(bookingId: string, reason: string): Promise<ReviewResult> {
  await requireOwner();
  const parsed = rejectSchema.safeParse({ bookingId, reason });
  if (!parsed.success) {
    const badId = parsed.error.issues.some((i) => i.path[0] === "bookingId");
    return { ok: false, error: adminError(badId ? "not_found" : "invalid_reason") };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reject_payment", {
    p_booking_id: parsed.data.bookingId,
    p_reason: parsed.data.reason,
  });
  if (error) {
    if (error.message === "not_pending_review") refresh();
    return { ok: false, error: adminError(error.message), stale: error.message === "not_pending_review" };
  }
  refresh();
  return { ok: true };
}

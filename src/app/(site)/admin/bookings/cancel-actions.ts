"use server";

import { z } from "zod";
import { adminError, adminRpcError } from "@/lib/admin-errors";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { gcashNameSchema, phMobileSchema } from "@/lib/validation";

export type OwnerCancelResult =
  | { ok: true; refundAmount: number }
  | { ok: false; error: string; fields?: Partial<Record<"gcashName" | "gcashNumber", string>> };

const paidSchema = z.object({ gcashName: gcashNameSchema, gcashNumber: phMobileSchema });

/**
 * The owner cancels a customer booking (SPEC §6): any time, no fee. Unpaid → just cancelled.
 * Paid → a full refund, already approved, to the GCash details given here (it then waits in
 * Refunds → To send). The page isn't refreshed here: the sheet shows the result first.
 */
export async function ownerCancelBooking(input: { bookingId: string; paid: boolean; gcashName?: string; gcashNumber?: string }): Promise<OwnerCancelResult> {
  await requireOwner();
  if (!z.uuid().safeParse(input.bookingId).success) return { ok: false, error: adminError("not_found") };

  let gcash: z.output<typeof paidSchema> | null = null;
  if (input.paid) {
    const parsed = paidSchema.safeParse({ gcashName: input.gcashName ?? "", gcashNumber: input.gcashNumber ?? "" });
    if (!parsed.success) {
      const fields: Partial<Record<"gcashName" | "gcashNumber", string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "gcashName" || key === "gcashNumber") fields[key] ??= issue.message;
      }
      return { ok: false, error: "Check the GCash details below.", fields };
    }
    gcash = parsed.data;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_cancel_booking", {
    p_booking_id: input.bookingId,
    p_gcash_name: gcash?.gcashName,
    p_gcash_number: gcash?.gcashNumber,
  });
  if (error || !data?.[0]) return { ok: false, error: error ? adminRpcError("admin_cancel_booking", error) : adminError(undefined) };
  return { ok: true, refundAmount: data[0].refund_amount };
}

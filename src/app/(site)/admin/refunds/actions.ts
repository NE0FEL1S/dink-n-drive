"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { adminError, adminRpcError } from "@/lib/admin-errors";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type RefundActionResult = { ok: true } | { ok: false; error: string; stale?: boolean };

/** Keys that mean "someone already handled this": drop the card and reload the list. */
const STALE = new Set(["not_requested", "not_approved", "not_found"]);

function failed(fn: string, error: { message: string; code?: string }): RefundActionResult {
  const stale = STALE.has(error.message);
  if (stale) refresh();
  return { ok: false, error: adminRpcError(fn, error), stale };
}

/** Request → booking cancelled (by the customer), refund approved: next, send it by GCash. */
export async function approveCancellation(refundId: string): Promise<RefundActionResult> {
  await requireOwner();
  if (!z.uuid().safeParse(refundId).success) return { ok: false, error: adminError("not_found") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_approve_cancellation", { p_refund_id: refundId });
  if (error) return failed("admin_approve_cancellation", error);
  refresh(); // the lists, the Refunds badge
  return { ok: true };
}

const declineSchema = z.object({ refundId: z.uuid(), reason: z.string().trim().min(1).max(500) });

/** Request → declined (reason shown to the customer); the booking goes back to how it was. */
export async function declineCancellation(refundId: string, reason: string): Promise<RefundActionResult> {
  await requireOwner();
  const parsed = declineSchema.safeParse({ refundId, reason });
  if (!parsed.success) {
    const badId = parsed.error.issues.some((i) => i.path[0] === "refundId");
    return { ok: false, error: adminError(badId ? "not_found" : "invalid_reason") };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_decline_cancellation", { p_refund_id: parsed.data.refundId, p_reason: parsed.data.reason });
  if (error) return failed("admin_decline_cancellation", error);
  refresh();
  return { ok: true };
}

export type RefundUpload = { ok: true; path: string; token: string } | { ok: false; error: string; stale?: boolean };

/**
 * Step 1 of "Mark refunded": a one-time signed upload URL for the GCash refund screenshot,
 * at refund-proofs/<booking_id>/refund-<random>.jpg (storage RLS: only the owner may upload).
 */
export async function startRefundUpload(refundId: string): Promise<RefundUpload> {
  await requireOwner();
  if (!z.uuid().safeParse(refundId).success) return { ok: false, error: adminError("not_found") };
  const supabase = await createClient();
  const { data: refund } = await supabase.from("refunds").select("booking_id, status").eq("id", refundId).maybeSingle();
  if (!refund || refund.status !== "approved") {
    refresh();
    return { ok: false, error: adminError(refund ? "not_approved" : "not_found"), stale: true };
  }
  const path = `${refund.booking_id}/refund-${randomBytes(6).toString("hex")}.jpg`;
  const { data, error } = await supabase.storage.from("refund-proofs").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[admin] refund upload URL failed:", error?.message);
    return { ok: false, error: "We couldn't start the upload. Please try again." };
  }
  return { ok: true, path: data.path, token: data.token };
}

/** Step 2: the screenshot is uploaded → refund completed (GCash number erased, kept fee counts). */
export async function completeRefund(refundId: string, path: string): Promise<RefundActionResult> {
  await requireOwner();
  if (!z.uuid().safeParse(refundId).success || !/^[0-9a-f-]{36}\/refund-[0-9a-f]{12}\.jpg$/.test(path)) {
    return { ok: false, error: adminError("invalid_path") };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_complete_refund", { p_refund_id: refundId, p_proof_path: path });
  if (error) return failed("admin_complete_refund", error);
  refresh();
  return { ok: true };
}

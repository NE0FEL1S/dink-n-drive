import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * PostgREST filter for bookings whose GCash screenshot waits for the owner: pending_review,
 * plus bookings whose customer asked to cancel before the payment was checked (the request
 * can't be decided until it is).
 */
export const AWAITING_PAYMENT_REVIEW = "status.eq.pending_review,and(status.eq.cancel_requested,status_before_request.eq.pending_review)";

/**
 * How many bookings have a GCash screenshot waiting for the owner (the Payments badge).
 * RLS lets only the owner see other people's bookings. Deduplicated per request.
 */
export const getPendingReviewCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("kind", "customer")
    .or(AWAITING_PAYMENT_REVIEW);
  if (error) throw new Error(`pending review count: ${error.message}`);
  return count ?? 0;
});

/**
 * Refunds that need the owner (the Refunds badge): cancellation requests to decide, and
 * approved refunds still to send by GCash.
 */
export const getRefundsToDoCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("refunds")
    .select("id", { count: "exact", head: true })
    .in("status", ["requested", "approved"]);
  if (error) throw new Error(`refunds count: ${error.message}`);
  return count ?? 0;
});

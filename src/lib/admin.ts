import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * How many bookings have a GCash screenshot waiting for the owner (the Payments badge).
 * RLS lets only the owner see other people's bookings. Deduplicated per request.
 */
export const getPendingReviewCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review");
  if (error) throw new Error(`pending review count: ${error.message}`);
  return count ?? 0;
});

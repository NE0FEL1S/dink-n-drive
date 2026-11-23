import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { readDeviceToken } from "./device-token";

/**
 * SPEC §4: when a guest signs in on the same browser, their guest bookings move to the
 * account (so they show on any device). Call right after a successful sign-in / sign-up,
 * with the client that holds the new session. Never blocks sign-in if it fails.
 */
export async function claimGuestBookings(supabase: SupabaseClient<Database>): Promise<void> {
  const token = await readDeviceToken();
  if (!token) return;
  const { error } = await supabase.rpc("claim_guest_bookings", { p_guest_token: token });
  if (error) console.error("claim_guest_bookings failed:", error.message);
}

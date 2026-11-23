import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase/env";

export type PublicSettings = Pick<
  Database["public"]["Tables"]["settings"]["Row"],
  "court_name" | "hourly_rate" | "paddle_fee" | "paddle_count" | "open_hour" | "close_hour" | "hold_minutes" | "cancel_cutoff_hours" | "cancel_fee" | "max_advance_days"
>;

/** Tag to pass to updateTag() whenever the owner changes settings (Phase 3). */
export const SETTINGS_TAG = "settings";

/**
 * Public business settings (prices, hours, hold time…). Anyone can read the
 * settings row, so this uses an anonymous client (no cookies) and is cached.
 */
export async function getPublicSettings(): Promise<PublicSettings> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("hours");

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("settings")
    .select("court_name, hourly_rate, paddle_fee, paddle_count, open_hour, close_hour, hold_minutes, cancel_cutoff_hours, cancel_fee, max_advance_days")
    .single();

  if (error || !data) {
    throw new Error(`Could not load settings: ${error?.message ?? "no row"}`);
  }
  return data;
}

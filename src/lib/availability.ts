import "server-only";

import { takenHoursOf } from "@/lib/booking-time";
import type { PublicSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

/**
 * Taken hours of one Manila day, from the public get_availability() function
 * (time ranges only, never who booked). Customer bookings and owner blocks look the same.
 */
export async function loadTakenHours(day: string, s: Pick<PublicSettings, "open_hour" | "close_hour">): Promise<number[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_availability", { p_day: day });
  if (error) throw new Error(`Could not load availability: ${error.message}`);
  return takenHoursOf(day, data ?? [], s.open_hour, s.close_hour);
}

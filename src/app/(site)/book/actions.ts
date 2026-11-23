"use server";

import { z } from "zod";
import { loadTakenHours } from "@/lib/availability";
import { addDays, manilaDay } from "@/lib/booking-time";
import { getPublicSettings } from "@/lib/settings";

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

"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { adminError, adminRpcError } from "@/lib/admin-errors";
import { requireOwner } from "@/lib/auth";
import { manilaDay, slotStartIso, slotStartMs } from "@/lib/booking-time";
import { getPublicSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Status = Database["public"]["Enums"]["booking_status"];

/** One hour of a day as the owner sees it when blocking hours. */
export type BlockHour =
  | { hour: number; state: "free" }
  | { hour: number; state: "past" }
  | { hour: number; state: "booked"; ref: string; name: string; status: Status }
  | { hour: number; state: "blocked"; blockId: string; ref: string; note: string | null; first: boolean; start: number; end: number };

export type BlockDay = { ok: true; day: string; hours: BlockHour[] } | { ok: false; error: string };

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Every opening hour of a Manila day: free, already passed, held by a customer (pending
 * payment with a live hold, pending review, confirmed, cancellation requested) or blocked.
 */
export async function loadBlockDay(day: string): Promise<BlockDay> {
  await requireOwner();
  if (!daySchema.safeParse(day).success) return { ok: false, error: "Pick a valid day." };
  const now = Date.now();
  if (day < manilaDay(now)) return { ok: false, error: "That day has passed." };

  const s = await getPublicSettings();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, ref_code, kind, status, contact_name, block_note, start_at, hours, hold_expires_at")
    .gte("start_at", slotStartIso(day, 0))
    .lt("start_at", slotStartIso(day, 24))
    .in("status", ["pending_payment", "pending_review", "confirmed", "cancel_requested", "blocked"]);
  if (error) return { ok: false, error: "We couldn't load that day. Please try again." };

  const active = data.filter((b) => b.status !== "pending_payment" || (b.hold_expires_at && Date.parse(b.hold_expires_at) > now));
  const hours: BlockHour[] = [];
  for (let h = s.open_hour; h < s.close_hour; h++) {
    const at = slotStartMs(day, h);
    const b = active.find((x) => {
      const start = Date.parse(x.start_at);
      return start <= at && at < start + x.hours * 3_600_000;
    });
    if (b) {
      const start = h - Math.round((at - Date.parse(b.start_at)) / 3_600_000);
      hours.push(
        b.kind === "block"
          ? { hour: h, state: "blocked", blockId: b.id, ref: b.ref_code, note: b.block_note, first: start === h, start, end: start + b.hours }
          : { hour: h, state: "booked", ref: b.ref_code, name: b.contact_name ?? "", status: b.status },
      );
    } else if (slotStartMs(day, h + 1) <= now) {
      hours.push({ hour: h, state: "past" }); // the current hour can still be blocked
    } else {
      hours.push({ hour: h, state: "free" });
    }
  }
  return { ok: true, day, hours };
}

export type BlockResult = { ok: true; ref?: string } | { ok: false; error: string; stale?: boolean };

const blockSchema = z.object({
  day: daySchema,
  start: z.number().int().min(0).max(23),
  hours: z.number().int().min(1).max(24),
  note: z.string().trim().max(200),
});

/** Blocks whole hours (admin_create_block checks opening hours, the past and overlaps). */
export async function createBlock(input: z.input<typeof blockSchema>): Promise<BlockResult> {
  await requireOwner();
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) {
    const noteIssue = parsed.error.issues.some((i) => i.path[0] === "note");
    return { ok: false, error: adminError(noteIssue ? "invalid_note" : "invalid_hours") };
  }
  const { day, start, hours, note } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("admin_create_block", { p_start_at: slotStartIso(day, start), p_hours: hours, p_note: note || undefined })
    .single();
  if (error) {
    return { ok: false, error: adminRpcError("admin_create_block", error), stale: error.message === "slot_taken" || error.message === "in_the_past" };
  }
  refresh(); // the bookings list and every customer's hour grid
  return { ok: true, ref: data.ref_code };
}

/** Removes a block; its hours open up again. */
export async function removeBlock(blockId: string): Promise<BlockResult> {
  await requireOwner();
  if (!z.uuid().safeParse(blockId).success) return { ok: false, error: adminError("not_found") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_block", { p_booking_id: blockId });
  refresh();
  if (error) return { ok: false, error: adminRpcError("admin_remove_block", error), stale: error.message === "not_found" };
  return { ok: true };
}

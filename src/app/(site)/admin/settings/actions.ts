"use server";

import { randomBytes } from "node:crypto";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { SETTINGS_TAG } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------------------------- */
/* settings form                                                                                   */
/* ---------------------------------------------------------------------------------------------- */

/** A whole number from a form field, within the database's limits (supabase/migrations/*_settings.sql). */
function whole(min: number, max: number, message: string) {
  return z
    .string()
    .trim()
    .min(1, "Fill this in.")
    .regex(/^\d+$/, "Use a whole number.")
    .transform(Number)
    .pipe(z.number().min(min, message).max(max, message));
}

const settingsSchema = z
  .object({
    court_name: z.string().trim().min(1, "Enter the court name.").max(80, "Keep it under 80 characters."),
    hourly_rate: whole(0, 100_000, "Between ₱0 and ₱100,000."),
    paddle_fee: whole(0, 100_000, "Between ₱0 and ₱100,000."),
    paddle_count: whole(0, 100, "Between 0 and 100."),
    open_hour: whole(0, 23, "Pick an opening hour."),
    close_hour: whole(1, 24, "Pick a closing hour."),
    hold_minutes: whole(1, 240, "Between 1 and 240 minutes."),
    max_advance_days: whole(1, 365, "Between 1 and 365 days."),
    max_unpaid_bookings: whole(1, 20, "Between 1 and 20."),
    cancel_cutoff_hours: whole(0, 168, "Between 0 and 168 hours (7 days)."),
    cancel_fee: whole(0, 100_000, "Between ₱0 and ₱100,000."),
  })
  .refine((s) => s.open_hour < s.close_hour, { path: ["close_hour"], message: "Closing must be after opening." });

export type SettingsField = keyof z.input<typeof settingsSchema>;
export type SettingsState = {
  ok?: boolean;
  /** Changes each save, so the "Saved" toast shows again for a second save. */
  savedAt?: number;
  error?: string;
  fields?: Partial<Record<SettingsField, string>>;
  values?: Partial<Record<SettingsField, string>>;
};

const FIELDS = Object.keys(settingsSchema.shape) as SettingsField[];

/**
 * Saves the business settings (SPEC §1: everything the owner can change without code).
 * RLS lets only the owner update the row; table constraints check the values again.
 * New bookings use the new values; existing bookings keep the rates they were made with.
 */
export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireOwner();
  const raw = Object.fromEntries(FIELDS.map((k) => [k, formData.get(k)?.toString() ?? ""])) as Record<SettingsField, string>;
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: SettingsState["fields"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as SettingsField;
      fields[key] ??= issue.message;
    }
    return { error: "Check the highlighted fields.", fields, values: raw };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("settings").update(parsed.data).eq("id", true);
  if (error) {
    console.error("[admin] save settings failed:", error.code, error.message);
    return { error: "We couldn't save the settings. Please try again.", values: raw };
  }
  updateTag(SETTINGS_TAG); // prices, hours and fees everywhere on the site
  refresh();
  // the saved values, so the fields keep showing them after React resets the form
  return { ok: true, savedAt: Date.now(), values: raw };
}

/* ---------------------------------------------------------------------------------------------- */
/* GCash QR                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

const QR_PATH = /^gcash\/qr-[0-9a-f]{12}\.(jpg|png|webp)$/;
const QR_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

export type QrUpload = { ok: true; path: string; token: string } | { ok: false; error: string };

/** Step 1: a one-time signed upload URL for a new QR image in the public site-assets bucket. */
export async function startQrUpload(contentType: string): Promise<QrUpload> {
  await requireOwner();
  const ext = QR_EXT[contentType as keyof typeof QR_EXT];
  if (!ext) return { ok: false, error: "Use a JPG, PNG or WebP image." };
  const path = `gcash/qr-${randomBytes(6).toString("hex")}.${ext}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("site-assets").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[admin] QR upload URL failed:", error?.message);
    return { ok: false, error: "We couldn't start the upload. Please try again." };
  }
  return { ok: true, path: data.path, token: data.token };
}

export type QrResult = { ok: true } | { ok: false; error: string };

/** Step 2: the image is uploaded; point the setting at it and delete QR files older than the one it replaces. */
export async function saveNewQr(path: string): Promise<QrResult> {
  await requireOwner();
  if (!QR_PATH.test(path)) return { ok: false, error: "That upload didn't work. Please try again." };

  const supabase = await createClient();
  const name = path.slice("gcash/".length);
  const { data: found } = await supabase.storage.from("site-assets").list("gcash", { search: name, limit: 1 });
  if (!found?.some((f) => f.name === name)) return { ok: false, error: "The upload didn't finish. Please try again." };

  const { data: before } = await supabase.from("settings").select("gcash_qr_path").single();
  const { error } = await supabase.from("settings").update({ gcash_qr_path: path }).eq("id", true);
  if (error) {
    console.error("[admin] set QR failed:", error.code, error.message);
    return { ok: false, error: "We couldn't save the new QR. Please try again." };
  }

  // Keep the QR being replaced: other deployments on the same database (staging, production,
  // a laptop) may still show it from their cached settings for up to an hour. Older ones go.
  const keep = new Set([name, before?.gcash_qr_path?.slice("gcash/".length)]);
  const { data: files } = await supabase.storage.from("site-assets").list("gcash", { limit: 100 });
  const stale = (files ?? []).filter((f) => /^qr-[0-9a-f]+\.(jpg|png|webp)$/.test(f.name) && !keep.has(f.name)).map((f) => `gcash/${f.name}`);
  if (stale.length) {
    const { error: removeError } = await supabase.storage.from("site-assets").remove(stale);
    if (removeError) console.error("[admin] old QR files not deleted:", stale.join(", "), removeError.message);
  }
  updateTag(SETTINGS_TAG); // the booking popup and My bookings show the new QR
  refresh();
  return { ok: true };
}

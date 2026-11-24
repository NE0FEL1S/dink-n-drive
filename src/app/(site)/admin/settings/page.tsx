import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/auth";
import { manilaDateTime } from "@/lib/format";
import { gcashQr } from "@/lib/gcash";
import { createClient } from "@/lib/supabase/server";
import { GcashQrCard } from "./gcash-qr-card";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings · Admin" };

/** Settings (SPEC §4): prices, hours, hold time, cancellation rules, limits, GCash QR, court name. */
export default function AdminSettingsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Settings" />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-white/70" />}>
        <SettingsData />
      </Suspense>
    </div>
  );
}

async function SettingsData() {
  await requireOwner();
  await connection();
  const supabase = await createClient();
  const { data: s, error } = await supabase
    .from("settings")
    .select(
      "court_name, hourly_rate, paddle_fee, paddle_count, open_hour, close_hour, hold_minutes, max_advance_days, max_unpaid_bookings, cancel_cutoff_hours, cancel_fee, gcash_qr_path, updated_at, editor:profiles!settings_updated_by_fkey(full_name)",
    )
    .single();

  if (error || !s) {
    return (
      <p role="alert" className="rounded-[var(--radius-card)] bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger">
        We couldn&apos;t load the settings. Please refresh the page.
      </p>
    );
  }

  const lastChange = `Last changed ${manilaDateTime(s.updated_at)}${s.editor?.full_name ? ` by ${s.editor.full_name}` : ""}.`;
  return (
    <div className="grid gap-6">
      <SettingsForm
        initial={{
          court_name: s.court_name,
          hourly_rate: String(s.hourly_rate),
          paddle_fee: String(s.paddle_fee),
          paddle_count: String(s.paddle_count),
          open_hour: String(s.open_hour),
          close_hour: String(s.close_hour),
          hold_minutes: String(s.hold_minutes),
          max_advance_days: String(s.max_advance_days),
          max_unpaid_bookings: String(s.max_unpaid_bookings),
          cancel_cutoff_hours: String(s.cancel_cutoff_hours),
          cancel_fee: String(s.cancel_fee),
        }}
        lastChange={lastChange}
      />
      <GcashQrCard current={gcashQr(s.gcash_qr_path)?.url ?? null} />
    </div>
  );
}

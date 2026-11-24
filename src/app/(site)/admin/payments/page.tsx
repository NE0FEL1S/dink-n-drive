import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { AWAITING_PAYMENT_REVIEW } from "@/lib/admin";
import { requireOwner } from "@/lib/auth";
import { sentLabel } from "@/lib/admin-time";
import { manilaDay, nowMs } from "@/lib/booking-time";
import { manilaHour } from "@/lib/format";
import { toLocalPhMobile } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { PaymentQueue, type PaymentItem } from "./payment-queue";

export const metadata: Metadata = { title: "Payments · Admin" };

/** How long the screenshot links work. The page refreshes after every review, so this is plenty. */
const PROOF_URL_SECONDS = 60 * 60;

/**
 * Payments (SPEC §4, §5 step 7): bookings with a GCash screenshot waiting for the owner,
 * oldest first. Approve → confirmed; Reject (with a reason) → rejected, hours reopen.
 * Includes bookings whose customer asked to cancel before the payment was checked: the
 * owner checks the payment here first, then decides the request in Refunds.
 */
export default function AdminPaymentsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Payments" />
      <Suspense fallback={<QueueSkeleton />}>
        <PaymentsData />
      </Suspense>
    </div>
  );
}

async function PaymentsData() {
  await requireOwner();
  await connection();
  const now = nowMs();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, ref_code, user_id, contact_name, contact_email, contact_phone, start_at, hours, paddle_rented, total, payment_proof_path, payment_submitted_at, status",
    )
    .eq("kind", "customer")
    .or(AWAITING_PAYMENT_REVIEW)
    .order("payment_submitted_at", { ascending: true, nullsFirst: true });

  if (error) {
    return (
      <p role="alert" className="rounded-[var(--radius-card)] bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger">
        We couldn&apos;t load the payments. Please refresh the page.
      </p>
    );
  }

  // Private bucket: short-lived signed links, made with the owner's session (storage RLS).
  const paths = data.map((b) => b.payment_proof_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("payment-proofs").createSignedUrls(paths, PROOF_URL_SECONDS);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  const items: PaymentItem[] = data.map((b) => {
    const start = Date.parse(b.start_at);
    const startHour = manilaHour(new Date(start));
    return {
      id: b.id,
      ref: b.ref_code,
      day: manilaDay(start),
      startHour,
      endHour: startHour + b.hours,
      hours: b.hours,
      paddles: b.paddle_rented,
      total: b.total,
      name: b.contact_name ?? "",
      email: b.contact_email ?? "",
      phone: toLocalPhMobile(b.contact_phone),
      isGuest: b.user_id === null,
      sent: b.payment_submitted_at ? sentLabel(Date.parse(b.payment_submitted_at), now) : null,
      proofUrl: b.payment_proof_path ? (urls.get(b.payment_proof_path) ?? null) : null,
      cancelRequested: b.status === "cancel_requested",
    };
  });

  return <PaymentQueue items={items} />;
}

function QueueSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading payments">
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="h-72 animate-pulse rounded-[var(--radius-card)] bg-white/70" />
      ))}
    </div>
  );
}

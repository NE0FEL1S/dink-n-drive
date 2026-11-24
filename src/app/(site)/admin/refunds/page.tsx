import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { one } from "@/lib/admin-period";
import { sentLabel } from "@/lib/admin-time";
import { requireOwner } from "@/lib/auth";
import { manilaDay, nowMs } from "@/lib/booking-time";
import { manilaHour } from "@/lib/format";
import { toLocalPhMobile } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { RefundList, type RefundItem, type RefundView } from "./refund-list";

export const metadata: Metadata = { title: "Refunds · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** How many decided refunds History shows. */
const HISTORY_LIMIT = 30;

const VIEWS: { key: RefundView; label: string }[] = [
  { key: "requests", label: "Requests" },
  { key: "send", label: "To send" },
  { key: "history", label: "History" },
];

/**
 * Refunds (SPEC §4, §6): customers' cancellation requests to approve or decline, approved
 * refunds to send by GCash (then upload the screenshot and mark refunded), and history.
 */
export default function AdminRefundsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Refunds" />
      <Suspense fallback={<RefundsSkeleton />}>
        <RefundsData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const SELECT = `id, booking_id, status, requested_at, cancel_fee, refund_amount, gcash_name, gcash_number, decline_reason, decided_at, completed_at, refund_proof_path,
  booking:bookings!refunds_booking_id_fkey(ref_code, user_id, contact_name, contact_email, contact_phone, start_at, hours, paddle_rented, total, status, status_before_request, cancelled_by)`;

async function RefundsData({ searchParams }: { searchParams: SearchParams }) {
  await requireOwner();
  await connection();
  const sp = await searchParams;
  const now = nowMs();
  const supabase = await createClient();

  const [requests, toSend, history] = await Promise.all([
    supabase.from("refunds").select(SELECT).eq("status", "requested").order("requested_at", { ascending: true }),
    supabase.from("refunds").select(SELECT).eq("status", "approved").order("decided_at", { ascending: true }),
    supabase
      .from("refunds")
      .select(SELECT)
      .in("status", ["completed", "declined"])
      .order("updated_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  if (requests.error || toSend.error || history.error) {
    console.error("[admin] refunds load failed:", requests.error?.message ?? toSend.error?.message ?? history.error?.message);
    return (
      <p role="alert" className="rounded-[var(--radius-card)] bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger">
        We couldn&apos;t load the refunds. Please refresh the page.
      </p>
    );
  }

  const asked = one(sp.view);
  const view: RefundView =
    asked === "requests" || asked === "send" || asked === "history"
      ? asked
      : requests.data.length === 0 && toSend.data.length > 0
        ? "send"
        : "requests";
  const counts: Record<RefundView, number | null> = { requests: requests.data.length, send: toSend.data.length, history: null };
  const rows = view === "requests" ? requests.data : view === "send" ? toSend.data : history.data;

  // Refund screenshots are in a private bucket: one-hour signed links with the owner's session.
  const proofUrls = new Map<string, string>();
  const paths = rows.map((r) => r.refund_proof_path).filter((p): p is string => !!p);
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("refund-proofs").createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) if (s.path && s.signedUrl) proofUrls.set(s.path, s.signedUrl);
  }

  const items: RefundItem[] = rows.flatMap((r) => {
    const b = r.booking;
    if (!b) return [];
    const start = Date.parse(b.start_at);
    const startHour = manilaHour(new Date(start));
    return [
      {
        id: r.id,
        bookingId: r.booking_id,
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
        cancelledBy: b.status === "cancelled" ? b.cancelled_by : null,
        paymentChecked: !(b.status === "cancel_requested" && b.status_before_request === "pending_review"),
        status: r.status,
        fee: r.cancel_fee,
        refund: r.refund_amount,
        gcashName: r.gcash_name ?? "",
        gcashNumber: toLocalPhMobile(r.gcash_number),
        requested: sentLabel(Date.parse(r.requested_at), now),
        decided: r.decided_at ? sentLabel(Date.parse(r.decided_at), now) : null,
        completed: r.completed_at ? sentLabel(Date.parse(r.completed_at), now) : null,
        declineReason: r.decline_reason,
        proofUrl: r.refund_proof_path ? (proofUrls.get(r.refund_proof_path) ?? null) : null,
      },
    ];
  });

  return (
    <div className="grid gap-4">
      <nav aria-label="Refunds" className="grid grid-cols-3 gap-1 rounded-full bg-white p-1 shadow-[var(--shadow-soft)] sm:w-fit sm:min-w-[420px]">
        {VIEWS.map((v) => {
          const active = v.key === view;
          const n = counts[v.key];
          return (
            <Link
              key={v.key}
              href={`/admin/refunds?view=${v.key}`}
              aria-current={active ? "page" : undefined}
              className={
                "flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-full px-2 text-[15px] font-semibold whitespace-nowrap transition-colors duration-150 " +
                (active ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-ice-50 active:bg-ice-100")
              }
            >
              {v.label}
              {n !== null && n > 0 && <span className="tabular-nums">({n})</span>}
            </Link>
          );
        })}
      </nav>
      {/* keyed by view: a refund hidden after "Approve" must show again under To send */}
      <RefundList key={view} view={view} items={items} historyLimit={HISTORY_LIMIT} />
    </div>
  );
}

function RefundsSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading refunds">
      <div className="h-[52px] animate-pulse rounded-full bg-white/70 sm:w-[420px]" />
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="h-72 animate-pulse rounded-[var(--radius-card)] bg-white/70" />
      ))}
    </div>
  );
}

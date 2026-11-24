import "server-only";

import type { Period, StatusFilter } from "@/lib/admin-period";
import { manilaDay, slotStartIso } from "@/lib/booking-time";
import { manilaHour } from "@/lib/format";
import { toLocalPhMobile } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Status = Database["public"]["Enums"]["booking_status"];

const STATUSES: Status[] = [
  "pending_payment",
  "pending_review",
  "confirmed",
  "rejected",
  "expired",
  "cancelled",
  "cancel_requested",
  "blocked",
];

export const PAGE_SIZE = 50;

/** One row of the admin bookings table (SPEC §9 columns), ready to display or export. */
export type AdminBookingRow = {
  id: string;
  ref: string;
  isBlock: boolean;
  /** Play date (Manila), "YYYY-MM-DD". */
  day: string;
  startHour: number;
  endHour: number;
  hours: number;
  name: string;
  email: string;
  /** 09XXXXXXXXX */
  phone: string;
  isGuest: boolean;
  paddles: boolean;
  courtFee: number;
  paddleFee: number;
  total: number;
  status: Status;
  /** Counts toward earnings (SPEC §9): confirmed, or a cancellation request on a confirmed booking. */
  counted: boolean;
  proofPath: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  cancelledBy: "customer" | "owner" | null;
  /** Refund for a cancellation (not declined), once Phase 4 adds them. */
  refundAmount: number | null;
  blockNote: string | null;
};

export function parseStatusFilter(v: string | undefined): StatusFilter {
  if (v === "no_blocks") return v;
  return STATUSES.includes(v as Status) ? (v as Status) : "all";
}

/** Letters, digits, spaces and the few symbols in emails / references; nothing PostgREST treats specially. */
export function cleanSearch(q: string | undefined): string {
  return (q ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} @._+'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

type Filter = { period: Period; status: StatusFilter; q: string };

/**
 * Bookings with a play date in the period, in play order. RLS lets only the owner read
 * every row. `page` is 1-based; pass `page: null` for every row (exports).
 */
export async function loadAdminBookings({ period, status, q }: Filter, page: number | null) {
  const supabase = await createClient();
  let query = supabase
    .from("bookings")
    .select(
      "id, ref_code, kind, user_id, contact_name, contact_email, contact_phone, start_at, hours, paddle_rented, court_fee, paddle_fee, total, status, status_before_request, payment_proof_path, reviewed_at, reject_reason, cancelled_by, block_note, reviewer:profiles!bookings_reviewed_by_fkey(full_name), refunds(refund_amount, status)",
      { count: "exact" },
    )
    .gte("start_at", slotStartIso(period.from, 0))
    .lt("start_at", slotStartIso(period.to, 24));

  if (status === "no_blocks") query = query.neq("kind", "block");
  else if (status !== "all") query = query.eq("status", status);

  const term = cleanSearch(q);
  if (term) {
    const digits = term.replace(/[\s-]/g, "");
    // customers type 0917…; the database stores +63917…
    const phone = /^0?9\d+$/.test(digits) ? `+63${digits.replace(/^0/, "")}` : term;
    query = query.or(
      [
        `ref_code.ilike."%${term}%"`,
        `contact_name.ilike."%${term}%"`,
        `contact_email.ilike."%${term}%"`,
        `contact_phone.ilike."%${phone}%"`,
        `block_note.ilike."%${term}%"`,
      ].join(","),
    );
  }

  query = query.order("start_at", { ascending: true }).order("created_at", { ascending: true });
  if (page !== null) query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`admin bookings: ${error.message}`);

  const rows: AdminBookingRow[] = data.map((b) => {
    const start = Date.parse(b.start_at);
    const startHour = manilaHour(new Date(start));
    const refund = b.refunds.find((r) => r.status !== "declined");
    return {
      id: b.id,
      ref: b.ref_code,
      isBlock: b.kind === "block",
      day: manilaDay(start),
      startHour,
      endHour: startHour + b.hours,
      hours: b.hours,
      name: b.contact_name ?? "",
      email: b.contact_email ?? "",
      phone: toLocalPhMobile(b.contact_phone),
      isGuest: b.kind === "customer" && b.user_id === null,
      paddles: b.paddle_rented,
      courtFee: b.court_fee,
      paddleFee: b.paddle_fee,
      total: b.total,
      status: b.status,
      counted: b.status === "confirmed" || (b.status === "cancel_requested" && b.status_before_request === "confirmed"),
      proofPath: b.payment_proof_path,
      reviewedBy: b.reviewer?.full_name ?? null,
      reviewedAt: b.reviewed_at,
      rejectReason: b.reject_reason,
      cancelledBy: b.cancelled_by,
      refundAmount: refund ? refund.refund_amount : null,
      blockNote: b.block_note,
    };
  });

  return { rows, total: count ?? rows.length };
}

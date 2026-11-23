import type { Database } from "@/types/database";

export type BookingStatus = Database["public"]["Enums"]["booking_status"];

/** DESIGN §1 status table: tinted background + dark text, always with words (never color alone). */
const STYLES: Record<BookingStatus, { label: string; className: string }> = {
  pending_payment: { label: "Pending payment", className: "bg-warning-bg text-warning" },
  pending_review: { label: "Pending review", className: "bg-info-bg text-info" },
  confirmed: { label: "Confirmed", className: "bg-success-bg text-success" },
  rejected: { label: "Rejected", className: "bg-danger-bg text-danger" },
  expired: { label: "Expired", className: "bg-neutral-bg text-neutral" },
  cancelled: { label: "Cancelled", className: "bg-neutral-bg text-neutral" },
  cancel_requested: { label: "Cancellation requested", className: "bg-warning-bg text-warning" },
  blocked: { label: "Blocked", className: "bg-neutral-bg text-neutral" },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const s = STYLES[status];
  return <span className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold whitespace-nowrap ${s.className}`}>{s.label}</span>;
}

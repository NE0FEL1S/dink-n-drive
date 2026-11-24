import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "@/lib/feedback";
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

/** Status names as people read them ("Pending review"). */
export const STATUS_LABELS = Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, v.label])) as Record<BookingStatus, string>;

export function StatusBadge({ status }: { status: BookingStatus }) {
  const s = STYLES[status];
  return <span className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold whitespace-nowrap ${s.className}`}>{s.label}</span>;
}

/** Feedback status (SPEC §8): Open = amber, In progress = blue, Resolved = green (DESIGN §1). */
const FEEDBACK_STYLES: Record<FeedbackStatus, string> = {
  open: "bg-warning-bg text-warning",
  in_progress: "bg-info-bg text-info",
  resolved: "bg-success-bg text-success",
};

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  return (
    <span className={`inline-flex h-7 shrink-0 items-center rounded-full px-3 text-xs font-semibold whitespace-nowrap ${FEEDBACK_STYLES[status]}`}>
      {FEEDBACK_STATUS_LABELS[status]}
    </span>
  );
}

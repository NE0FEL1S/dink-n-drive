"use client";

import { useState } from "react";
import Link from "next/link";
import { FEEDBACK_STATUS_LABELS, FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/feedback";

const OPTIONS: { status: FeedbackStatus | null; label: string }[] = [
  { status: null, label: "All" },
  ...FEEDBACK_STATUSES.map((status) => ({ status, label: FEEDBACK_STATUS_LABELS[status] })),
];

const href = (status: FeedbackStatus | null) => (status ? `/feedback?status=${status}` : "/feedback");

/**
 * All · Open · In progress · Resolved, a white pill row like the My Bookings tabs (DESIGN §5).
 * All (newest first) is the default. The tapped chip turns active at once, before the new
 * list arrives from the server.
 */
export function StatusFilter({ current }: { current: FeedbackStatus | null }) {
  const [tapped, setTapped] = useState<{ from: FeedbackStatus | null; to: FeedbackStatus | null } | null>(null);
  // Forget the tap once the server has rendered the new filter.
  const shown = tapped && tapped.from === current ? tapped.to : current;

  return (
    <nav aria-label="Filter feedback by status" className="flex gap-1 rounded-full bg-white p-1 shadow-[var(--shadow-soft)] sm:w-fit">
      {OPTIONS.map(({ status, label }) => {
        const active = status === shown;
        return (
          <Link
            key={label}
            href={href(status)}
            scroll={false}
            aria-current={status === current ? "page" : undefined}
            onClick={() => setTapped({ from: current, to: status })}
            className={
              "flex min-h-11 flex-auto touch-manipulation items-center justify-center rounded-full px-3 text-[15px] font-semibold whitespace-nowrap transition-colors duration-150 sm:px-5 " +
              (active ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-ice-50 active:bg-ice-100")
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

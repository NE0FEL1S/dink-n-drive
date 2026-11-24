import { ExternalLink, Phone } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AdminBookingRow } from "@/lib/admin-bookings";
import { RemoveBlockButton } from "./block-hours";
import { dayLabel, rangeLabel } from "@/lib/booking-time";
import { manilaDateTime, peso } from "@/lib/format";

type Props = {
  rows: AdminBookingRow[];
  /** Signed links to receipts, by booking id. */
  proofUrls: Map<string, string>;
};

/** "Approved by Ana · Nov 24, 3:41 PM" */
function reviewText(r: AdminBookingRow): string | null {
  if (!r.reviewedAt) return null;
  const verb = r.status === "rejected" ? "Rejected" : "Approved";
  return `${verb}${r.reviewedBy ? ` by ${r.reviewedBy}` : ""} · ${manilaDateTime(r.reviewedAt)}`;
}

/** Extra line under the status: who cancelled, the refund, a rejection reason. */
function statusNote(r: AdminBookingRow): string | null {
  if (r.status === "cancelled" || r.status === "cancel_requested") {
    const parts = [];
    if (r.cancelledBy) parts.push(`by ${r.cancelledBy}`);
    if (r.refundAmount !== null) parts.push(`refund ${peso(r.refundAmount)}`);
    return parts.join(" · ") || null;
  }
  if (r.status === "rejected" && r.rejectReason) return r.rejectReason;
  return null;
}

function TypeChip({ guest }: { guest: boolean }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-neutral-bg px-2.5 text-xs font-semibold whitespace-nowrap text-neutral">
      {guest ? "Guest" : "Account"}
    </span>
  );
}

function ReceiptLink({ url, code }: { url: string | undefined; code: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open the GCash receipt for ${code}`}
      className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-glacier-700 hover:underline"
    >
      <ExternalLink className="size-4" aria-hidden="true" />
      Receipt
    </a>
  );
}

/**
 * The bookings list (SPEC §9 columns). Cards below 1280 px (one column on phones, two from
 * 768 px), a table from 1280 px, where the content next to the sidebar is wide enough for it.
 */
export function BookingsTable({ rows, proofUrls }: Props) {
  return (
    <>
      {/* phones and tablets */}
      <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
        {rows.map((r) => {
          const note = statusNote(r);
          const review = reviewText(r);
          return (
            <li key={r.id}>
              <article
                aria-label={`Booking ${r.ref}`}
                className="grid h-full content-start gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-soft)] min-[390px]:p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge status={r.status} />
                  <span className="text-sm font-bold tracking-[0.02em] text-navy-900">{r.ref}</span>
                </div>
                <div className="grid gap-0.5">
                  <p className="text-sm font-semibold text-slate-500">{dayLabel(r.day)}</p>
                  <p className="text-[17px] leading-6 font-bold text-navy-900">
                    {rangeLabel(r.startHour, r.endHour)}
                    <span className="font-semibold text-slate-500"> · {r.hours} h</span>
                  </p>
                </div>

                {r.isBlock ? (
                  <div className="grid gap-1">
                    <p className="text-[15px] text-navy-700">
                      <span className="font-semibold text-navy-900">Owner block</span>
                      {r.blockNote ? ` · ${r.blockNote}` : ""}
                    </p>
                    <div className="-ml-3">
                      <RemoveBlockButton blockId={r.id} label={`${dayLabel(r.day)}, ${rangeLabel(r.startHour, r.endHour)}`} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-0.5">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-navy-900">
                        {r.name} <TypeChip guest={r.isGuest} />
                      </p>
                      {r.phone && (
                        <a href={`tel:${r.phone}`} className="flex min-h-11 w-fit items-center gap-2 text-[15px] font-semibold text-glacier-700 tabular-nums">
                          <Phone className="size-4" aria-hidden="true" />
                          {r.phone}
                        </a>
                      )}
                      <p className="truncate text-sm text-slate-500">{r.email}</p>
                    </div>
                    <p className="text-sm text-navy-700 tabular-nums">
                      Court {peso(r.courtFee)}
                      {r.paddles ? ` · Paddles ${peso(r.paddleFee)}` : " · No paddles"} ·{" "}
                      <b className="font-bold text-navy-900">Total {peso(r.total)}</b>
                    </p>
                  </>
                )}

                {(note || review || proofUrls.has(r.id)) && (
                  <div className="grid gap-1 border-t border-line pt-2 text-sm text-slate-500">
                    {note && <p className="line-clamp-2">{note}</p>}
                    {review && <p>{review}</p>}
                    <ReceiptLink url={proofUrls.get(r.id)} code={r.ref} />
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ul>

      {/* laptops */}
      <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-soft)] xl:block">
        <table className="w-full border-collapse text-left text-sm text-navy-700">
          <caption className="sr-only">Bookings</caption>
          <thead className="bg-ice-50 text-xs font-semibold tracking-[0.04em] text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">Booking</th>
              <th scope="col" className="px-4 py-3">Customer</th>
              <th scope="col" className="px-4 py-3 text-right">Amount</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Receipt / review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const note = statusNote(r);
              const review = reviewText(r);
              return (
                <tr key={r.id} aria-label={`Booking ${r.ref}`} className="border-t border-line align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="block font-bold text-navy-900">{r.ref}</span>
                    <span className="block font-semibold text-navy-900">{dayLabel(r.day)}</span>
                    {rangeLabel(r.startHour, r.endHour)} · {r.hours} h
                  </td>
                  <td className="max-w-[240px] px-4 py-3">
                    {r.isBlock ? (
                      <>
                        <span className="block font-semibold text-navy-900">Owner block</span>
                        {r.blockNote && <span className="block truncate">{r.blockNote}</span>}
                        <span className="-ml-3 block">
                          <RemoveBlockButton blockId={r.id} label={`${dayLabel(r.day)}, ${rangeLabel(r.startHour, r.endHour)}`} />
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex items-center gap-2 font-semibold text-navy-900">
                          <span className="truncate">{r.name}</span> <TypeChip guest={r.isGuest} />
                        </span>
                        <a href={`tel:${r.phone}`} className="block text-glacier-700 tabular-nums hover:underline">
                          {r.phone}
                        </a>
                        <span className="block truncate text-slate-500">{r.email}</span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                    {r.isBlock ? (
                      "—"
                    ) : (
                      <>
                        <span className="block text-[15px] font-bold text-navy-900">{peso(r.total)}</span>
                        <span className="block text-slate-500">Court {peso(r.courtFee)}</span>
                        <span className="block text-slate-500">{r.paddles ? `Paddles ${peso(r.paddleFee)}` : "No paddles"}</span>
                      </>
                    )}
                  </td>
                  <td className="max-w-[200px] px-4 py-3">
                    <StatusBadge status={r.status} />
                    {note && <span className="mt-1 line-clamp-2 block text-slate-500">{note}</span>}
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-slate-500">
                    <ReceiptLink url={proofUrls.get(r.id)} code={r.ref} />
                    {review && <span className="block">{review}</span>}
                    {!review && !proofUrls.has(r.id) && "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

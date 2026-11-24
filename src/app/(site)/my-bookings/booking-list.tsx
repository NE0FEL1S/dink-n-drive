"use client";

import { CalendarPlus, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button, buttonClass, Spinner } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge, type BookingStatus } from "@/components/ui/status-badge";
import { dayLabel, manilaDay, rangeLabel } from "@/lib/booking-time";
import { peso } from "@/lib/format";
import type { GcashQr } from "@/lib/gcash";
import type { Database } from "@/types/database";
import { DoneStep, PayStep } from "../book/checkout";
import { cancelUnpaidBooking } from "./actions";
import { CancelPaidForm, RefundNote, RefundProof } from "./cancel-paid";

export type MyBooking = Database["public"]["Functions"]["my_bookings"]["Returns"][number];

const ACTIVE: BookingStatus[] = ["pending_payment", "pending_review", "confirmed", "cancel_requested"];
const HOUR = 3_600_000;

/** Manila wall-clock hour of a moment; a booking ending at midnight ends at "24". */
function manilaHourOf(iso: string, day: string): number {
  const ms = Date.parse(iso);
  const h = new Date(ms + 8 * HOUR).getUTCHours();
  return manilaDay(ms) !== day && h === 0 ? 24 : h;
}

/** "Fri, Nov 28 · 8 – 10 AM" for a booking. */
function whenLabel(b: Pick<MyBooking, "start_at" | "end_at">): string {
  const day = manilaDay(Date.parse(b.start_at));
  return `${dayLabel(day)} · ${rangeLabel(manilaHourOf(b.start_at, day), manilaHourOf(b.end_at, day))}`;
}

export function BookingList(props: {
  bookings: MyBooking[];
  serverNow: number;
  isGuest: boolean;
  qr: GcashQr | null;
  holdMinutes: number;
  cutoffHours: number;
}) {
  const router = useRouter();
  const [skew] = useState(() => props.serverNow - Date.now());
  const [now, setNow] = useState(props.serverNow);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [paying, setPaying] = useState<MyBooking | null>(null);
  const [paid, setPaid] = useState(false);
  const [cancelling, setCancelling] = useState<MyBooking | null>(null);
  const [proofOf, setProofOf] = useState<MyBooking | null>(null);

  // one clock for all countdowns; a hold that runs out moves its card to Past
  const hasLiveHold = props.bookings.some((b) => b.status === "pending_payment");
  useEffect(() => {
    if (!hasLiveHold) return;
    const id = window.setInterval(() => setNow(Date.now() + skew), 1000);
    return () => window.clearInterval(id);
  }, [hasLiveHold, skew]);

  const statusOf = (b: MyBooking): BookingStatus =>
    b.status === "pending_payment" && b.hold_expires_at && Date.parse(b.hold_expires_at) <= now ? "expired" : b.status;
  const isUpcoming = (b: MyBooking) => ACTIVE.includes(statusOf(b)) && Date.parse(b.end_at) > now;

  const upcoming = props.bookings.filter(isUpcoming).sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  const past = props.bookings.filter((b) => !isUpcoming(b)).sort((a, b) => Date.parse(b.start_at) - Date.parse(a.start_at));
  const shown = tab === "upcoming" ? upcoming : past;

  return (
    <div className="grid gap-4">
      {props.isGuest && (
        <p className="rounded-[var(--radius-card)] border border-line bg-white px-4 py-3 text-[15px] text-navy-700 shadow-[var(--shadow-soft)]">
          These are the bookings made on <b>this browser</b>.{" "}
          <Link href="/login?next=%2Fmy-bookings" className="font-semibold text-glacier-700 underline underline-offset-4">
            Log in or create an account
          </Link>{" "}
          to keep them on any device.
        </p>
      )}

      <div role="tablist" aria-label="Bookings" className="grid grid-cols-2 gap-1 rounded-full bg-white p-1 shadow-[var(--shadow-soft)]">
        {(
          [
            ["upcoming", `Upcoming (${upcoming.length})`],
            ["past", `Past (${past.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={
              "min-h-11 touch-manipulation rounded-full text-[15px] font-semibold transition-colors duration-150 " +
              (tab === key ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-ice-50 active:bg-ice-100")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-white px-5 py-8 text-center shadow-[var(--shadow-soft)]">
          <CalendarPlus className="mx-auto size-8 text-orange-500" aria-hidden="true" />
          <p className="mt-2 font-semibold text-navy-900">{tab === "upcoming" ? "No upcoming games." : "No past bookings yet."}</p>
          {tab === "upcoming" && (
            <Link href="/book" className={buttonClass("cta", "mt-4 w-full max-w-xs text-[17px]")}>
              Book the court
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid gap-3">
          {shown.map((b) => (
            <li key={b.id}>
              <BookingCard
                booking={b}
                status={statusOf(b)}
                now={now}
                cutoffHours={props.cutoffHours}
                onViewProof={() => setProofOf(b)}
                onPay={() => {
                  setPaid(false);
                  setPaying(b);
                }}
                onCancel={() => setCancelling(b)}
              />
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={paying !== null}
        title={paid ? "Thank you!" : `Pay for ${paying?.ref_code ?? ""}`}
        onClose={() => {
          setPaying(null);
          router.refresh();
        }}
      >
        {paying &&
          (paid ? (
            <DoneStep
              booking={{ id: paying.id, ref: paying.ref_code, holdExpiresAt: paying.hold_expires_at ?? "", total: paying.total }}
              isGuest={props.isGuest}
              showMyBookingsLink={false}
            />
          ) : (
            <PayStep
              booking={{ id: paying.id, ref: paying.ref_code, holdExpiresAt: paying.hold_expires_at ?? new Date(0).toISOString(), total: paying.total }}
              skewMs={skew}
              qr={props.qr}
              holdMinutes={props.holdMinutes}
              onDone={() => {
                setPaid(true);
                router.refresh();
              }}
              onExpired={() => {
                setPaying(null);
                router.refresh();
              }}
            />
          ))}
      </Sheet>

      <Sheet open={cancelling !== null} title="Cancel this booking?" onClose={() => setCancelling(null)}>
        {cancelling &&
          (cancelling.status === "pending_payment" ? (
            <CancelUnpaid
              booking={cancelling}
              onDone={() => {
                setCancelling(null);
                router.refresh();
              }}
              onKeep={() => setCancelling(null)}
            />
          ) : (
            <CancelPaidForm
              booking={cancelling}
              label={whenLabel(cancelling)}
              onDone={() => {
                setCancelling(null);
                router.refresh();
              }}
              onKeep={() => setCancelling(null)}
              onStale={() => router.refresh()}
            />
          ))}
      </Sheet>

      <Sheet open={proofOf !== null} title="Refund screenshot" onClose={() => setProofOf(null)}>
        {proofOf && (
          <div className="grid gap-3">
            <p className="text-[15px] text-navy-700">
              <b className="tabular">{proofOf.ref_code}</b> · {whenLabel(proofOf)}
            </p>
            <RefundProof bookingId={proofOf.id} />
          </div>
        )}
      </Sheet>
    </div>
  );
}

function BookingCard(props: {
  booking: MyBooking;
  status: BookingStatus;
  now: number;
  cutoffHours: number;
  onPay: () => void;
  onCancel: () => void;
  onViewProof: () => void;
}) {
  const { booking: b, status, now } = props;
  const day = manilaDay(Date.parse(b.start_at));
  const startH = manilaHourOf(b.start_at, day);
  const endH = manilaHourOf(b.end_at, day);
  const left = status === "pending_payment" && b.hold_expires_at ? Math.max(0, Date.parse(b.hold_expires_at) - now) : 0;
  const mm = Math.floor(left / 60000);
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  const paidUpcoming = (status === "pending_review" || status === "confirmed") && Date.parse(b.start_at) > now;
  const canRequest = paidUpcoming && now < Date.parse(b.start_at) - props.cutoffHours * HOUR;
  const cutoffNoteId = `cutoff-${b.id}`;

  return (
    <article
      aria-label={`Booking ${b.ref_code}`}
      className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-soft)] sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <StatusBadge status={status} />
        <span className="tabular text-sm font-semibold text-slate-500">{b.ref_code}</span>
      </div>
      <p className="mt-3 text-sm text-slate-500">{dayLabel(day)}</p>
      <p className="tabular text-lg leading-7 font-bold text-navy-900">{rangeLabel(startH, endH)}</p>
      <p className="mt-0.5 text-sm text-slate-500">
        {b.hours} {b.hours === 1 ? "hour" : "hours"}
        {b.paddle_rented ? " · paddles rented" : ""} · <span className="tabular font-semibold text-navy-900">{peso(b.total)}</span>
      </p>

      {status === "pending_payment" && (
        <div className="mt-3 grid gap-3">
          <p className="flex items-center gap-2 rounded-[var(--radius-control)] bg-warning-bg px-3 py-2 text-sm font-semibold text-warning">
            <Timer className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Pay within <span className="tabular">{mm}:{ss}</span> or the hours are released.
            </span>
          </p>
          <div className="flex gap-2">
            <Button variant="cta" className="flex-1" onClick={props.onPay}>
              Pay now
            </Button>
            <Button variant="secondary" onClick={props.onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {status === "pending_review" && (
        <p className="mt-3 text-sm text-slate-500">We got your payment screenshot. The court owner will check it and confirm.</p>
      )}
      {status === "confirmed" && <p className="mt-3 text-sm text-slate-500">You&apos;re all set. See you on the court!</p>}
      {status === "rejected" && (
        <p className="mt-3 rounded-[var(--radius-control)] bg-danger-bg px-3 py-2 text-sm text-danger">
          <b>Payment not accepted.</b> {b.reject_reason ?? "Please message the court owner."}
        </p>
      )}
      {status === "expired" && <p className="mt-3 text-sm text-slate-500">No payment arrived in time, so the hours were released.</p>}
      <RefundNote booking={b} onViewProof={props.onViewProof} />
      {paidUpcoming && (
        <div className="mt-3 grid gap-1.5">
          <Button
            variant="secondary"
            className="w-full sm:w-auto sm:justify-self-start"
            onClick={props.onCancel}
            disabled={!canRequest}
            aria-describedby={canRequest ? undefined : cutoffNoteId}
          >
            Cancel booking
          </Button>
          {!canRequest && (
            <p id={cutoffNoteId} className="text-sm text-slate-500">
              Cancellations close {props.cutoffHours} {props.cutoffHours === 1 ? "hour" : "hours"} before the game. Message the court owner if you
              can&apos;t make it.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function CancelUnpaid({ booking: b, onDone, onKeep }: { booking: MyBooking; onDone: () => void; onKeep: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const day = manilaDay(Date.parse(b.start_at));
  return (
    <div className="grid gap-4">
      <p className="text-[15px] text-navy-700">
        <b className="tabular">{b.ref_code}</b> · {dayLabel(day)} · {rangeLabel(manilaHourOf(b.start_at, day), manilaHourOf(b.end_at, day))}
      </p>
      <p className="text-[15px] text-slate-500">It&apos;s free, because you haven&apos;t paid yet. The hours open up for others right away.</p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="grid gap-2">
        <Button
          variant="secondary"
          className="w-full border-danger/30! text-danger! hover:bg-danger-bg! active:bg-danger-bg!"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await cancelUnpaidBooking(b.id);
              if (r.ok) onDone();
              else setError(r.error.message);
            })
          }
        >
          {pending && <Spinner />}
          Yes, cancel booking
        </Button>
        <Button variant="ghost" className="w-full" onClick={onKeep} disabled={pending}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

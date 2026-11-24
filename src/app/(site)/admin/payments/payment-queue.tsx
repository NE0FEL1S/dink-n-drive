"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, ImageOff, Phone } from "lucide-react";
import { Button, buttonClass, Spinner } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Toast } from "@/components/ui/toast";
import { dayLabel, rangeLabel } from "@/lib/booking-time";
import { peso } from "@/lib/format";
import { approvePayment, rejectPayment } from "./actions";

export type PaymentItem = {
  id: string;
  ref: string;
  day: string;
  startHour: number;
  endHour: number;
  hours: number;
  paddles: boolean;
  total: number;
  name: string;
  email: string;
  /** 09XXXXXXXXX */
  phone: string;
  isGuest: boolean;
  /** "today, 3:42 PM" */
  sent: string | null;
  /** Signed link to the screenshot in the private payment-proofs bucket. */
  proofUrl: string | null;
  /** The customer asked to cancel before the payment was checked. */
  cancelRequested: boolean;
};

const dangerButton = "border-danger/30! text-danger! hover:bg-danger-bg! active:bg-danger-bg!";

/**
 * The payment queue (DESIGN §5 "Admin"): one card per screenshot, large preview, Approve /
 * Reject. Every action refreshes the page from the server, so the list and the Payments
 * badge always match the database.
 */
export function PaymentQueue({ items }: { items: PaymentItem[] }) {
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<PaymentItem | null>(null);
  const shown = items.filter((i) => !hidden.has(i.id));

  const hide = (id: string) => setHidden((h) => new Set(h).add(id));
  const dismiss = useCallback(() => setNotice(null), []);

  return (
    <div className="grid gap-4">
      {notice && (
        <Toast key={notice.text} tone={notice.tone} onDismiss={dismiss}>
          {notice.text}
        </Toast>
      )}

      {shown.length === 0 ? (
        <Card className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success-bg">
            <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          </span>
          <div className="grid gap-1">
            <h2 className="text-[17px] leading-6 font-semibold text-navy-900">All caught up</h2>
            <p className="text-[15px] leading-6 text-navy-700">
              No payments are waiting for review. New GCash receipts show up here as customers send them.
            </p>
            <Link href="/admin/bookings" className="-ml-3 inline-flex min-h-11 w-fit items-center rounded-full px-3 text-[15px] font-semibold text-glacier-700 hover:bg-glacier-50 active:bg-glacier-50">
              See all bookings →
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <p className="sr-only" role="status">
            {shown.length} {shown.length === 1 ? "payment" : "payments"} waiting for review
          </p>
          {shown.map((item) => (
            <PaymentCard
              key={item.id}
              item={item}
              onApproved={() => {
                hide(item.id);
                setNotice({
                  tone: "success",
                  text: item.cancelRequested
                    ? `${item.ref} payment approved. Its cancellation request is waiting in Refunds.`
                    : `${item.ref} approved. The customer now sees it as confirmed.`,
                });
              }}
              onError={(text, stale) => {
                if (stale) hide(item.id);
                setNotice({ tone: "error", text });
              }}
              onReject={() => setRejecting(item)}
            />
          ))}
        </>
      )}

      <Sheet open={rejecting !== null} title={`Reject ${rejecting?.ref ?? ""}?`} onClose={() => setRejecting(null)}>
        {rejecting && (
          <RejectForm
            item={rejecting}
            onDone={() => {
              hide(rejecting.id);
              setNotice({
                tone: "success",
                text: rejecting.cancelRequested
                  ? `${rejecting.ref} rejected and its cancellation request closed. Those hours are open again.`
                  : `${rejecting.ref} rejected. Those hours are open again.`,
              });
              setRejecting(null);
            }}
            onStale={(text) => {
              hide(rejecting.id);
              setNotice({ tone: "error", text });
              setRejecting(null);
            }}
            onBack={() => setRejecting(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function PaymentCard({
  item,
  onApproved,
  onError,
  onReject,
}: {
  item: PaymentItem;
  onApproved: () => void;
  onError: (text: string, stale?: boolean) => void;
  onReject: () => void;
}) {
  const [pending, start] = useTransition();

  return (
    <article
      aria-label={`Payment ${item.ref}`}
      className="grid gap-4 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-soft)] min-[390px]:p-5 md:grid-cols-[240px_minmax(0,1fr)] md:gap-x-6"
    >
      {/* details (first on phones, right column on wider screens) */}
      <div className="grid content-start gap-4 md:col-start-2 md:row-start-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-[15px] font-bold tracking-[0.02em] text-navy-900">{item.ref}</p>
          {item.sent && <p className="text-sm text-slate-500">Sent {item.sent}</p>}
        </div>

        {item.cancelRequested && (
          <p className="rounded-[var(--radius-control)] bg-warning-bg px-3 py-2 text-sm text-warning">
            <b>The customer asked to cancel.</b> Check the payment first. If you approve it, decide the request in{" "}
            <Link href="/admin/refunds" className="font-semibold underline underline-offset-2">
              Refunds
            </Link>
            ; if you reject it, the request closes with no refund.
          </p>
        )}

        <div className="grid gap-0.5">
          <p className="text-sm font-semibold text-slate-500">{dayLabel(item.day)}</p>
          <p className="text-[20px] leading-7 font-bold text-navy-900">{rangeLabel(item.startHour, item.endHour)}</p>
          <p className="text-sm text-slate-500">
            {item.hours} {item.hours === 1 ? "hour" : "hours"}
            {item.paddles ? " · paddles rented" : ""}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-ice-50 px-4 py-3">
          <p className="text-sm leading-5 font-semibold text-navy-700">
            The receipt
            <br />
            should show
          </p>
          <p className="font-display text-[28px] leading-8 font-semibold text-navy-900 tabular-nums">{peso(item.total)}</p>
        </div>

        <div className="grid gap-1">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-navy-900">
            {item.name}
            <span className="inline-flex h-6 items-center rounded-full bg-neutral-bg px-2.5 text-xs font-semibold text-neutral">
              {item.isGuest ? "Guest" : "Account"}
            </span>
          </p>
          {item.phone && (
            <a
              href={`tel:${item.phone}`}
              className="flex min-h-11 w-fit items-center gap-2 text-[15px] font-semibold text-glacier-700 tabular-nums hover:underline"
            >
              <Phone className="size-4" aria-hidden="true" />
              {item.phone}
            </a>
          )}
          {item.email && <p className="truncate text-sm text-slate-500">{item.email}</p>}
        </div>
      </div>

      {/* screenshot (middle on phones, left column on wider screens) */}
      <div className="md:col-start-1 md:row-span-2 md:row-start-1">
        {item.proofUrl ? (
          <a
            href={item.proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open the GCash receipt for ${item.ref} full size`}
            className="group relative block overflow-hidden rounded-[var(--radius-control)] border border-line bg-ice-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket */}
            <img
              src={item.proofUrl}
              alt={`GCash receipt for ${item.ref}`}
              loading="lazy"
              decoding="async"
              className="h-[420px] w-full object-contain md:h-[400px]"
            />
            <span className="absolute right-2 bottom-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/95 px-3 text-sm font-semibold text-navy-900 shadow-[var(--shadow-soft)] group-active:scale-[0.98]">
              <ExternalLink className="size-4" aria-hidden="true" />
              Full size
            </span>
          </a>
        ) : (
          <div className="grid h-40 place-items-center gap-1 rounded-[var(--radius-control)] border border-dashed border-line bg-ice-50 p-4 text-center">
            <ImageOff className="size-6 text-slate-500" aria-hidden="true" />
            <p className="text-sm text-slate-500">The screenshot couldn&apos;t be loaded. Refresh the page to try again.</p>
          </div>
        )}
      </div>

      {/* actions */}
      <div className="grid grid-cols-2 gap-3 md:col-start-2 md:row-start-2 md:self-end">
        <Button variant="secondary" className={dangerButton} disabled={pending} onClick={onReject}>
          Reject
        </Button>
        <Button
          className="relative"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={() =>
            start(async () => {
              const r = await approvePayment(item.id);
              if (r.ok) onApproved();
              else onError(r.error, r.stale);
            })
          }
        >
          <span className={pending ? "invisible" : undefined}>Approve</span>
          {pending && (
            <span className="absolute inset-0 grid place-items-center">
              <Spinner />
            </span>
          )}
        </Button>
      </div>
    </article>
  );
}

function quickReasons(total: number) {
  return [
    { label: "Amount doesn't match", text: `The amount on the receipt doesn't match ${peso(total)}.` },
    { label: "Screenshot unclear", text: "The screenshot is unclear or cut off, so we couldn't check the payment." },
    { label: "Not received", text: "We didn't receive this payment in GCash." },
  ];
}

function RejectForm({
  item,
  onDone,
  onStale,
  onBack,
}: {
  item: PaymentItem;
  onDone: () => void;
  onStale: (text: string) => void;
  onBack: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const reasons = quickReasons(item.total);

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason.trim()) {
          setError("Write a short reason. The customer will see it.");
          return;
        }
        setError(null);
        start(async () => {
          const r = await rejectPayment(item.id, reason);
          if (r.ok) onDone();
          else if (r.stale) onStale(r.error);
          else setError(r.error);
        });
      }}
    >
      <p className="text-[15px] leading-6 text-navy-700">
        {dayLabel(item.day)} · {rangeLabel(item.startHour, item.endHour)} · {peso(item.total)} · {item.name}
      </p>
      <p className="text-[15px] leading-6 text-navy-700">
        The customer sees your reason in My bookings, and the hours open up for other players.
      </p>

      <div className="grid gap-2">
        <p id="quick-reasons" className="text-sm font-semibold text-navy-900">
          Quick reasons
        </p>
        <div role="group" aria-labelledby="quick-reasons" className="flex flex-wrap gap-2">
          {reasons.map((r) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={reason === r.text}
              onClick={() => {
                setReason(r.text);
                setError(null);
              }}
              className={
                "min-h-11 touch-manipulation rounded-full border px-4 text-sm font-semibold transition-colors duration-150 " +
                (reason === r.text
                  ? "border-navy-900 bg-navy-900 text-white"
                  : "border-line bg-white text-navy-900 hover:bg-ice-50 active:bg-ice-100")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="reject-reason" className="text-sm font-semibold text-navy-900">
          Reason for the customer
        </label>
        <textarea
          id="reject-reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
          rows={3}
          maxLength={500}
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby="reject-reason-count"
          className={
            "w-full resize-none rounded-[var(--radius-control)] border bg-white px-4 py-3 text-base leading-6 text-navy-900 " +
            "outline-none transition-[border-color,box-shadow] duration-150 focus:border-orange-600 focus:ring-2 focus:ring-orange-500/40 " +
            (error ? "border-danger" : "border-line")
          }
        />
        <p id="reject-reason-count" className="text-right text-sm text-slate-500 tabular-nums">
          {reason.length}/500
        </p>
      </div>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <div className="grid gap-3">
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonClass("secondary", `relative w-full ${dangerButton}`)}>
          <span className={pending ? "invisible" : undefined}>Reject payment</span>
          {pending && (
            <span className="absolute inset-0 grid place-items-center">
              <Spinner />
            </span>
          )}
        </button>
        <Button variant="ghost" className="w-full" onClick={onBack} disabled={pending}>
          Back
        </Button>
      </div>
    </form>
  );
}

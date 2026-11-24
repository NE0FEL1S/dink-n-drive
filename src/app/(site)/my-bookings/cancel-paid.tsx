"use client";

import { ImageOff } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button, Spinner } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { manilaDateTime, peso } from "@/lib/format";
import { toLocalPhMobile } from "@/lib/phone";
import { refundProofUrl, requestCancellation } from "./actions";
import type { MyBooking } from "./booking-list";

/** What a customer gets back if the request is approved (fee saved on the booking). */
export function refundFor(b: Pick<MyBooking, "total" | "cancel_fee">): number {
  return Math.max(b.total - b.cancel_fee, 0);
}

/** +639171234567 → "0917 ••• 4567" (enough to recognise, not to copy). */
function maskedNumber(e164: string | null): string | null {
  const local = toLocalPhMobile(e164);
  return /^09\d{9}$/.test(local) ? `${local.slice(0, 4)} ••• ${local.slice(7)}` : null;
}

/**
 * The cancellation request for a paid booking (SPEC §6): GCash details for the refund,
 * the refund worked out from the fee saved on the booking, and what happens next.
 */
export function CancelPaidForm(props: {
  booking: MyBooking;
  label: string;
  onDone: () => void;
  onKeep: () => void;
  onStale: () => void;
}) {
  const { booking: b } = props;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Partial<Record<"gcashName" | "gcashNumber", string>>>({});
  const refund = refundFor(b);

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () => {
          const r = await requestCancellation({
            bookingId: b.id,
            gcashName: String(form.get("gcashName") ?? ""),
            gcashNumber: String(form.get("gcashNumber") ?? ""),
          });
          if (r.ok) return props.onDone();
          setFields(r.fields ?? {});
          setError(r.fields ? null : r.error.message);
          if (!r.fields) props.onStale();
        });
      }}
    >
      <p className="text-[15px] text-navy-700">
        <b className="tabular">{b.ref_code}</b> · {props.label}
      </p>

      <dl className="grid gap-1.5 rounded-[var(--radius-control)] bg-ice-50 px-4 py-3 text-[15px]">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">You paid</dt>
          <dd className="tabular text-navy-900">{peso(b.total)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Cancellation fee</dt>
          <dd className="tabular text-navy-900">−{peso(Math.min(b.cancel_fee, b.total))}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold">
          <dt className="text-navy-900">Refund to your GCash</dt>
          <dd className="tabular text-navy-900">{peso(refund)}</dd>
        </div>
      </dl>

      <div className="grid gap-3">
        <Field
          label="GCash account name"
          name="gcashName"
          autoComplete="name"
          enterKeyHint="next"
          defaultValue={b.refund_gcash_name ?? b.contact_name ?? ""}
          error={fields.gcashName}
          maxLength={100}
          required
        />
        <Field
          label="GCash number"
          name="gcashNumber"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="send"
          placeholder="09171234567"
          defaultValue={toLocalPhMobile(b.contact_phone)}
          error={fields.gcashNumber}
          hint="The refund is sent to this GCash number."
          required
        />
      </div>

      <p className="text-sm text-slate-500">
        The court owner reviews your request. Until then the hours stay booked for you.
        {b.status === "pending_review" && " Your payment is still being checked; the owner will check it first."}
      </p>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <div className="grid gap-2">
        <Button
          type="submit"
          variant="secondary"
          className="w-full border-danger/30! text-danger! hover:bg-danger-bg! active:bg-danger-bg!"
          disabled={pending}
        >
          {pending && <Spinner />}
          Send cancellation request
        </Button>
        <Button variant="ghost" className="w-full" onClick={props.onKeep} disabled={pending}>
          Keep booking
        </Button>
      </div>
    </form>
  );
}

/**
 * The refund part of a booking card: request waiting, declined (with the owner's reason),
 * approved (money on its way) or refunded (with the owner's screenshot).
 */
export function RefundNote(props: { booking: MyBooking; onViewProof: () => void }) {
  const { booking: b } = props;
  const amount = b.refund_amount ?? 0;
  const to = [b.refund_gcash_name, maskedNumber(b.refund_gcash_number)].filter(Boolean).join(", ");
  const byOwner = b.status === "cancelled" && b.cancelled_by === "owner";

  if (b.status === "cancel_requested") {
    return (
      <p className="mt-3 text-sm text-slate-500">
        Waiting for the court owner. If approved, <b className="tabular text-navy-900">{peso(amount)}</b> goes back to your GCash
        {to && <> ({to})</>}. The hours stay yours until then.
      </p>
    );
  }

  if (b.status === "cancelled") {
    const intro = byOwner ? "Cancelled by the court owner." : "You cancelled this booking.";
    if (b.refund_status === "approved") {
      return (
        <p className="mt-3 text-sm text-slate-500">
          {intro} {byOwner ? "Full refund" : "Refund"} of <b className="tabular text-navy-900">{peso(amount)}</b> approved. The court owner will send
          it to your GCash{to && <> ({to})</>}.
        </p>
      );
    }
    if (b.refund_status === "completed") {
      return (
        <div className="mt-3 grid gap-2">
          <p className="rounded-[var(--radius-control)] bg-success-bg px-3 py-2 text-sm text-success">
            <b>Refunded {peso(amount)}</b>
            {b.refund_completed_at && <> on {manilaDateTime(b.refund_completed_at)}</>}
            {b.refund_gcash_name && <> to {b.refund_gcash_name}&apos;s GCash</>}.
            {!byOwner && (b.refund_cancel_fee ?? 0) > 0 && <> The {peso(b.refund_cancel_fee ?? 0)} cancellation fee was kept.</>}
          </p>
          {b.has_refund_proof && (
            <Button variant="secondary" className="w-full sm:w-auto" onClick={props.onViewProof}>
              View refund screenshot
            </Button>
          )}
        </div>
      );
    }
    return <p className="mt-3 text-sm text-slate-500">{intro}</p>;
  }

  if (b.refund_status === "declined" && (b.status === "confirmed" || b.status === "pending_review")) {
    return (
      <p className="mt-3 rounded-[var(--radius-control)] bg-warning-bg px-3 py-2 text-sm text-warning">
        <b>Cancellation request declined.</b> {b.refund_decline_reason}
      </p>
    );
  }
  return null;
}

/** The owner's refund screenshot, through a short-lived signed link. */
export function RefundProof({ bookingId }: { bookingId: string }) {
  const [state, setState] = useState<{ url: string } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    refundProofUrl(bookingId).then((r) => live && setState(r.ok ? { url: r.url } : { error: r.error }));
    return () => {
      live = false;
    };
  }, [bookingId]);

  if (!state) return <div className="h-80 animate-pulse rounded-[var(--radius-card)] bg-ice-50" aria-busy="true" aria-label="Loading screenshot" />;
  if ("error" in state)
    return (
      <div className="grid justify-items-center gap-2 py-8 text-center">
        <ImageOff className="size-8 text-slate-300" aria-hidden="true" />
        <FormMessage tone="error">{state.error}</FormMessage>
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket
    <img src={state.url} alt="GCash refund screenshot from the court owner" className="mx-auto max-h-[70dvh] w-auto rounded-[var(--radius-card)] border border-line" />
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, buttonClass, Spinner } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import type { AdminBookingRow } from "@/lib/admin-bookings";
import { dayLabel, rangeLabel } from "@/lib/booking-time";
import { peso } from "@/lib/format";
import { ownerCancelBooking } from "./cancel-actions";

const PAID: AdminBookingRow["status"][] = ["pending_review", "confirmed", "cancel_requested"];
const dangerText = "text-danger hover:bg-danger-bg active:bg-danger-bg";

type Row = Pick<
  AdminBookingRow,
  "id" | "ref" | "status" | "day" | "startHour" | "endHour" | "total" | "name" | "phone" | "openRequest"
>;

/**
 * "Cancel booking" for the owner (SPEC §6): any customer booking, any time, no fee. Paid
 * bookings get a full refund to the GCash details in the sheet (prefilled from the
 * customer's open request, else the booking contact); it then waits in Refunds → To send.
 */
export function OwnerCancelButton({ row }: { row: Row }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<{ refund: number } | null>(null);

  const close = () => {
    setOpen(false);
    if (done) {
      setDone(null);
      router.refresh(); // the row now shows Cancelled; the Refunds badge goes up
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 w-fit items-center rounded-full px-3 text-sm font-semibold ${dangerText}`}
      >
        Cancel booking
      </button>
      <Sheet open={open} title={done ? `${row.ref} cancelled` : `Cancel ${row.ref}?`} onClose={close}>
        {done ? <Done refund={done.refund} onClose={close} /> : <CancelForm row={row} onDone={(refund) => setDone({ refund })} onBack={close} />}
      </Sheet>
    </>
  );
}

function CancelForm({ row, onDone, onBack }: { row: Row; onDone: (refund: number) => void; onBack: () => void }) {
  const paid = PAID.includes(row.status);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Partial<Record<"gcashName" | "gcashNumber", string>>>({});

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () => {
          const r = await ownerCancelBooking({
            bookingId: row.id,
            paid,
            gcashName: paid ? String(form.get("gcashName") ?? "") : undefined,
            gcashNumber: paid ? String(form.get("gcashNumber") ?? "") : undefined,
          });
          if (r.ok) return onDone(r.refundAmount);
          setFields(r.fields ?? {});
          setError(r.fields ? null : r.error);
        });
      }}
    >
      <p className="text-[15px] leading-6 text-navy-700">
        {dayLabel(row.day)} · {rangeLabel(row.startHour, row.endHour)} · {row.name}
      </p>

      {paid ? (
        <>
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-ice-50 px-4 py-3">
            <p className="text-sm leading-5 font-semibold text-navy-700">
              Full refund
              <br />
              no fee
            </p>
            <p className="font-display text-[28px] leading-8 font-semibold text-navy-900 tabular-nums">{peso(row.total)}</p>
          </div>
          {row.status === "pending_review" && (
            <FormMessage tone="info">
              This payment hasn&apos;t been checked yet. If the receipt isn&apos;t real, reject it in Payments instead: that gives no refund.
            </FormMessage>
          )}
          <div className="grid gap-3">
            <Field
              label="Customer's GCash name"
              name="gcashName"
              autoComplete="off"
              enterKeyHint="next"
              defaultValue={row.openRequest?.gcashName || row.name}
              error={fields.gcashName}
              maxLength={100}
            />
            <Field
              label="Customer's GCash number"
              name="gcashNumber"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="09171234567"
              defaultValue={row.openRequest?.gcashNumber || row.phone}
              error={fields.gcashNumber}
              hint={row.openRequest ? "From the customer's cancellation request." : "The booking's contact number. Check it with the customer."}
            />
          </div>
          <p className="text-sm text-slate-500">
            The hours open up for other players. The refund then waits in Refunds → To send until you send it and mark it refunded.
          </p>
        </>
      ) : (
        <p className="text-[15px] leading-6 text-navy-700">Nothing was paid yet, so there&apos;s no refund. The hours open up for other players.</p>
      )}

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <div className="grid gap-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className={buttonClass("secondary", "relative w-full border-danger/30! text-danger! hover:bg-danger-bg! active:bg-danger-bg!")}
        >
          <span className={pending ? "invisible" : undefined}>{paid ? "Cancel and refund in full" : "Cancel booking"}</span>
          {pending && (
            <span className="absolute inset-0 grid place-items-center">
              <Spinner />
            </span>
          )}
        </button>
        <Button variant="ghost" className="w-full" onClick={onBack} disabled={pending}>
          Keep booking
        </Button>
      </div>
    </form>
  );
}

function Done({ refund, onClose }: { refund: number; onClose: () => void }) {
  return (
    <div className="grid gap-4">
      <p className="flex items-start gap-3 text-[15px] leading-6 text-navy-700">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        <span>
          The hours are open again, and the customer sees &ldquo;Cancelled by the court owner&rdquo; in My bookings.
          {refund > 0 && (
            <>
              {" "}
              Send <b className="tabular-nums">{peso(refund)}</b> by GCash, then mark it refunded in Refunds.
            </>
          )}
        </span>
      </p>
      <div className="grid gap-3">
        {refund > 0 && (
          <Link href="/admin/refunds?view=send" onClick={onClose} className={buttonClass("primary", "w-full")}>
            Go to Refunds
          </Link>
        )}
        <Button variant={refund > 0 ? "ghost" : "primary"} className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

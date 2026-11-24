"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { Check, CheckCircle2, Copy, ExternalLink, ImageUp, Phone } from "lucide-react";
import { Button, buttonClass, Spinner } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Toast } from "@/components/ui/toast";
import { dayLabel, rangeLabel } from "@/lib/booking-time";
import { peso } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { approveCancellation, completeRefund, declineCancellation, startRefundUpload } from "./actions";

export type RefundView = "requests" | "send" | "history";

export type RefundItem = {
  id: string;
  bookingId: string;
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
  /** Who cancelled, once the booking is cancelled. */
  cancelledBy: Database["public"]["Enums"]["booking_actor"] | null;
  /** False while the booking's payment still waits in Payments (the request can't be approved yet). */
  paymentChecked: boolean;
  status: Database["public"]["Enums"]["refund_status"];
  fee: number;
  refund: number;
  gcashName: string;
  /** 09XXXXXXXXX, empty once the refund is completed or declined (erased). */
  gcashNumber: string;
  requested: string;
  decided: string | null;
  completed: string | null;
  declineReason: string | null;
  /** Signed link to the refund screenshot in the private refund-proofs bucket. */
  proofUrl: string | null;
};

const dangerButton = "border-danger/30! text-danger! hover:bg-danger-bg! active:bg-danger-bg!";
const articleClass = "grid gap-4 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-soft)] min-[390px]:p-5";

/**
 * The three Refunds lists (DESIGN §5 "Admin"). Every action refreshes the page from the
 * server, so the lists and the Refunds badge always match the database.
 */
export function RefundList({ view, items, historyLimit }: { view: RefundView; items: RefundItem[]; historyLimit: number }) {
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState<RefundItem | null>(null);
  const [declining, setDeclining] = useState<RefundItem | null>(null);
  const shown = items.filter((i) => !hidden.has(i.id));

  const hide = (id: string) => setHidden((h) => new Set(h).add(id));
  const dismiss = useCallback(() => setNotice(null), []);
  const fail = (item: RefundItem, text: string, stale?: boolean) => {
    if (stale) hide(item.id);
    setNotice({ tone: "error", text });
  };

  return (
    <div className="grid gap-4">
      {notice && (
        <Toast key={notice.text} tone={notice.tone} onDismiss={dismiss}>
          {notice.text}
        </Toast>
      )}

      {shown.length === 0 ? (
        <EmptyState view={view} />
      ) : (
        <ul className="grid gap-4">
          {view === "history" && items.length >= historyLimit && (
            <li className="text-sm text-slate-500">The latest {historyLimit} decided refunds.</li>
          )}
          {shown.map((item) => (
            <li key={item.id}>
              {view === "requests" ? (
                <RequestCard item={item} onApprove={() => setApproving(item)} onDecline={() => setDeclining(item)} />
              ) : view === "send" ? (
                <SendCard
                  item={item}
                  onDone={() => {
                    hide(item.id);
                    setNotice({ tone: "success", text: `${item.ref} marked refunded. The customer can see the screenshot in My bookings.` });
                  }}
                  onError={(text, stale) => fail(item, text, stale)}
                />
              ) : (
                <HistoryCard item={item} />
              )}
            </li>
          ))}
        </ul>
      )}

      <Sheet open={approving !== null} title={`Approve cancelling ${approving?.ref ?? ""}?`} onClose={() => setApproving(null)}>
        {approving && (
          <ApproveForm
            item={approving}
            onDone={() => {
              hide(approving.id);
              setNotice({
                tone: "success",
                text:
                  approving.refund > 0
                    ? `${approving.ref} cancelled. Send ${peso(approving.refund)} to ${approving.gcashName}'s GCash, then mark it refunded in To send.`
                    : `${approving.ref} cancelled. Nothing to refund, so it's done.`,
              });
              setApproving(null);
            }}
            onError={(text, stale) => {
              fail(approving, text, stale);
              setApproving(null);
            }}
            onBack={() => setApproving(null)}
          />
        )}
      </Sheet>

      <Sheet open={declining !== null} title={`Decline ${declining?.ref ?? ""}?`} onClose={() => setDeclining(null)}>
        {declining && (
          <DeclineForm
            item={declining}
            onDone={() => {
              hide(declining.id);
              setNotice({ tone: "success", text: `${declining.ref} request declined. The booking stays, and the customer sees your reason.` });
              setDeclining(null);
            }}
            onStale={(text) => {
              fail(declining, text, true);
              setDeclining(null);
            }}
            onBack={() => setDeclining(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function EmptyState({ view }: { view: RefundView }) {
  const text = {
    requests: ["No cancellation requests", "When a customer asks to cancel a paid booking, it shows up here."],
    send: ["Nothing to send", "Refunds you approve show up here until you send them and mark them refunded."],
    history: ["No refunds yet", "Refunded and declined requests show up here."],
  }[view];
  return (
    <Card className="flex items-start gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success-bg">
        <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
      </span>
      <div className="grid gap-1">
        <h2 className="text-[17px] leading-6 font-semibold text-navy-900">{text[0]}</h2>
        <p className="text-[15px] leading-6 text-navy-700">{text[1]}</p>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* pieces shared by the cards                                                                       */
/* ---------------------------------------------------------------------------------------------- */

function BookingLines({ item, aside }: { item: RefundItem; aside?: ReactNode }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[15px] font-bold tracking-[0.02em] text-navy-900">{item.ref}</p>
        {aside}
      </div>
      <div className="grid gap-0.5">
        <p className="text-sm font-semibold text-slate-500">{dayLabel(item.day)}</p>
        <p className="text-[20px] leading-7 font-bold text-navy-900">{rangeLabel(item.startHour, item.endHour)}</p>
        <p className="text-sm text-slate-500">
          {item.hours} {item.hours === 1 ? "hour" : "hours"}
          {item.paddles ? " · paddles rented" : ""}
        </p>
      </div>
    </>
  );
}

function Customer({ item }: { item: RefundItem }) {
  return (
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
  );
}

function MoneyRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={"flex justify-between gap-3 " + (strong ? "border-t border-line pt-1.5 font-semibold text-navy-900" : "")}>
      <dt className={strong ? "" : "text-slate-500"}>{label}</dt>
      <dd className="tabular-nums text-navy-900">{value}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Requests                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

function RequestCard({ item, onApprove, onDecline }: { item: RefundItem; onApprove: () => void; onDecline: () => void }) {
  return (
    <article aria-label={`Request ${item.ref}`} className={`${articleClass} md:grid-cols-2 md:gap-x-6`}>
      <div className="grid content-start gap-4">
        <BookingLines item={item} aside={<p className="text-sm text-slate-500">Asked {item.requested}</p>} />
        <Customer item={item} />
      </div>

      <div className="grid content-start gap-4">
        <dl className="grid gap-1.5 rounded-[var(--radius-control)] bg-ice-50 px-4 py-3 text-[15px]">
          <MoneyRow label="Paid" value={peso(item.total)} />
          <MoneyRow label="Cancellation fee (kept)" value={peso(item.fee)} />
          <MoneyRow label="Refund if approved" value={peso(item.refund)} strong />
        </dl>
        <div className="grid gap-0.5">
          <p className="text-sm font-semibold text-slate-500">Refund to GCash</p>
          <p className="text-[15px] font-semibold text-navy-900">{item.gcashName}</p>
          <p className="text-[15px] text-navy-900 tabular-nums">{item.gcashNumber}</p>
        </div>

        {!item.paymentChecked && (
          <p className="rounded-[var(--radius-control)] bg-warning-bg px-3 py-2 text-sm text-warning">
            <b>Payment not checked yet.</b> Approve or reject its GCash receipt in{" "}
            <Link href="/admin/payments" className="font-semibold underline underline-offset-2">
              Payments
            </Link>{" "}
            first.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 md:mt-auto">
          <Button variant="secondary" className={dangerButton} onClick={onDecline}>
            Decline
          </Button>
          <Button onClick={onApprove} disabled={!item.paymentChecked}>
            Approve
          </Button>
        </div>
      </div>
    </article>
  );
}

function ApproveForm(props: { item: RefundItem; onDone: () => void; onError: (text: string, stale?: boolean) => void; onBack: () => void }) {
  const { item } = props;
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      <p className="text-[15px] leading-6 text-navy-700">
        {dayLabel(item.day)} · {rangeLabel(item.startHour, item.endHour)} · {item.name}
      </p>
      <p className="text-[15px] leading-6 text-navy-700">
        The booking is cancelled and the hours open up for other players.{" "}
        {item.refund > 0 ? (
          <>
            You keep the {peso(item.fee)} fee and send <b className="tabular-nums">{peso(item.refund)}</b> to {item.gcashName}&apos;s GCash.
          </>
        ) : (
          <>The fee covers the whole booking, so there&apos;s nothing to send.</>
        )}
      </p>
      <div className="grid gap-3">
        <Button
          className="relative w-full"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={() =>
            start(async () => {
              const r = await approveCancellation(item.id);
              if (r.ok) props.onDone();
              else props.onError(r.error, r.stale);
            })
          }
        >
          <span className={pending ? "invisible" : undefined}>Approve cancellation</span>
          {pending && (
            <span className="absolute inset-0 grid place-items-center">
              <Spinner />
            </span>
          )}
        </Button>
        <Button variant="ghost" className="w-full" onClick={props.onBack} disabled={pending}>
          Back
        </Button>
      </div>
    </div>
  );
}

const QUICK_REASONS = [
  { label: "Too close to game time", text: "It's too close to game time to cancel, so your booking stays. Message us if you can't make it." },
  {
    label: "GCash details unclear",
    text: "The GCash name or number doesn't look right. Please send a new request with the correct details.",
  },
];

function DeclineForm(props: { item: RefundItem; onDone: () => void; onStale: (text: string) => void; onBack: () => void }) {
  const { item } = props;
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
          const r = await declineCancellation(item.id, reason);
          if (r.ok) props.onDone();
          else if (r.stale) props.onStale(r.error);
          else setError(r.error);
        });
      }}
    >
      <p className="text-[15px] leading-6 text-navy-700">
        {dayLabel(item.day)} · {rangeLabel(item.startHour, item.endHour)} · {peso(item.total)} · {item.name}
      </p>
      <p className="text-[15px] leading-6 text-navy-700">The booking stays as it is. The customer sees your reason in My bookings and can ask again.</p>

      <div className="grid gap-2">
        <p id="decline-quick" className="text-sm font-semibold text-navy-900">
          Quick reasons
        </p>
        <div role="group" aria-labelledby="decline-quick" className="flex flex-wrap gap-2">
          {QUICK_REASONS.map((r) => (
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
        <label htmlFor="decline-reason" className="text-sm font-semibold text-navy-900">
          Reason for the customer
        </label>
        <textarea
          id="decline-reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
          rows={3}
          maxLength={500}
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby="decline-reason-count"
          className={
            "w-full resize-none rounded-[var(--radius-control)] border bg-white px-4 py-3 text-base leading-6 text-navy-900 " +
            "outline-none transition-[border-color,box-shadow] duration-150 focus:border-orange-600 focus:ring-2 focus:ring-orange-500/40 " +
            (error ? "border-danger" : "border-line")
          }
        />
        <p id="decline-reason-count" className="text-right text-sm text-slate-500 tabular-nums">
          {reason.length}/500
        </p>
      </div>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <div className="grid gap-3">
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonClass("secondary", `relative w-full ${dangerButton}`)}>
          <span className={pending ? "invisible" : undefined}>Decline request</span>
          {pending && (
            <span className="absolute inset-0 grid place-items-center">
              <Spinner />
            </span>
          )}
        </button>
        <Button variant="ghost" className="w-full" onClick={props.onBack} disabled={pending}>
          Back
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* To send                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

type Phase = "idle" | "compressing" | "uploading" | "saving";

function SendCard({ item, onDone, onError }: { item: RefundItem; onDone: () => void; onError: (text: string, stale?: boolean) => void }) {
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputId = `refund-file-${item.id}`;
  const busy = phase !== "idle";
  const byOwner = item.cancelledBy === "owner";

  function setFile(next: File | null) {
    if (picked) URL.revokeObjectURL(picked.url);
    setPicked(next ? { file: next, url: URL.createObjectURL(next) } : null);
  }
  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked.url);
  }, [picked]);

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(item.gcashNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function markRefunded() {
    if (!picked) {
      setError("Add the GCash screenshot of the refund first.");
      return;
    }
    setError(null);
    try {
      setPhase("compressing");
      const { default: compress } = await import("browser-image-compression");
      const small = await compress(picked.file, { maxSizeMB: 0.8, maxWidthOrHeight: 1800, fileType: "image/jpeg", initialQuality: 0.85, useWebWorker: true });

      setPhase("uploading");
      const slot = await startRefundUpload(item.id);
      if (!slot.ok) {
        if (slot.stale) return onError(slot.error, true);
        throw new Error(slot.error);
      }
      const { error: upErr } = await createClient().storage.from("refund-proofs").uploadToSignedUrl(slot.path, slot.token, small, { contentType: "image/jpeg" });
      if (upErr) throw new Error("The upload didn't go through. Check your connection and try again.");

      setPhase("saving");
      const r = await completeRefund(item.id, slot.path);
      if (!r.ok) {
        if (r.stale) return onError(r.error, true);
        throw new Error(r.error);
      }
      setFile(null);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setPhase("idle");
    }
  }

  return (
    <article aria-label={`Refund ${item.ref}`} className={`${articleClass} md:grid-cols-2 md:gap-x-6`}>
      <div className="grid content-start gap-4">
        <BookingLines
          item={item}
          aside={<p className="text-sm text-slate-500">{byOwner ? "You cancelled it" : `Approved ${item.decided ?? ""}`}</p>}
        />
        <div className="grid gap-1 rounded-[var(--radius-control)] bg-ice-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm leading-5 font-semibold text-navy-700">Send by GCash</p>
            <p className="font-display text-[28px] leading-8 font-semibold text-navy-900 tabular-nums">{peso(item.refund)}</p>
          </div>
          <p className="text-sm text-slate-500">
            {byOwner ? "Full refund: you cancelled this booking." : `${peso(item.total)} paid − ${peso(item.fee)} fee you keep.`}
          </p>
        </div>
        <div className="grid gap-1">
          <p className="text-sm font-semibold text-slate-500">To</p>
          <p className="text-[17px] font-semibold text-navy-900">{item.gcashName}</p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[20px] leading-7 font-bold text-navy-900 tabular-nums">{item.gcashNumber}</p>
            <button
              type="button"
              onClick={copyNumber}
              aria-label={copied ? "GCash number copied" : "Copy GCash number"}
              className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-sm font-semibold text-navy-900 hover:bg-ice-50 active:bg-ice-100"
            >
              {copied ? <Check className="size-4 text-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <Customer item={item} />
      </div>

      <div className="grid content-start gap-3">
        <p className="text-sm font-semibold text-navy-900">After sending, add the GCash screenshot</p>
        {picked ? (
          <figure className="grid gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file (blob: URL) */}
            <img
              src={picked.url}
              alt={`Refund screenshot for ${item.ref}`}
              className="h-[320px] w-full rounded-[var(--radius-control)] border border-line bg-ice-100 object-contain"
            />
            <label htmlFor={inputId} className="flex min-h-11 w-fit cursor-pointer items-center text-sm font-semibold text-glacier-700 hover:underline">
              Choose a different screenshot
            </label>
          </figure>
        ) : (
          <label
            htmlFor={inputId}
            className="grid min-h-40 cursor-pointer place-items-center gap-1 rounded-[var(--radius-control)] border-2 border-dashed border-line bg-ice-50 p-4 text-center hover:border-orange-500/50 active:bg-ice-100"
          >
            <ImageUp className="size-6 text-orange-500" aria-hidden="true" />
            <span className="text-[15px] font-semibold text-navy-900">Add refund screenshot</span>
            <span className="text-sm text-slate-500">The customer can see it in My bookings</span>
          </label>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            setError(null);
            setFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Button className="relative w-full" disabled={busy} aria-busy={busy || undefined} onClick={markRefunded}>
          <span className={busy ? "invisible" : undefined}>Mark refunded</span>
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center gap-2">
              <Spinner />
              {phase === "compressing" ? "Preparing…" : phase === "uploading" ? "Uploading…" : "Saving…"}
            </span>
          )}
        </Button>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* History                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

function HistoryCard({ item }: { item: RefundItem }) {
  const done = item.status === "completed";
  const byOwner = item.cancelledBy === "owner";
  return (
    <article aria-label={`Refund ${item.ref}`} className={articleClass}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span
          className={
            "inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold whitespace-nowrap " +
            (done ? "bg-success-bg text-success" : "bg-neutral-bg text-neutral")
          }
        >
          {done ? "Refunded" : "Declined"}
        </span>
        <p className="text-[15px] font-bold tracking-[0.02em] text-navy-900">{item.ref}</p>
      </div>
      <p className="text-[15px] text-navy-900">
        {dayLabel(item.day)} · {rangeLabel(item.startHour, item.endHour)} · {item.name}
      </p>
      {done ? (
        <div className="grid gap-2">
          <p className="text-[15px] text-navy-700">
            <b className="tabular-nums text-navy-900">{peso(item.refund)}</b> sent to {item.gcashName}
            {item.completed && (
              <>
                {" "}
                · <span className="whitespace-nowrap">{item.completed}</span>
              </>
            )}
            <br />
            <span className="text-sm text-slate-500">
              {byOwner ? "You cancelled: full refund." : item.fee > 0 ? `${peso(item.fee)} fee kept.` : "No fee."}
            </span>
          </p>
          {item.proofUrl && (
            <a
              href={item.proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 w-fit items-center gap-1.5 text-[15px] font-semibold text-glacier-700 hover:underline"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Refund screenshot
            </a>
          )}
        </div>
      ) : (
        <p className="text-[15px] text-navy-700">
          {item.decided && <span className="text-sm text-slate-500">Declined {item.decided}. </span>}
          {item.declineReason}
        </p>
      )}
    </article>
  );
}

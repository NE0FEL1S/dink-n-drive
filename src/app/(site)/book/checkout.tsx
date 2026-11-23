"use client";

import { CheckCircle2, ChevronLeft, Download, ImageUp, Timer } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useCloseGuard } from "@/components/close-guard";
import { Button, buttonClass, Spinner } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import type { BookingErrorInfo } from "@/lib/booking-errors";
import { dayLabel, rangeLabel } from "@/lib/booking-time";
import { peso } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { createBooking, startProofUpload, submitProof, type CreatedBooking } from "./actions";

export type Account = { name: string | null; email: string | null; phone: string | null } | null;
export type GcashQr = import("@/lib/gcash").GcashQr | null;
type Sel = { start: number; end: number };

/* ---------------------------------------------------------------------------------------------- */
/* booking summary                                                                                 */
/* ---------------------------------------------------------------------------------------------- */

export function BookingSummary(props: { day: string; sel: Sel; paddles: boolean; hourlyRate: number; paddleFee: number; total: number }) {
  const { day, sel, paddles, hourlyRate, paddleFee, total } = props;
  const hours = sel.end - sel.start;
  return (
    <div className="rounded-[var(--radius-card)] border border-line p-4">
      <p className="text-sm text-slate-500">{dayLabel(day)}</p>
      <p className="tabular mt-0.5 text-xl font-bold text-navy-900">{rangeLabel(sel.start, sel.end)}</p>
      <dl className="mt-3 grid gap-1.5 text-[15px]">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">
            Court · {hours} {hours === 1 ? "hour" : "hours"} × {peso(hourlyRate)}
          </dt>
          <dd className="tabular font-semibold text-navy-900">{peso(hours * hourlyRate)}</dd>
        </div>
        {paddles && (
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Paddle rental</dt>
            <dd className="tabular font-semibold text-navy-900">{peso(paddleFee)}</dd>
          </div>
        )}
        <div className="mt-1 flex justify-between gap-3 border-t border-line pt-2">
          <dt className="font-semibold text-navy-900">Total</dt>
          <dd className="tabular text-lg font-bold text-navy-900">{peso(total)}</dd>
        </div>
      </dl>
    </div>
  );
}

function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 inline-flex min-h-12 w-fit items-center gap-1 rounded-full px-2 text-sm font-semibold text-glacier-700 hover:bg-glacier-50 active:bg-glacier-50"
    >
      <ChevronLeft className="size-5" aria-hidden="true" />
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* step 2: contact details → create the booking                                                    */
/* ---------------------------------------------------------------------------------------------- */

type FieldKey = "name" | "email" | "phone";

export function DetailsStep(props: {
  day: string;
  sel: Sel;
  startAt: string;
  paddles: boolean;
  total: number;
  hourlyRate: number;
  paddleFee: number;
  holdMinutes: number;
  account: Account;
  onBack: () => void;
  onRepick: (message: string) => void;
  onCreated: (booking: CreatedBooking, serverNow: number) => void;
}) {
  const { account } = props;
  const [values, setValues] = useState({ name: "", email: "", phone: "" });
  const [fields, setFields] = useState<Partial<Record<FieldKey, string>>>({});
  const [error, setError] = useState<BookingErrorInfo | null>(null);
  const [pending, start] = useTransition();
  const needName = !account || !account.name;
  const needPhone = !account || !account.phone;

  const set = (k: FieldKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (fields[k]) setFields((f) => ({ ...f, [k]: undefined }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await createBooking({
        startAt: props.startAt,
        hours: props.sel.end - props.sel.start,
        paddles: props.paddles,
        name: needName ? values.name : undefined,
        email: account ? undefined : values.email,
        phone: needPhone ? values.phone : undefined,
      });
      if (r.ok) return props.onCreated(r.booking, r.serverNow);
      if (r.error.repick) return props.onRepick(r.error.message);
      setFields(r.fields ?? {});
      setError(r.error);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 pt-1">
      <BackLink onClick={props.onBack}>Change hours</BackLink>
      <BookingSummary day={props.day} sel={props.sel} paddles={props.paddles} hourlyRate={props.hourlyRate} paddleFee={props.paddleFee} total={props.total} />

      <section aria-labelledby="details-title" className="grid gap-4">
        <div>
          <h3 id="details-title" className="text-[17px] font-semibold text-navy-900">
            Your details
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {account
              ? "We'll use the details on your account."
              : "No account needed. This booking will be saved on this browser."}
          </p>
        </div>

        {error && !error.field && <FormMessage tone="error">{error.message}</FormMessage>}

        {account && (
          <div className="rounded-[var(--radius-control)] bg-ice-50 px-4 py-3 text-[15px]">
            <p className="font-semibold text-navy-900">{account.name ?? "Your account"}</p>
            <p className="text-slate-500">{account.email}</p>
            {account.phone && <p className="tabular text-slate-500">{account.phone}</p>}
            <Link href="/profile" className="mt-1 inline-flex min-h-10 items-center text-sm font-semibold text-glacier-700 underline-offset-4 hover:underline">
              Edit in your profile
            </Link>
          </div>
        )}

        {needName && (
          <Field label="Full name" name="name" autoComplete="name" enterKeyHint="next" value={values.name} onChange={set("name")} error={fields.name} required />
        )}
        {!account && (
          <Field
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint="next"
            value={values.email}
            onChange={set("email")}
            error={fields.email}
            required
          />
        )}
        {needPhone && (
          <Field
            label="Mobile number"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="done"
            placeholder="09XXXXXXXXX"
            maxLength={16}
            hint={account ? "PH mobile, 11 digits. We'll save it to your profile." : "PH mobile, 11 digits. Only the court owner sees it."}
            value={values.phone}
            onChange={set("phone")}
            error={fields.phone}
            required
          />
        )}

        {!account && (
          <p className="text-sm text-slate-500">
            Have an account?{" "}
            <Link href="/login?next=%2Fbook" className="font-semibold text-glacier-700 underline-offset-4 hover:underline">
              Log in
            </Link>{" "}
            to use your saved details.
          </p>
        )}
      </section>

      <div className="grid gap-2">
        <Button type="submit" variant="cta" className="w-full text-[17px]" disabled={pending}>
          {pending ? <Spinner /> : null}
          {pending ? "Holding your hours…" : `Book and pay ${peso(props.total)}`}
        </Button>
        <p className="text-center text-sm text-slate-500">We hold your hours for {props.holdMinutes} minutes while you pay with GCash.</p>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* step 3: GCash QR + proof upload                                                                 */
/* ---------------------------------------------------------------------------------------------- */

type UploadPhase = "idle" | "compressing" | "uploading" | "saving";

export function PayStep(props: {
  booking: CreatedBooking;
  /** server clock − client clock, so the countdown matches the database */
  skewMs: number;
  qr: GcashQr;
  holdMinutes: number;
  onExpired: () => void;
  onDone: () => void;
}) {
  const { booking, qr } = props;
  const deadline = Date.parse(booking.holdExpiresAt);
  const [left, setLeft] = useState(() => Math.max(0, deadline - (Date.now() + props.skewMs)));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = phase !== "idle";
  const expired = left <= 0 && !busy;

  useCloseGuard(expired ? null : "Your hours are held while you pay. You can still upload your GCash screenshot from My bookings until the timer runs out. Close anyway?");

  useEffect(() => {
    const id = window.setInterval(() => setLeft(Math.max(0, deadline - (Date.now() + props.skewMs))), 1000);
    return () => window.clearInterval(id);
  }, [deadline, props.skewMs]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function choose(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Please choose a photo or screenshot (JPG or PNG).");
    if (f.size > 25 * 1024 * 1024) return setError("That file is too big. Please choose a screenshot.");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function upload() {
    if (!file) return;
    setError(null);
    try {
      setPhase("compressing");
      const { default: compress } = await import("browser-image-compression");
      const small = await compress(file, { maxSizeMB: 0.8, maxWidthOrHeight: 1800, fileType: "image/jpeg", initialQuality: 0.85, useWebWorker: true });

      setPhase("uploading");
      const slot = await startProofUpload(booking.id);
      if (!slot.ok) throw new Error(slot.error.message);
      const { error: upErr } = await createClient().storage.from("payment-proofs").uploadToSignedUrl(slot.path, slot.uploadToken, small, { contentType: "image/jpeg" });
      if (upErr) throw new Error("The upload didn't go through. Check your connection and try again.");

      setPhase("saving");
      const saved = await submitProof(booking.id, slot.path);
      if (!saved.ok) throw new Error(saved.error.message);
      props.onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setPhase("idle");
    }
  }

  if (expired) {
    return (
      <div className="grid gap-4 pt-2 text-center">
        <Timer className="mx-auto size-10 text-slate-500" aria-hidden="true" />
        <div>
          <p className="text-lg font-semibold text-navy-900">Time&apos;s up</p>
          <p className="mt-1 text-[15px] text-slate-500">
            No payment proof arrived within {props.holdMinutes} minutes, so booking {booking.ref} was released. If you already paid, message the court owner with your GCash receipt.
          </p>
        </div>
        <Button variant="secondary" className="w-full" onClick={props.onExpired}>
          Pick hours again
        </Button>
      </div>
    );
  }

  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);

  return (
    <div className="grid gap-4 pt-1">
      <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-warning-bg px-4 py-3 text-warning" role="timer" aria-live="off">
        <Timer className="size-5 shrink-0" aria-hidden="true" />
        <p className="text-[15px] font-semibold">
          Pay within <span className="tabular">{mm}:{String(ss).padStart(2, "0")}</span>
        </p>
        <span className="ml-auto text-sm font-semibold tabular">{booking.ref}</span>
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold text-slate-500">Send exactly</p>
        <p className="tabular font-display text-[40px] leading-[44px] font-semibold text-navy-900">{peso(booking.total)}</p>
        <p className="text-sm text-slate-500">via GCash</p>
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-white p-3">
        {qr ? (
          <>
            <Image
              src={qr.url}
              alt="GCash QR code for paying Dink n' Drive"
              width={1056}
              height={1701}
              unoptimized
              className="mx-auto h-auto w-full max-w-[240px] rounded-[var(--radius-control)]"
            />
            <a href={qr.downloadUrl} download className={buttonClass("secondary", "mt-3 w-full")}>
              <Download className="size-5" aria-hidden="true" />
              Save QR to Photos
            </a>
          </>
        ) : (
          <p className="px-2 py-6 text-center text-[15px] text-slate-500">The GCash QR isn&apos;t set up yet. Please message the court owner to pay.</p>
        )}
        <ol className="mt-3 grid gap-1.5 text-[15px] text-navy-700">
          <li>
            <b className="text-orange-600">1</b> Open GCash → <b>Scan QR</b> → <b>Upload QR</b>, and pick the saved QR.
          </li>
          <li>
            <b className="text-orange-600">2</b> Pay <b className="tabular">{peso(booking.total)}</b> and screenshot the receipt.
          </li>
          <li>
            <b className="text-orange-600">3</b> Upload the screenshot below.
          </li>
        </ol>
        <p className="mt-2 text-sm text-slate-500">On iPhone you can also long-press the QR and tap “Save to Photos”.</p>
      </div>

      <section aria-labelledby="proof-title" className="grid gap-3">
        <h3 id="proof-title" className="text-[17px] font-semibold text-navy-900">
          Upload your GCash receipt
        </h3>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          id="proof-file"
          onChange={(e) => choose(e.target.files?.[0])}
          disabled={busy}
        />
        {preview ? (
          <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file (blob: URL) */}
            <img src={preview} alt="Your GCash receipt" className="h-20 w-16 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-navy-900">{file?.name ?? "Screenshot"}</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="inline-flex min-h-10 items-center text-sm font-semibold text-glacier-700 underline-offset-4 hover:underline disabled:opacity-50"
              >
                Change
              </button>
            </div>
          </div>
        ) : (
          <label
            htmlFor="proof-file"
            className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-line bg-ice-50 px-4 py-6 text-center hover:border-orange-500/50 active:bg-ice-100"
          >
            <ImageUp className="size-8 text-orange-500" aria-hidden="true" />
            <span className="text-[15px] font-semibold text-navy-900">Choose screenshot</span>
            <span className="text-sm text-slate-500">From your photos or camera</span>
          </label>
        )}
        <Button variant="cta" className="w-full text-[17px]" onClick={upload} disabled={!file || busy}>
          {busy && <Spinner />}
          {phase === "compressing" ? "Preparing photo…" : phase === "uploading" ? "Uploading…" : phase === "saving" ? "Sending…" : "Send payment proof"}
        </Button>
        <p className="text-center text-sm text-slate-500">Closed this by accident? Upload from My bookings while the timer runs.</p>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* step 4: done                                                                                    */
/* ---------------------------------------------------------------------------------------------- */

export function DoneStep({ booking, isGuest, showMyBookingsLink = true }: { booking: CreatedBooking; isGuest: boolean; showMyBookingsLink?: boolean }) {
  return (
    <div className="grid gap-4 pt-2 text-center">
      <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden="true" />
      <div>
        <p className="text-xl font-semibold text-navy-900">Payment sent for review</p>
        <p className="mt-1 text-[15px] text-slate-500">
          The court owner checks the GCash payment and confirms your booking. Your hours stay held meanwhile.
        </p>
      </div>
      <div className="mx-auto rounded-[var(--radius-control)] bg-info-bg px-4 py-2 text-info">
        <p className="text-sm font-semibold">Pending review</p>
        <p className="tabular text-lg font-bold">{booking.ref}</p>
      </div>
      {isGuest && <p className="text-sm text-slate-500">This booking is saved in My bookings on this browser.</p>}
      {showMyBookingsLink && (
        <Link href="/my-bookings" className={buttonClass("secondary", "w-full")}>
          Go to My bookings
        </Link>
      )}
    </div>
  );
}

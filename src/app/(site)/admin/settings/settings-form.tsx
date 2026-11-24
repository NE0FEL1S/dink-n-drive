"use client";

import { useActionState, useCallback, useEffect, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Toast } from "@/components/ui/toast";
import { timeLabel } from "@/lib/booking-time";
import { saveSettings, type SettingsField, type SettingsState } from "./actions";

type Values = Record<SettingsField, string>;

/** Top-to-bottom order of the fields on the page. */
const FIELD_ORDER: SettingsField[] = [
  "court_name",
  "hourly_rate",
  "paddle_fee",
  "paddle_count",
  "open_hour",
  "close_hour",
  "hold_minutes",
  "max_advance_days",
  "max_unpaid_bookings",
  "cancel_cutoff_hours",
  "cancel_fee",
];

const inputClass =
  "h-12 w-full min-w-0 rounded-[var(--radius-control)] border bg-white px-4 text-base text-navy-900 tabular-nums " +
  "outline-none transition-[border-color,box-shadow] duration-150 focus:border-orange-600 focus:ring-2 focus:ring-orange-500/40";

const selectArrow =
  "appearance-none bg-[url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='20'%20height='20'%20fill='none'%20stroke='%231F3453'%20stroke-width='2'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='m5%208%205%205%205-5'/%3E%3C/svg%3E\")] bg-[right_12px_center] bg-no-repeat pr-10";

/** The business settings, grouped like the spec's rules table (SPEC §1). One Save for everything. */
export function SettingsForm({ initial, lastChange }: { initial: Values; lastChange: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});
  const [dismissed, setDismissed] = useState<number | undefined>();
  const toast = state.savedAt && state.savedAt !== dismissed ? state.savedAt : null;
  const dismiss = useCallback(() => setDismissed(state.savedAt), [state.savedAt]);

  // after a refused save, take the owner to the first field that needs fixing
  useEffect(() => {
    if (!state.fields) return;
    const first = FIELD_ORDER.find((k) => state.fields?.[k]);
    const el = first && document.getElementById(`set-${first}`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus({ preventScroll: true });
    }
  }, [state.fields]);

  const v = (k: SettingsField) => state.values?.[k] ?? initial[k];
  const err = (k: SettingsField) => state.fields?.[k];

  return (
    <form action={action} className="grid gap-4" noValidate>
      {toast && (
        <Toast key={toast} tone="success" onDismiss={dismiss}>
          Settings saved. New bookings use them from now on.
        </Toast>
      )}

      <Section title="Court">
        <TextField name="court_name" label="Court name" defaultValue={v("court_name")} error={err("court_name")} />
      </Section>

      <Section title="Prices" note="Bookings already made keep the prices they were made with.">
        <NumberField name="hourly_rate" label="Court fee per hour" peso defaultValue={v("hourly_rate")} error={err("hourly_rate")} />
        <NumberField
          name="paddle_fee"
          label="Paddle rental (per booking)"
          peso
          defaultValue={v("paddle_fee")}
          error={err("paddle_fee")}
          hint="Flat fee for any booking that rents paddles."
        />
        <NumberField name="paddle_count" label="Paddles available" defaultValue={v("paddle_count")} error={err("paddle_count")} hint="Shown to customers only." />
      </Section>

      <Section title="Opening hours" note="Changing the hours doesn't cancel bookings that are already made.">
        <HourField name="open_hour" label="Opens at" hours={range(0, 23)} defaultValue={v("open_hour")} error={err("open_hour")} />
        <HourField name="close_hour" label="Closes at" hours={range(1, 24)} defaultValue={v("close_hour")} error={err("close_hour")} />
      </Section>

      <Section title="Booking rules">
        <NumberField
          name="hold_minutes"
          label="Minutes to pay"
          suffix="min"
          defaultValue={v("hold_minutes")}
          error={err("hold_minutes")}
          hint="Unpaid bookings are released after this."
        />
        <NumberField
          name="max_advance_days"
          label="Book up to"
          suffix="days ahead"
          defaultValue={v("max_advance_days")}
          error={err("max_advance_days")}
        />
        <NumberField
          name="max_unpaid_bookings"
          label="Unpaid bookings per mobile number"
          defaultValue={v("max_unpaid_bookings")}
          error={err("max_unpaid_bookings")}
          hint="At the same time."
        />
      </Section>

      <Section title="Cancellations" note="Each booking keeps the fee it was made with.">
        <NumberField
          name="cancel_cutoff_hours"
          label="Paid bookings can be cancelled until"
          suffix="hours before"
          defaultValue={v("cancel_cutoff_hours")}
          error={err("cancel_cutoff_hours")}
        />
        <NumberField
          name="cancel_fee"
          label="Cancellation fee"
          peso
          defaultValue={v("cancel_fee")}
          error={err("cancel_fee")}
          hint="Kept from the refund when a customer cancels a paid booking."
        />
      </Section>

      {/* Save stays in reach while scrolling the form (sticky inside the form only). */}
      <div className="sticky bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-10 grid gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[0_-4px_24px_rgb(15_27_51/0.10)] sm:flex sm:items-center sm:justify-between">
        <div className="grid gap-2">
          {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
          <p className="text-sm text-slate-500">{lastChange}</p>
        </div>
        <SubmitButton className="w-full sm:w-auto" pending={pending}>
          Save settings
        </SubmitButton>
      </div>
    </form>
  );
}

function range(a: number, b: number) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Card className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-[20px] leading-7 font-bold text-navy-900">{title}</h2>
        {note && <p className="text-sm text-slate-500">{note}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

type FieldProps = { name: SettingsField; label: string; defaultValue: string; error?: string; hint?: string };

function Described({ name, label, error, hint, children }: FieldProps & { children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={`set-${name}`} className="text-sm font-semibold text-navy-900">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`set-${name}-msg`} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`set-${name}-msg`} className="text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function TextField(props: FieldProps) {
  return (
    <Described {...props}>
      <input
        id={`set-${props.name}`}
        name={props.name}
        defaultValue={props.defaultValue}
        maxLength={80}
        autoComplete="off"
        enterKeyHint="next"
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error || props.hint ? `set-${props.name}-msg` : undefined}
        className={`${inputClass} ${props.error ? "border-danger" : "border-line"}`}
      />
    </Described>
  );
}

function NumberField(props: FieldProps & { peso?: boolean; suffix?: string }) {
  return (
    <Described {...props}>
      <div className="relative">
        {props.peso && (
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-base font-semibold text-slate-500" aria-hidden="true">
            ₱
          </span>
        )}
        <input
          id={`set-${props.name}`}
          name={props.name}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          defaultValue={props.defaultValue}
          autoComplete="off"
          enterKeyHint="next"
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.error || props.hint ? `set-${props.name}-msg` : undefined}
          className={`${inputClass} ${props.peso ? "pl-9" : ""} ${props.suffix ? "pr-28" : ""} ${props.error ? "border-danger" : "border-line"}`}
        />
        {props.suffix && (
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-slate-500" aria-hidden="true">
            {props.suffix}
          </span>
        )}
      </div>
    </Described>
  );
}

function HourField(props: FieldProps & { hours: number[] }) {
  return (
    <Described {...props}>
      <select
        id={`set-${props.name}`}
        name={props.name}
        defaultValue={props.defaultValue}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? `set-${props.name}-msg` : undefined}
        className={`${inputClass} ${selectArrow} ${props.error ? "border-danger" : "border-line"}`}
      >
        {props.hours.map((h) => (
          <option key={h} value={h}>
            {h === 24 ? "12:00 AM (midnight)" : h === 12 ? "12:00 PM (noon)" : timeLabel(h)}
          </option>
        ))}
      </select>
    </Described>
  );
}

"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Ban, Check } from "lucide-react";
import { Button, buttonClass, Spinner } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { STATUS_LABELS } from "@/components/ui/status-badge";
import { dayLabel, rangeLabel, timeLabel } from "@/lib/booking-time";
import { createBlock, loadBlockDay, removeBlock, type BlockDay, type BlockHour } from "./block-actions";

const dangerText = "text-danger! hover:bg-danger-bg! active:bg-danger-bg!";

/** "Block hours" button + the sheet to pick a day and hours (SPEC §4: block hours, remove blocks). */
export function BlockHoursButton({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" className="w-full px-3 whitespace-nowrap sm:w-auto sm:px-6" onClick={() => setOpen(true)}>
        <Ban className="size-5 text-navy-700" aria-hidden="true" />
        Block hours
      </Button>
      <Sheet open={open} title="Block hours" onClose={() => setOpen(false)}>
        <BlockHoursForm today={today} />
      </Sheet>
    </>
  );
}

function BlockHoursForm({ today }: { today: string }) {
  const [day, setDay] = useState(today);
  const [data, setData] = useState<BlockDay | null>(null);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  const load = useCallback((d: string) => {
    startLoading(async () => setData(await loadBlockDay(d)));
  }, []);
  useEffect(() => load(day), [day, load]);

  const hours = data?.ok && data.day === day ? data.hours : null;
  const byHour = new Map(hours?.map((h) => [h.hour, h]));
  const isFree = (h: number) => byHour.get(h)?.state === "free";
  const allFree = (a: number, b: number) => {
    for (let h = a; h < b; h++) if (!isFree(h)) return false;
    return true;
  };

  function tap(h: number) {
    setMessage(null);
    if (!sel) return setSel({ start: h, end: h + 1 });
    const { start, end } = sel;
    if (h >= start && h < end) {
      if (end - start === 1) return setSel(null);
      return setSel({ start, end: h === start ? start + 1 : h === end - 1 ? h : h + 1 });
    }
    if (h >= end) return setSel(allFree(end, h + 1) ? { start, end: h + 1 } : { start: h, end: h + 1 });
    return setSel(allFree(h, start) ? { start: h, end } : { start: h, end: h + 1 });
  }

  const past = hours?.filter((h) => h.state === "past") ?? [];
  const shown = hours?.filter((h) => h.state !== "past") ?? [];

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="block-day" className="text-sm font-semibold text-navy-900">
          Day
        </label>
        <input
          id="block-day"
          type="date"
          min={today}
          value={day}
          onChange={(e) => {
            if (!e.target.value) return;
            setDay(e.target.value);
            setSel(null);
            setMessage(null);
          }}
          className="h-12 w-full rounded-[var(--radius-control)] border border-line bg-white px-4 text-base text-navy-900 outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-500/40"
        />
        <p className="text-sm text-slate-500">
          Tap the first hour to block, then a later hour to block more. Blocked hours show as booked to customers.
        </p>
      </div>

      {data && !data.ok && <FormMessage tone="error">{data.error}</FormMessage>}

      {!hours ? (
        <div className="grid gap-2" aria-busy="true" aria-label="Loading hours">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-[var(--radius-control)] bg-ice-100" />
          ))}
        </div>
      ) : (
        <section aria-label={`Hours on ${dayLabel(day)}`} className={`grid gap-2 transition-opacity ${loading ? "opacity-70" : ""}`}>
          <h3 className="text-[17px] font-semibold text-navy-900">{dayLabel(day)}</h3>
          {past.length > 0 && (
            <p className="rounded-[var(--radius-control)] bg-ice-50 px-4 py-2.5 text-sm text-slate-500">
              Earlier hours ({rangeLabel(past[0].hour, past[past.length - 1].hour + 1)}) have passed.
            </p>
          )}
          {shown.length === 0 ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-sm text-slate-500">
              No hours left on this day. Pick another day.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.map((h) => (
                <HourRow
                  key={h.hour}
                  h={h}
                  sel={sel}
                  onTap={tap}
                  onRemoved={(text) => {
                    setMessage({ tone: "success", text });
                    load(day);
                  }}
                  onRemoveError={(text) => {
                    setMessage({ tone: "error", text });
                    load(day);
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <form
        // pinned to the bottom of the sheet, like the booking popup's bar, so it's in reach after picking hours
        className="sticky bottom-0 -mx-4 grid gap-3 border-t border-line bg-white px-4 pt-3 pb-1 sm:-mx-6 sm:px-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!sel) return;
          const picked = sel;
          startSaving(async () => {
            const r = await createBlock({ day, start: picked.start, hours: picked.end - picked.start, note });
            if (r.ok) {
              setMessage({ tone: "success", text: `Blocked ${rangeLabel(picked.start, picked.end)} on ${dayLabel(day)} (${r.ref}).` });
              setSel(null);
              setNote("");
            } else {
              setMessage({ tone: "error", text: r.error });
              if (r.stale) setSel(null);
            }
            load(day);
          });
        }}
      >
        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <div className="grid gap-1.5">
          <label htmlFor="block-note" className="text-sm font-semibold text-navy-900">
            Note <span className="font-medium text-slate-500">(optional, only you see it)</span>
          </label>
          <input
            id="block-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            enterKeyHint="done"
            autoComplete="off"
            placeholder="Maintenance, tournament, rain…"
            className="h-12 w-full rounded-[var(--radius-control)] border border-line bg-white px-4 text-base text-navy-900 outline-none placeholder:text-slate-300 focus:border-orange-600 focus:ring-2 focus:ring-orange-500/40"
          />
        </div>
        <button
          type="submit"
          disabled={!sel || saving}
          aria-busy={saving || undefined}
          className={buttonClass("primary", "relative w-full")}
        >
          <span className={saving ? "invisible" : undefined}>
            {sel ? `Block ${rangeLabel(sel.start, sel.end)}` : "Pick the hours to block"}
          </span>
          {saving && (
            <span className="absolute inset-0 grid place-items-center">
              <Spinner />
            </span>
          )}
        </button>
      </form>
    </div>
  );
}

function HourRow({
  h,
  sel,
  onTap,
  onRemoved,
  onRemoveError,
}: {
  h: BlockHour;
  sel: { start: number; end: number } | null;
  onTap: (hour: number) => void;
  onRemoved: (text: string) => void;
  onRemoveError: (text: string) => void;
}) {
  const time = `${timeLabel(h.hour)} – ${timeLabel(h.hour + 1)}`;
  const tile = "flex min-h-14 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border px-4 py-2 text-left";

  if (h.state === "free") {
    const selected = !!sel && h.hour >= sel.start && h.hour < sel.end;
    return (
      <li>
        <button
          type="button"
          onClick={() => onTap(h.hour)}
          aria-pressed={selected}
          aria-label={`${timeLabel(h.hour)} to ${timeLabel(h.hour + 1)}, ${selected ? "selected" : "free"}`}
          className={
            `${tile} touch-manipulation transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:outline-none ` +
            (selected
              ? "border-navy-900 bg-navy-900 text-white"
              : "border-line bg-white text-navy-900 hover:bg-ice-50 active:bg-ice-100")
          }
        >
          <span className="text-base font-semibold tabular-nums">{time}</span>
          {selected ? <Check className="size-5" aria-hidden="true" /> : <span className="text-sm font-medium text-slate-500">Free</span>}
        </button>
      </li>
    );
  }

  if (h.state === "booked") {
    return (
      <li className={`${tile} border-ice-100 bg-ice-100 text-slate-500`} aria-label={`${time}, booked by ${h.name}`}>
        <span className="text-base font-semibold tabular-nums">{time}</span>
        <span className="min-w-0 truncate text-right text-sm">
          <b className="font-semibold text-navy-700">{h.name}</b> · {STATUS_LABELS[h.status]}
        </span>
      </li>
    );
  }

  if (h.state === "blocked") {
    return (
      <li className={`${tile} flex-wrap border-neutral-bg bg-neutral-bg text-neutral`}>
        <span className="text-base font-semibold tabular-nums">{time}</span>
        <span className="min-w-0 truncate text-right text-sm">
          <b className="font-semibold">Blocked</b>
          {h.note ? ` · ${h.note}` : ""}
        </span>
        {h.first && (
          <div className="flex w-full justify-end">
            <RemoveBlockButton
              blockId={h.blockId}
              label={rangeLabel(h.start, h.end)}
              onDone={onRemoved}
              onError={onRemoveError}
            />
          </div>
        )}
      </li>
    );
  }
  return null;
}

/**
 * "Remove block" with a confirm step. Used in the Block hours sheet and in the bookings list.
 * The server action refreshes the page, so the list updates by itself.
 */
export function RemoveBlockButton({
  blockId,
  label,
  onDone,
  onError,
}: {
  blockId: string;
  /** "2:00 – 4:00 PM" */
  label: string;
  onDone?: (text: string) => void;
  onError?: (text: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <span className="inline-grid justify-items-start gap-1">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold ${dangerText}`}
        >
          Remove block
        </button>
        {error && !onError && <span className="text-sm font-medium text-danger">{error}</span>}
      </span>
    );
  }
  return (
    <div role="group" aria-label={`Remove the ${label} block?`} className="grid w-full gap-2">
      <p className="text-sm font-semibold text-navy-900">Remove the {label} block? Customers can book these hours again.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={() =>
            start(async () => {
              const r = await removeBlock(blockId);
              if (r.ok) {
                onDone?.(`Removed the ${label} block.`);
              } else {
                setError(r.error);
                onError?.(r.error);
              }
              setConfirming(false);
            })
          }
          className={buttonClass("secondary", `relative min-h-11 px-4 text-sm border-danger/30! ${dangerText}`)}
        >
          <span className={pending ? "invisible" : undefined}>Yes, remove</span>
          {pending && (
            <span className="absolute inset-0 grid place-items-center">
              <Spinner />
            </span>
          )}
        </button>
        <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={buttonClass("ghost", "min-h-11 px-4 text-sm")}>
          Keep it
        </button>
      </div>
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

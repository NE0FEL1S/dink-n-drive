"use client";

import { CalendarDays, Check, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { addDays, dayLabel, dayParts, rangeLabel, slotStartIso, slotStartMs, timeLabel } from "@/lib/booking-time";
import { peso } from "@/lib/format";
import { fetchAvailability, type CreatedBooking } from "./actions";
import { DetailsStep, DoneStep, PayStep, type Account, type GcashQr } from "./checkout";

export type FlowSettings = {
  hourlyRate: number;
  paddleFee: number;
  paddleCount: number;
  openHour: number;
  closeHour: number;
  maxAdvanceDays: number;
  holdMinutes: number;
};

type Selection = { start: number; end: number };

type Props = {
  settings: FlowSettings;
  /** Manila day on the server when the page was rendered ("YYYY-MM-DD"). */
  today: string;
  /** Server time, so "past" hours match between server and client render. */
  nowMs: number;
  /** null when the server couldn't load them; the client fetches instead. */
  initialTaken: number[] | null;
  /** "sheet": inside the popup (own scroll area, bar pinned at the bottom). "page": /book, bar sticks to the window. */
  variant: "sheet" | "page";
  /** The signed-in customer (prefilled details), or null for guests. */
  account: Account;
  qr: GcashQr;
};

const REFRESH_MS = 60_000;

/**
 * The booking popup / page (DESIGN.md §5): 1 pick hours → 2 your details → 3 GCash + proof → 4 done.
 * Availability is read-only here; the database re-checks everything when the booking is created.
 */
export function BookingFlow({ settings, today, nowMs, initialTaken, variant, account, qr }: Props) {
  const { openHour, closeHour, hourlyRate, paddleFee } = settings;
  // late in the day (last hour already started) open on tomorrow instead of an empty today
  const [day, setDay] = useState(() =>
    slotStartMs(today, settings.closeHour - 1) > nowMs ? today : addDays(today, 1),
  );
  const [takenByDay, setTakenByDay] = useState<Record<string, number[]>>(initialTaken ? { [today]: initialTaken } : {});
  const [failedDay, setFailedDay] = useState<string | null>(null);
  const [now, setNow] = useState(nowMs);
  const [sel, setSel] = useState<Selection | null>(null);
  const [paddles, setPaddles] = useState(false);
  const [step, setStep] = useState<"pick" | "details" | "pay" | "done">("pick");
  // the booking once created (its hours then show as taken, so it no longer lives in `sel`)
  const [booked, setBooked] = useState<{ booking: CreatedBooking; skewMs: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [loading, startLoading] = useTransition();

  const load = useCallback((d: string) => {
    startLoading(async () => {
      const r = await fetchAvailability(d);
      if (r.ok) {
        setTakenByDay((t) => ({ ...t, [r.day]: r.taken }));
        setFailedDay((f) => (f === r.day ? null : f));
      } else {
        setFailedDay(r.day);
      }
    });
  }, []);

  // first visit to a day → fetch; the current day refreshes every minute and when the tab comes back
  useEffect(() => {
    if (!takenByDay[day]) load(day);
  }, [day, takenByDay, load]);
  useEffect(() => {
    const refresh = () => {
      setNow(Date.now());
      load(day);
    };
    const id = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [day, load]);

  const taken = useMemo(() => new Set(takenByDay[day] ?? []), [takenByDay, day]);
  const known = takenByDay[day] !== undefined;
  const isPast = (h: number) => slotStartMs(day, h) <= now;
  const isFree = (h: number) => h >= openHour && h < closeHour && known && !taken.has(h) && !isPast(h);
  const allFree = (a: number, b: number) => {
    for (let h = a; h < b; h++) if (!isFree(h)) return false;
    return true;
  };

  // someone booked part of the selection meanwhile (or it slipped into the past)
  const conflict = sel !== null && known && !allFree(sel.start, sel.end);
  const active = sel && !conflict ? sel : null;
  const hours = active ? active.end - active.start : 0;
  const total = hours * hourlyRate + (active && paddles ? paddleFee : 0);

  function go(next: typeof step) {
    setStep(next);
    requestAnimationFrame(() => {
      if (variant === "sheet") scrollRef.current?.scrollTo({ top: 0 });
      else scrollRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  function pickDay(d: string) {
    if (d === day) return;
    setDay(d);
    setSel(null);
    setStep("pick");
  }

  function tap(h: number) {
    if (!isFree(h) && !(active && h >= active.start && h < active.end)) return;
    if (!active) return setSel({ start: h, end: h + 1 });
    const { start, end } = active;
    if (h >= start && h < end) {
      // inside the selection: shrink
      if (end - start === 1) return setSel(null);
      if (h === start) return setSel({ start, end: start + 1 });
      if (h === end - 1) return setSel({ start, end: h });
      return setSel({ start, end: h + 1 });
    }
    if (h >= end) return setSel(allFree(end, h + 1) ? { start, end: h + 1 } : { start: h, end: h + 1 });
    return setSel(allFree(h, start) ? { start: h, end } : { start: h, end: h + 1 });
  }

  const hourList = Array.from({ length: closeHour - openHour }, (_, i) => openHour + i);
  const pastHours = day === today ? hourList.filter(isPast) : [];
  const shownHours = hourList.filter((h) => !pastHours.includes(h));

  const body =
    step === "details" && active ? (
      <DetailsStep
        day={day}
        sel={active}
        startAt={slotStartIso(day, active.start)}
        paddles={paddles}
        total={total}
        hourlyRate={hourlyRate}
        paddleFee={paddleFee}
        holdMinutes={settings.holdMinutes}
        account={account}
        onBack={() => go("pick")}
        onRepick={(message) => {
          setNotice(message);
          setSel(null);
          load(day);
          go("pick");
        }}
        onCreated={(booking, serverNow) => {
          setBooked({ booking, skewMs: serverNow - Date.now() });
          setSel(null);
          setPaddles(false);
          load(day);
          go("pay");
        }}
      />
    ) : step === "pay" && booked ? (
      <PayStep
        booking={booked.booking}
        skewMs={booked.skewMs}
        qr={qr}
        holdMinutes={settings.holdMinutes}
        onDone={() => go("done")}
        onExpired={() => {
          setBooked(null);
          load(day);
          go("pick");
        }}
      />
    ) : step === "done" && booked ? (
      <DoneStep booking={booked.booking} isGuest={!account} />
    ) : (
      <>
        <DateStrip today={today} day={day} maxAdvanceDays={settings.maxAdvanceDays} onPick={pickDay} />

        <section aria-labelledby="hours-title" className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="hours-title" className="text-[17px] font-semibold text-navy-900">
              {dayLabel(day)}
            </h3>
            <p className="text-sm text-slate-500">{peso(hourlyRate)} / hour</p>
          </div>
          <p className="mt-1 text-sm text-slate-500" aria-live="polite">
            {active
              ? "Tap a later hour to add more, or tap a picked hour to remove it."
              : "Tap the hour you want to start. Then tap a later hour to play longer."}
          </p>

          {notice && !active && (
            <p role="alert" className="mt-3 rounded-[var(--radius-control)] bg-warning-bg px-4 py-3 text-sm font-medium text-warning">
              {notice}
            </p>
          )}
          {conflict && (
            <p role="alert" className="mt-3 rounded-[var(--radius-control)] bg-warning-bg px-4 py-3 text-sm font-medium text-warning">
              Someone just booked part of those hours. Please pick again.
            </p>
          )}
          {failedDay === day && (
            <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-danger-bg px-4 py-2 text-sm font-medium text-danger">
              <span>We couldn&apos;t load this day.</span>
              <button type="button" onClick={() => load(day)} className="min-h-12 px-2 font-semibold underline underline-offset-4">
                Try again
              </button>
            </div>
          )}

          {pastHours.length > 0 && shownHours.length > 0 && (
            <p className="mt-3 rounded-[var(--radius-control)] bg-ice-50 px-4 py-2.5 text-sm text-slate-500">
              Earlier hours ({rangeLabel(pastHours[0], pastHours[pastHours.length - 1] + 1)}) have passed.
            </p>
          )}

          {!known ? (
            <SlotSkeleton />
          ) : shownHours.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center">
              <p className="font-semibold text-navy-900">No more hours today.</p>
              <p className="mt-1 text-sm text-slate-500">The court closes at {timeLabel(closeHour)}. Pick another day above.</p>
            </div>
          ) : (
            <ul className={`mt-3 flex flex-col gap-2 transition-opacity ${loading ? "opacity-70" : ""}`}>
              {shownHours.map((h) => {
                const selected = !!active && h >= active.start && h < active.end;
                const joinTop = selected && h > active!.start;
                const joinBottom = selected && h < active!.end - 1;
                const free = isFree(h);
                const state = selected ? "selected" : free ? "available" : "booked";
                return (
                  <li key={h} className={joinTop ? "-mt-2" : undefined}>
                    <button
                      type="button"
                      onClick={() => tap(h)}
                      disabled={!free && !selected}
                      aria-pressed={selected}
                      aria-label={`${timeLabel(h)} to ${timeLabel(h + 1)}, ${state}`}
                      className={
                        "flex h-14 w-full touch-manipulation items-center justify-between gap-3 border px-4 text-left transition-colors duration-150 " +
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:ring-offset-1 " +
                        (joinTop ? "rounded-t-none border-t-orange-700/40 " : "rounded-t-[var(--radius-control)] ") +
                        (joinBottom ? "rounded-b-none " : "rounded-b-[var(--radius-control)] ") +
                        (selected
                          ? "border-orange-600 bg-orange-600 text-white active:bg-orange-700"
                          : free
                            ? "border-line bg-white text-navy-900 hover:border-orange-500/50 hover:bg-orange-50 active:bg-orange-50"
                            : "cursor-not-allowed border-ice-100 bg-ice-100 text-slate-500")
                      }
                    >
                      <span className="tabular text-base font-semibold">
                        {timeLabel(h)} – {timeLabel(h + 1)}
                      </span>
                      {selected ? (
                        <Check className="size-5" aria-hidden="true" />
                      ) : free ? (
                        <span className="text-sm font-medium text-slate-500">Available</span>
                      ) : (
                        <span className="text-sm font-semibold">Booked</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </>
    );

  return (
    <div className={variant === "sheet" ? "flex min-h-0 flex-1 flex-col" : "flex flex-col"}>
      <div ref={scrollRef} className={variant === "sheet" ? "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 sm:px-6" : "scroll-mt-24 pb-6"}>
        {body}
      </div>

      {active && step === "pick" && (
        <SummaryBar
          variant={variant}
          day={day}
          sel={active}
          paddles={paddles}
          onPaddles={setPaddles}
          total={total}
          settings={settings}
          canAdd={active.end < closeHour && isFree(active.end)}
          onLess={() => setSel(hours > 1 ? { start: active.start, end: active.end - 1 } : active)}
          onMore={() => setSel({ start: active.start, end: active.end + 1 })}
          onContinue={() => {
            setNotice(null);
            go("details");
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */

function DateStrip({ today, day, maxAdvanceDays, onPick }: { today: string; day: string; maxAdvanceDays: number; onPick: (d: string) => void }) {
  const days = useMemo(() => Array.from({ length: maxAdvanceDays + 1 }, (_, i) => addDays(today, i)), [today, maxAdvanceDays]);
  const stripRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const p = dayParts(day);

  function choose(d: string) {
    onPick(d);
    stripRef.current?.querySelector<HTMLElement>(`[data-day="${d}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }

  return (
    <section aria-label="Choose a day">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.06em] text-slate-500">
          {p.month} {day.slice(0, 4)}
        </h3>
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              const input = dateInputRef.current;
              if (!input) return;
              try {
                input.showPicker();
              } catch {
                input.focus();
                input.click();
              }
            }}
            className="inline-flex min-h-12 items-center gap-2 rounded-full px-3 text-sm font-semibold text-glacier-700 hover:bg-glacier-50 active:bg-glacier-50"
          >
            <CalendarDays className="size-5" aria-hidden="true" />
            Calendar
          </button>
          <input
            ref={dateInputRef}
            type="date"
            min={today}
            max={days[days.length - 1]}
            value={day}
            onChange={(e) => e.target.value && days.includes(e.target.value) && choose(e.target.value)}
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0"
          />
        </div>
      </div>
      <div
        ref={stripRef}
        className="-mx-4 mt-2 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {days.map((d, i) => {
          const parts = dayParts(d);
          const on = d === day;
          return (
            <button
              key={d}
              type="button"
              data-day={d}
              onClick={() => choose(d)}
              aria-pressed={on}
              aria-label={i === 0 ? `Today, ${dayLabel(d)}` : dayLabel(d)}
              className={
                "flex h-[68px] w-[58px] shrink-0 snap-start touch-manipulation flex-col items-center justify-center rounded-[var(--radius-control)] border transition-colors duration-150 " +
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 " +
                (on ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-white text-navy-900 hover:bg-ice-50 active:bg-ice-100")
              }
            >
              <span className={`text-xs font-semibold ${on ? "text-white/80" : "text-slate-500"}`}>{i === 0 ? "Today" : parts.weekday}</span>
              <span className="tabular text-lg leading-6 font-bold">{parts.date}</span>
              <span className={`text-[11px] font-semibold ${on ? "text-white/70" : "text-slate-500"}`}>{parts.month}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SummaryBar(props: {
  variant: "sheet" | "page";
  day: string;
  sel: Selection;
  paddles: boolean;
  onPaddles: (v: boolean) => void;
  total: number;
  settings: FlowSettings;
  canAdd: boolean;
  onLess: () => void;
  onMore: () => void;
  onContinue: () => void;
}) {
  const { variant, day, sel, paddles, onPaddles, total, settings, canAdd } = props;
  const hours = sel.end - sel.start;
  return (
    <div
      role="region"
      aria-label="Your booking"
      className={
        "z-10 border-t border-line bg-white px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(15_27_51/0.08)] sm:px-6 " +
        (variant === "page" ? "sticky bottom-0 -mx-5 -mb-5 rounded-b-[var(--radius-card)] sm:-mx-7 sm:-mb-7" : "rounded-b-[var(--radius-sheet)]")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular truncate text-base font-bold text-navy-900">{rangeLabel(sel.start, sel.end)}</p>
          <p className="truncate text-sm text-slate-500">
            {dayLabel(day)} · {hours} {hours === 1 ? "hour" : "hours"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={props.onLess}
            disabled={hours <= 1}
            aria-label="One hour less"
            className="grid size-12 touch-manipulation place-items-center rounded-full border border-line bg-white text-navy-900 active:bg-ice-100 disabled:opacity-40"
          >
            <Minus className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={props.onMore}
            disabled={!canAdd}
            aria-label="One hour more"
            className="grid size-12 touch-manipulation place-items-center rounded-full border border-line bg-white text-navy-900 active:bg-ice-100 disabled:opacity-40"
          >
            <Plus className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] bg-ice-50 px-3 py-2">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-navy-900">Rent paddles · {peso(settings.paddleFee)}</span>
          <span className="block text-sm text-slate-500">Flat fee per booking · {settings.paddleCount} paddles</span>
        </span>
        <input type="checkbox" role="switch" checked={paddles} onChange={(e) => onPaddles(e.target.checked)} className="peer sr-only" />
        {/* drawn from state (not :checked), so every browser repaints it right away */}
        <span
          aria-hidden="true"
          className={
            "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/60 " +
            (paddles ? "bg-orange-600" : "bg-slate-300")
          }
        >
          <span
            className={
              "absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform duration-150 " +
              (paddles ? "translate-x-5" : "translate-x-0")
            }
          />
        </span>
      </label>

      <div className="mt-3 flex items-center gap-4">
        <div className="shrink-0">
          <p className="text-xs font-semibold text-slate-500">Total</p>
          <p className="tabular text-2xl leading-7 font-bold text-navy-900">{peso(total)}</p>
        </div>
        <Button variant="cta" className="min-w-0 flex-1 text-[17px]" onClick={props.onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}

function SlotSkeleton() {
  return (
    <div className="mt-3 flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-[var(--radius-control)] bg-ice-100" />
      ))}
    </div>
  );
}

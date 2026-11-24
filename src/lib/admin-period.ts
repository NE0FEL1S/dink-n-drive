import { addDays, daysBetween } from "@/lib/booking-time";
import type { Database } from "@/types/database";

/**
 * Admin date filters (SPEC §9): Today · This week · This month · Custom range, by play date
 * (Asia/Manila). Kept in the URL (?period=week, or ?period=custom&from=…&to=…) so a filtered
 * view can be reloaded or shared, and the exports can use the same filter.
 */
export type PeriodKey = "today" | "week" | "month" | "custom";

export type Period = {
  key: PeriodKey;
  /** First play date, "YYYY-MM-DD" (Manila). */
  from: string;
  /** Last play date, inclusive. */
  to: string;
  /** "Tue, Nov 24" · "Nov 23 – 29, 2026" · "November 2026" */
  label: string;
};

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom range" },
];

/** Longest custom range, so one request can't ask for every booking ever. */
export const MAX_RANGE_DAYS = 366;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isDay(s: string | undefined): s is string {
  return !!s && DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
}

function parts(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay() };
}

/** "Nov 24, 2026" style ranges, without repeating the month or year when they're the same. */
export function rangeText(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (from === to) return `${WEEKDAYS[a.wd]}, ${MONTHS[a.m]} ${a.d}, ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${MONTHS[a.m]} ${a.d} – ${b.d}, ${a.y}`;
  if (a.y === b.y) return `${MONTHS[a.m]} ${a.d} – ${MONTHS[b.m]} ${b.d}, ${a.y}`;
  return `${MONTHS[a.m]} ${a.d}, ${a.y} – ${MONTHS[b.m]} ${b.d}, ${b.y}`;
}

function preset(key: Exclude<PeriodKey, "custom">, today: string): Period {
  const t = parts(today);
  if (key === "today") return { key, from: today, to: today, label: rangeText(today, today) };
  if (key === "week") {
    const from = addDays(today, -((t.wd + 6) % 7)); // Monday
    const to = addDays(from, 6); // Sunday
    return { key, from, to, label: rangeText(from, to) };
  }
  const from = `${today.slice(0, 7)}-01`;
  const to = addDays(`${new Date(Date.UTC(t.y, t.m + 1, 1)).toISOString().slice(0, 10)}`, -1);
  return { key, from, to, label: `${MONTHS_LONG[t.m]} ${t.y}` };
}

type Params = { period?: string; from?: string; to?: string };

/** Reads the period from search params; anything missing or invalid falls back to `fallback`. */
export function resolvePeriod(params: Params, today: string, fallback: Exclude<PeriodKey, "custom">): Period {
  const key = params.period;
  if (key === "today" || key === "week" || key === "month") return preset(key, today);
  if (key === "custom" && isDay(params.from) && isDay(params.to)) {
    let [from, to] = [params.from, params.to];
    if (from > to) [from, to] = [to, from];
    if (daysBetween(from, to) >= MAX_RANGE_DAYS) to = addDays(from, MAX_RANGE_DAYS - 1);
    return { key: "custom", from, to, label: rangeText(from, to) };
  }
  return preset(fallback, today);
}

/** Search params that reproduce this period. */
export function periodParams(p: Period): Record<string, string> {
  return p.key === "custom" ? { period: "custom", from: p.from, to: p.to } : { period: p.key };
}

/** Single search-param value (Next gives string | string[] | undefined). */
export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Bookings status filter: everything, everything but owner blocks, or one status. */
export type StatusFilter = "all" | "no_blocks" | Database["public"]["Enums"]["booking_status"];

import { addDays, dayLabel, dayParts } from "@/lib/booking-time";

/**
 * Overview earnings chart (SPEC §9 "Chart: earnings per day for the selected period"), fed
 * by admin_daily_earnings. Up to MAX_DAILY_BARS days are one bar per day; longer custom
 * ranges are grouped by week (Monday–Sunday) so the bars stay readable on a phone.
 */

export const MAX_DAILY_BARS = 62;

export type DailyEarnings = { day: string; earnings: number; bookings: number; hours: number };

export type ChartPoint = {
  key: string;
  /** Short x-axis label: "24", "Mon", "Nov 23". */
  axis: string;
  /** Full label for the tooltip and the table: "Tue, Nov 24" or "Nov 23 – 29". */
  title: string;
  earnings: number;
  bookings: number;
  hours: number;
};

export type ChartData = { unit: "day" | "week"; points: ChartPoint[]; max: number; total: number };

function weekStart(day: string): string {
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((wd + 6) % 7));
}

function shortDay(day: string): string {
  const p = dayParts(day);
  return `${p.month} ${p.date}`;
}

function weekTitle(from: string, to: string): string {
  const a = dayParts(from);
  const b = dayParts(to);
  return a.month === b.month ? `${a.month} ${a.date} – ${b.date}` : `${a.month} ${a.date} – ${b.month} ${b.date}`;
}

/** Turns the per-day rows into chart points (by day, or by week for long ranges). */
export function chartData(rows: DailyEarnings[]): ChartData {
  const total = rows.reduce((s, r) => s + r.earnings, 0);
  let points: ChartPoint[];
  let unit: ChartData["unit"] = "day";

  if (rows.length <= MAX_DAILY_BARS) {
    const weekView = rows.length <= 7;
    points = rows.map((r) => {
      const p = dayParts(r.day);
      return {
        key: r.day,
        axis: weekView ? p.weekday : String(p.date),
        title: dayLabel(r.day),
        earnings: r.earnings,
        bookings: r.bookings,
        hours: r.hours,
      };
    });
  } else {
    unit = "week";
    const weeks = new Map<string, ChartPoint & { last: string }>();
    for (const r of rows) {
      const k = weekStart(r.day);
      const w = weeks.get(k) ?? { key: k, axis: shortDay(k), title: "", earnings: 0, bookings: 0, hours: 0, last: r.day };
      w.earnings += r.earnings;
      w.bookings += r.bookings;
      w.hours += r.hours;
      w.last = r.day;
      weeks.set(k, w);
    }
    // the first week may start before the range: label it from the range's first day
    points = [...weeks.values()].map((w, i) => {
      const from = i === 0 ? rows[0].day : w.key;
      return { key: w.key, axis: shortDay(from), title: weekTitle(from, w.last), earnings: w.earnings, bookings: w.bookings, hours: w.hours };
    });
  }

  return { unit, points, max: Math.max(0, ...points.map((p) => p.earnings)), total };
}

/** Clean y-axis steps: 1 / 2 / 2.5 / 5 × 10^n, about four of them. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

/** Axis money: full under ₱10,000 ("₱2,500"), compact from there ("₱10K", "₱1.5M"). */
export function axisPeso(value: number, top: number): string {
  if (value === 0 || top < 10_000) return `₱${value.toLocaleString("en-PH")}`;
  if (value >= 1_000_000) return `₱${+(value / 1_000_000).toFixed(1)}M`;
  return `₱${+(value / 1000).toFixed(1)}K`;
}

/**
 * Booking time helpers. Asia/Manila is UTC+8 all year (no DST), so Manila wall-clock
 * times are plain offsets from UTC. Days are "YYYY-MM-DD" strings in Manila time;
 * hours are 0–24 (24 = midnight at the end of the day). Safe on server and client.
 */

const HOUR = 3_600_000;
const OFFSET = 8 * HOUR;

/** The current time in ms. Server components call this after `connection()`, so it runs per request. */
export function nowMs(): number {
  return Date.now();
}

/** Manila calendar day for a moment, e.g. "2026-11-28". */
export function manilaDay(ms: number): string {
  return new Date(ms + OFFSET).toISOString().slice(0, 10);
}

/** day + n days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / (24 * HOUR));
}

/** UTC milliseconds of Manila `day` at `hour` (hour 24 = next midnight). */
export function slotStartMs(day: string, hour: number): number {
  return Date.parse(`${day}T00:00:00Z`) - OFFSET + hour * HOUR;
}

/** ISO timestamp (UTC) of that slot, as sent to create_booking. */
export function slotStartIso(day: string, hour: number): string {
  return new Date(slotStartMs(day, hour)).toISOString();
}

/** Hours (open..close-1) of `day` that overlap any taken range. */
export function takenHoursOf(
  day: string,
  ranges: { start_at: string; end_at: string }[],
  openHour: number,
  closeHour: number,
): number[] {
  const spans = ranges.map((r) => [Date.parse(r.start_at), Date.parse(r.end_at)] as const);
  const taken: number[] = [];
  for (let h = openHour; h < closeHour; h++) {
    const s = slotStartMs(day, h);
    if (spans.some(([a, b]) => a < s + HOUR && b > s)) taken.push(h);
  }
  return taken;
}

/** 8 → "8:00", 13 → "1:00", 24 → "12:00". */
function clock(hour: number): string {
  const h = hour % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:00`;
}
function meridiem(hour: number): "AM" | "PM" {
  return hour % 24 < 12 ? "AM" : "PM";
}

/** 8 → "8:00 AM", 24 → "12:00 AM". */
export function timeLabel(hour: number): string {
  return `${clock(hour)} ${meridiem(hour)}`;
}

/** "8:00 – 11:00 AM", or "11:00 AM – 1:00 PM" when the range crosses noon/midnight. */
export function rangeLabel(start: number, end: number): string {
  return meridiem(start) === meridiem(end)
    ? `${clock(start)} – ${clock(end)} ${meridiem(end)}`
    : `${timeLabel(start)} – ${timeLabel(end)}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayParts(day: string): { weekday: string; date: number; month: string } {
  const d = new Date(`${day}T00:00:00Z`);
  return { weekday: WEEKDAYS[d.getUTCDay()], date: d.getUTCDate(), month: MONTHS[d.getUTCMonth()] };
}

/** "Sat, Nov 28" */
export function dayLabel(day: string): string {
  const p = dayParts(day);
  return `${p.weekday}, ${p.month} ${p.date}`;
}

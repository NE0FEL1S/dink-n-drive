/** Whole pesos → "₱1,250". */
export function peso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH")}`;
}

/** Hour of day (0–24, 24 = midnight) → "8 AM", "12 PM", "12 AM" (non-breaking space, so "8 AM" never wraps). */
export function hourLabel(hour: number): string {
  const h = hour % 24;
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n} ${h < 12 ? "AM" : "PM"}`;
}

/** Like hourLabel, but says "midnight" / "noon" for 24/0 and 12 (for running text). */
export function hourWords(hour: number): string {
  if (hour % 24 === 0) return "midnight";
  if (hour === 12) return "noon";
  return hourLabel(hour);
}

/** Current hour in Asia/Manila (UTC+8, no DST). */
export function manilaHour(now: Date = new Date()): number {
  return new Date(now.getTime() + 8 * 3_600_000).getUTCHours();
}

/** A moment as "Nov 24, 3:41 PM" in Manila time. */
export function manilaDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}

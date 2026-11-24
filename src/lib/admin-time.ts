import { addDays, manilaDay } from "./booking-time";

/** "today, 3:42 PM" · "yesterday, 9:10 PM" · "Nov 27, 3:42 PM" (Manila time). */
export function sentLabel(ms: number, now: number): string {
  const time = new Date(ms).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  const day = manilaDay(ms);
  const today = manilaDay(now);
  if (day === today) return `today, ${time}`;
  if (day === addDays(today, -1)) return `yesterday, ${time}`;
  const date = new Date(ms).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
  return `${date}, ${time}`;
}

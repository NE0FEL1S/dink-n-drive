import { createHash, randomBytes } from "node:crypto";
import { addDays, manilaDay, slotStartIso } from "../../src/lib/booking-time";
import { admin, runId, testEmail, testPhone } from "./admin";

/**
 * A far-ahead Manila day with no bookings or blocks at all, for a test that books hours.
 *
 * The suite shares one database with other runs (CI on staging, someone running it
 * locally), so fixed test days collide ("slot_taken"). Each test walks the booking window
 * in its own order (seeded by run + project + label) and takes the first empty day. The
 * claim is atomic: it books the day's last hour as a tagged placeholder, and if another test
 * got there first the database answers slot_taken and we move on. Tests must not use that
 * last hour (11 PM with the default hours).
 */
export async function freeTestDay(project: string, label: string, minOffset = 6): Promise<string> {
  const { data: s } = await admin().from("settings").select("max_advance_days, close_hour").single();
  const max = s?.max_advance_days ?? 30;
  const lastHour = (s?.close_hour ?? 24) - 1;
  const today = manilaDay(Date.now());
  const offsets = Array.from({ length: max - minOffset + 1 }, (_, i) => minOffset + i);

  const seed = createHash("sha256").update(`${runId()}:${project}:${label}`).digest();
  offsets.sort((a, b) => seed[a % 32] - seed[b % 32] || a - b);
  // rotate by the seed too, so two runs with similar hashes still start in different places
  const start = seed[31] % offsets.length;
  const order = [...offsets.slice(start), ...offsets.slice(0, start)];

  for (const offset of order) {
    const day = addDays(today, offset);
    const { data, error } = await admin().rpc("get_availability", { p_day: day });
    if (error) throw new Error(`get_availability: ${error.message}`);
    if (data?.length) continue;

    const claim = await admin().rpc("create_booking", {
      p_start_at: slotStartIso(day, lastHour),
      p_hours: 1,
      p_paddles: false,
      p_name: "E2E day claim",
      p_email: testEmail(`claim-${label}`),
      p_phone: `+63${testPhone().slice(1)}`,
      p_guest_token: randomBytes(32).toString("base64url"),
    });
    if (!claim.error) return day;
    if (claim.error.message !== "slot_taken") throw new Error(`claim day: ${claim.error.message}`);
  }
  throw new Error("No empty day left in the booking window for this test.");
}

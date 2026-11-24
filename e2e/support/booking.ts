import { createHash, randomBytes } from "node:crypto";
import { addDays, manilaDay, slotStartIso } from "../../src/lib/booking-time";
import { admin, runId, testBlockNote, testEmail, testPhone } from "./admin";

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

/** A 1×1 PNG, enough for a "GCash receipt" in tests. */
export const RECEIPT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

type BookingStatus = "pending_payment" | "pending_review" | "confirmed" | "rejected" | "expired" | "cancelled";

const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * Inserts a tagged guest booking directly (secret key, so no booking-window or opening
 * rules), priced from the live settings like create_booking() would. For admin tests,
 * which may use days far outside the customer booking window. The exclusion constraint
 * still rejects overlaps (Postgres error 23P01).
 */
export async function insertTestBooking(opts: {
  day: string;
  hour: number;
  label: string;
  hours?: number;
  paddles?: boolean;
  status?: BookingStatus;
}) {
  const { day, hour, label, hours = 1, paddles = false, status = "confirmed" } = opts;
  const { data: s, error: settingsError } = await admin().from("settings").select("hourly_rate, paddle_fee, cancel_fee").single();
  if (settingsError) throw new Error(`settings: ${settingsError.message}`);
  const courtFee = s.hourly_rate * hours;
  const paddleFee = paddles ? s.paddle_fee : 0;

  const email = testEmail(label);
  const phone = testPhone();
  for (let attempt = 0; ; attempt++) {
    const ref = "DND-" + Array.from(randomBytes(5), (b) => REF_ALPHABET[b % 32]).join("");
    const { data, error } = await admin()
      .from("bookings")
      .insert({
        ref_code: ref,
        kind: "customer",
        guest_token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
        contact_name: `E2E ${label}`,
        contact_email: email,
        contact_phone: `+63${phone.slice(1)}`,
        start_at: slotStartIso(day, hour),
        end_at: slotStartIso(day, hour + hours),
        hours,
        paddle_rented: paddles,
        hourly_rate: s.hourly_rate,
        court_fee: courtFee,
        paddle_fee: paddleFee,
        cancel_fee: s.cancel_fee,
        total: courtFee + paddleFee,
        status,
        hold_expires_at: status === "pending_payment" ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
        cancelled_by: status === "cancelled" ? "customer" : null,
        cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
      })
      .select("id, ref_code, total")
      .single();
    if (!error) return { id: data.id, ref: data.ref_code, total: data.total, email, phone };
    if (error.code === "23505" && attempt < 4) continue; // ref collision
    throw Object.assign(new Error(`insert booking: ${error.message}`), { code: error.code });
  }
}

/**
 * An empty Manila day for an admin test, 60–360 days ahead: beyond the customer booking
 * window, so admin tests never use up the days the booking tests need (freeTestDay).
 * Claimed atomically the same way: a tagged booking on the day's last hour, which tests
 * must leave alone.
 */
export async function freeAdminDay(project: string, label: string): Promise<string> {
  const { data: s } = await admin().from("settings").select("close_hour").single();
  const lastHour = (s?.close_hour ?? 24) - 1;
  const today = manilaDay(Date.now());
  const seed = createHash("sha256").update(`admin:${runId()}:${project}:${label}`).digest();
  const first = 60 + (seed.readUInt16BE(0) % 300);

  for (let i = 0; i < 300; i++) {
    const day = addDays(today, 60 + ((first - 60 + i) % 300));
    const { data, error } = await admin().rpc("get_availability", { p_day: day });
    if (error) throw new Error(`get_availability: ${error.message}`);
    if (data?.length) continue;
    try {
      await insertTestBooking({ day, hour: lastHour, label: `claim-${label}` });
      return day;
    } catch (e) {
      if ((e as { code?: string }).code !== "23P01") throw e; // someone else claimed it first
    }
  }
  throw new Error("No empty admin test day found.");
}

/**
 * A tagged guest booking whose GCash receipt was "sent" (what submit_payment_proof does):
 * pending_review, with a receipt in payment-proofs. Cleanup removes the booking and the file.
 */
export async function pendingReviewBooking(day: string, hour: number, label: string, { hours = 1, paddles = false } = {}) {
  const b = await insertTestBooking({ day, hour, label, hours, paddles, status: "pending_review" });
  const path = `${b.id}/receipt.png`;
  const upload = await admin().storage.from("payment-proofs").upload(path, RECEIPT_PNG, { contentType: "image/png" });
  if (upload.error) throw new Error(`upload receipt: ${upload.error.message}`);
  const { error } = await admin()
    .from("bookings")
    .update({ payment_proof_path: path, payment_submitted_at: new Date().toISOString() })
    .eq("id", b.id);
  if (error) throw new Error(`receipt path: ${error.message}`);
  return b;
}

/** A tagged owner block (cleanup deletes it by its note). Returns its id and reference. */
export async function insertTestBlock(day: string, hour: number, hours: number, label: string) {
  for (let attempt = 0; ; attempt++) {
    const ref = "DND-" + Array.from(randomBytes(5), (b) => REF_ALPHABET[b % 32]).join("");
    const { data, error } = await admin()
      .from("bookings")
      .insert({
        ref_code: ref,
        kind: "block",
        status: "blocked",
        start_at: slotStartIso(day, hour),
        end_at: slotStartIso(day, hour + hours),
        hours,
        block_note: testBlockNote(label),
      })
      .select("id, ref_code")
      .single();
    if (!error) return { id: data.id, ref: data.ref_code };
    if (error.code === "23505" && attempt < 4) continue;
    throw Object.assign(new Error(`insert block: ${error.message}`), { code: error.code });
  }
}

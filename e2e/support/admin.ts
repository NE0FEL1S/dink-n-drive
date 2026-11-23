import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database";
import { loadTestEnv, requireEnv } from "./env";

/**
 * Test-data helpers. They use the Supabase secret key, so they only ever run in
 * the test runner (never in the app). Everything they create is tagged
 * `e2e+<run>-…@dinkndrive.test`, and cleanup only touches tagged data.
 */

loadTestEnv();

export const TEST_EMAIL_DOMAIN = "dinkndrive.test";
export const TEST_PASSWORD = "e2e-Passw0rd!";

const TAG_PATTERN = new RegExp(`^e2e\\+[a-z0-9-]+@${TEST_EMAIL_DOMAIN.replace(".", "\\.")}$`);

let client: SupabaseClient<Database> | undefined;

export function admin(): SupabaseClient<Database> {
  client ??= createClient<Database>(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

export function runId(): string {
  return requireEnv("E2E_RUN_ID");
}

/** A unique tagged email for this run, e.g. `e2e+lq3k9a1f2-signup-x8k2@dinkndrive.test`. */
export function testEmail(label: string): string {
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
  return `e2e+${runId()}-${safe}-${randomBytes(2).toString("hex")}@${TEST_EMAIL_DOMAIN}`;
}

/** A random valid PH mobile number in the local format the forms expect (09XXXXXXXXX). */
export function testPhone(): string {
  const digits = Array.from(randomBytes(9), (b) => b % 10).join("");
  return `09${digits}`;
}

export type TestUser = { id: string; email: string; password: string; fullName: string; phone: string | null };

/**
 * Creates a confirmed account through the admin API.
 * `complete: true` also fills the profile (name + phone) so sign-in skips the welcome step.
 */
export async function createTestUser(label: string, { complete = true } = {}): Promise<TestUser> {
  const email = testEmail(label);
  const fullName = `E2E ${label}`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(`createTestUser(${label}): ${error?.message}`);

  let phone: string | null = null;
  if (complete) {
    phone = testPhone();
    const { error: profileError } = await admin()
      .from("profiles")
      .update({ full_name: fullName, phone: `+63${phone.slice(1)}` })
      .eq("id", data.user.id);
    if (profileError) throw new Error(`createTestUser(${label}) profile: ${profileError.message}`);
  }
  return { id: data.user.id, email, password: TEST_PASSWORD, fullName, phone };
}

/**
 * Deletes tagged test data:
 * - `scope: "run"`   → everything from this run (global teardown)
 * - `scope: "stale"` → leftovers from crashed runs older than an hour (global setup),
 *                      so a run happening at the same time is left alone.
 * Deleting a user cascades to their profile and account bookings; guest bookings
 * have no user, so they are found by their tagged contact email.
 */
export async function cleanupTestData(scope: "run" | "stale"): Promise<{ users: number; bookings: number; files: number }> {
  const prefix = `e2e+${runId()}-`;
  const staleBefore = Date.now() - 60 * 60 * 1000;
  const matches = (email: string | null | undefined, createdAt: string) =>
    !!email &&
    TAG_PATTERN.test(email) &&
    (scope === "run" ? email.startsWith(prefix) : new Date(createdAt).getTime() < staleBefore);

  // 1. Bookings (account and guest) with a tagged contact email, plus their stored files.
  const { data: bookings, error: bookingsError } = await admin()
    .from("bookings")
    .select("id, contact_email, created_at, payment_proof_path, refunds(refund_proof_path)")
    .like("contact_email", `e2e+%@${TEST_EMAIL_DOMAIN}`);
  if (bookingsError) throw new Error(`cleanup bookings: ${bookingsError.message}`);
  const doomed = (bookings ?? []).filter((b) => matches(b.contact_email, b.created_at));

  const paymentFiles = doomed.map((b) => b.payment_proof_path).filter((p): p is string => !!p);
  const refundFiles = doomed.flatMap((b) => b.refunds.map((r) => r.refund_proof_path)).filter((p): p is string => !!p);
  if (paymentFiles.length) await admin().storage.from("payment-proofs").remove(paymentFiles);
  if (refundFiles.length) await admin().storage.from("refund-proofs").remove(refundFiles);
  if (doomed.length) {
    const { error } = await admin()
      .from("bookings")
      .delete()
      .in("id", doomed.map((b) => b.id));
    if (error) throw new Error(`cleanup delete bookings: ${error.message}`);
  }

  // 2. Users. Collect every page first (deleting while paging would shift the pages).
  const userIds: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`cleanup list users: ${error.message}`);
    for (const user of data.users) if (matches(user.email, user.created_at)) userIds.push(user.id);
    if (data.users.length < 1000) break;
  }
  for (const id of userIds) {
    const { error } = await admin().auth.admin.deleteUser(id);
    if (error) throw new Error(`cleanup delete user ${id}: ${error.message}`);
  }

  return { users: userIds.length, bookings: doomed.length, files: paymentFiles.length + refundFiles.length };
}

import { randomBytes } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { manilaDay } from "../../src/lib/booking-time";
import { peso } from "../../src/lib/format";
import { admin, createTestUser } from "../support/admin";
import { freeAdminDay, insertTestBooking, RECEIPT_PNG } from "../support/booking";
import { signIn } from "../support/ui";

/**
 * Customer cancellation of paid bookings (SPEC §6), from My Bookings. The owner's side is
 * played with direct database updates that match what the owner functions do (those are
 * covered by supabase/checks/refund_checks.sql; the Refunds tab gets its own tests).
 */

const HOUR = 3_600_000;

async function becomeGuest(context: BrowserContext, baseURL: string) {
  const token = randomBytes(32).toString("base64url");
  await context.addCookies([{ name: "dnd_device", value: token, url: baseURL, httpOnly: true }]);
  return token;
}

const card = (page: Page, ref: string) => page.getByRole("article", { name: `Booking ${ref}` }).filter({ visible: true });
const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name }).filter({ visible: true });
const cancelSheet = (page: Page) => page.getByRole("dialog", { name: "Cancel this booking?" });

async function settings() {
  const { data, error } = await admin().from("settings").select("cancel_fee, cancel_cutoff_hours").single();
  if (error) throw new Error(`settings: ${error.message}`);
  return data;
}

/** What admin_decline_cancellation does. */
async function ownerDeclines(bookingId: string, reason: string) {
  const { error } = await admin()
    .from("refunds")
    .update({ status: "declined", decline_reason: reason, decided_at: new Date().toISOString(), gcash_number: null })
    .eq("booking_id", bookingId)
    .eq("status", "requested");
  if (error) throw new Error(`decline refund: ${error.message}`);
  const { error: e2 } = await admin().from("bookings").update({ status: "confirmed", status_before_request: null }).eq("id", bookingId);
  if (e2) throw new Error(`decline booking: ${e2.message}`);
}

/** What admin_approve_cancellation does (payment already confirmed). */
async function ownerApproves(bookingId: string) {
  const now = new Date().toISOString();
  const { error } = await admin()
    .from("bookings")
    .update({ status: "cancelled", cancelled_by: "customer", cancelled_at: now, status_before_request: null })
    .eq("id", bookingId);
  if (error) throw new Error(`approve booking: ${error.message}`);
  const { error: e2 } = await admin().from("refunds").update({ status: "approved", decided_at: now }).eq("booking_id", bookingId).eq("status", "requested");
  if (e2) throw new Error(`approve refund: ${e2.message}`);
}

/** What the owner does after sending the GCash refund: screenshot + admin_complete_refund. */
async function ownerCompletes(bookingId: string) {
  const path = `${bookingId}/refund.png`;
  const upload = await admin().storage.from("refund-proofs").upload(path, RECEIPT_PNG, { contentType: "image/png" });
  if (upload.error) throw new Error(`upload refund proof: ${upload.error.message}`);
  const { error } = await admin()
    .from("refunds")
    .update({ status: "completed", refund_proof_path: path, completed_at: new Date().toISOString(), gcash_number: null })
    .eq("booking_id", bookingId)
    .eq("status", "approved");
  if (error) throw new Error(`complete refund: ${error.message}`);
}

test.describe("cancel a paid booking", () => {
  test("guest: request → declined → request again → approved → refunded with screenshot", async ({ page, context, baseURL }, info) => {
    const token = await becomeGuest(context, baseURL!);
    const { cancel_fee } = await settings();
    const day = await freeAdminDay(info.project.name, "cancel-guest");
    const b = await insertTestBooking({ day, hour: 9, hours: 2, paddles: true, label: "cancel-guest", guestToken: token });
    const refund = Math.max(b.total - cancel_fee, 0);

    await page.goto("/my-bookings");
    await expect(card(page, b.ref)).toContainText("Confirmed");
    await card(page, b.ref).getByRole("button", { name: "Cancel booking" }).click();

    const sheet = cancelSheet(page);
    await expect(sheet.getByText("You paid")).toBeVisible();
    await expect(sheet).toContainText(peso(b.total));
    await expect(sheet).toContainText(`Refund to your GCash${peso(refund)}`);
    // prefilled from the booking's contact details
    await expect(sheet.getByLabel("GCash account name")).toHaveValue(`E2E cancel-guest`);
    await expect(sheet.getByLabel("GCash number")).toHaveValue(b.phone);

    // a bad number is caught before anything is sent
    await sheet.getByLabel("GCash number").fill("12345");
    await sheet.getByRole("button", { name: "Send cancellation request" }).click();
    await expect(sheet.getByText("Use an 11-digit PH mobile number")).toBeVisible();

    await sheet.getByLabel("GCash account name").fill("Juan Dela Cruz");
    await sheet.getByLabel("GCash number").fill("0917 123 4567");
    await sheet.getByRole("button", { name: "Send cancellation request" }).click();
    await expect(sheet).toBeHidden();
    await expect(card(page, b.ref)).toContainText("Cancellation requested");
    await expect(card(page, b.ref)).toContainText(peso(refund));
    await expect(card(page, b.ref)).toContainText("Juan Dela Cruz, 0917 ••• 4567");
    await expect(card(page, b.ref).getByRole("button", { name: "Cancel booking" })).toHaveCount(0);

    const { data: requested } = await admin().from("refunds").select("status, refund_amount, cancel_fee, gcash_name, gcash_number").eq("booking_id", b.id).single();
    expect(requested).toEqual({ status: "requested", refund_amount: refund, cancel_fee, gcash_name: "Juan Dela Cruz", gcash_number: "+639171234567" });

    // the owner declines: back to confirmed, reason shown, can ask again
    await ownerDeclines(b.id, "Tournament day, no cancellations.");
    await page.reload();
    await expect(card(page, b.ref)).toContainText("Confirmed");
    await expect(card(page, b.ref)).toContainText("Cancellation request declined. Tournament day, no cancellations.");
    await card(page, b.ref).getByRole("button", { name: "Cancel booking" }).click();
    await expect(sheet.getByLabel("GCash account name")).toHaveValue("Juan Dela Cruz"); // from the last request
    await sheet.getByLabel("GCash number").fill("09171234567");
    await sheet.getByRole("button", { name: "Send cancellation request" }).click();
    await expect(card(page, b.ref)).toContainText("Cancellation requested");

    // approved: the booking moves to Past, refund on its way
    await ownerApproves(b.id);
    await page.reload();
    await tab(page, /^Past/).click();
    await expect(card(page, b.ref)).toContainText("Cancelled");
    await expect(card(page, b.ref)).toContainText(`You cancelled this booking. Refund of ${peso(refund)} approved.`);

    // refunded: amount, kept fee and the owner's screenshot
    await ownerCompletes(b.id);
    await page.reload();
    await tab(page, /^Past/).click();
    await expect(card(page, b.ref)).toContainText(`Refunded ${peso(refund)}`);
    await expect(card(page, b.ref)).toContainText(`The ${peso(cancel_fee)} cancellation fee was kept.`);
    await card(page, b.ref).getByRole("button", { name: "View refund screenshot" }).click();
    const img = page.getByRole("dialog", { name: "Refund screenshot" }).getByRole("img", { name: "GCash refund screenshot from the court owner" });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  });

  test("signed in: requests a cancellation for an account booking", async ({ page }, info) => {
    const user = await createTestUser(`cancel-acct-${info.project.name}`);
    const { cancel_fee } = await settings();
    const day = await freeAdminDay(info.project.name, "cancel-account");
    const b = await insertTestBooking({ day, hour: 14, label: `cancel-acct-${info.project.name}` });
    await admin().from("bookings").update({ user_id: user.id, guest_token_hash: null }).eq("id", b.id);

    await signIn(page, user, "/my-bookings");
    await card(page, b.ref).getByRole("button", { name: "Cancel booking" }).click();
    const sheet = cancelSheet(page);
    await sheet.getByLabel("GCash account name").fill(user.fullName);
    await sheet.getByLabel("GCash number").fill(user.phone!);
    await sheet.getByRole("button", { name: "Send cancellation request" }).click();
    await expect(card(page, b.ref)).toContainText("Cancellation requested");

    const { data } = await admin().from("refunds").select("status, refund_amount").eq("booking_id", b.id).single();
    expect(data).toEqual({ status: "requested", refund_amount: Math.max(b.total - cancel_fee, 0) });
  });

  test("inside the cutoff the button is disabled and says why", async ({ page, context, baseURL }, info) => {
    const token = await becomeGuest(context, baseURL!);
    const { cancel_cutoff_hours: cutoff } = await settings();
    test.skip(cutoff < 1, "no cutoff configured");

    // the next free whole hour that starts inside the cutoff (shared database: try a few)
    const firstStart = Math.ceil(Date.now() / HOUR) * HOUR;
    let b: Awaited<ReturnType<typeof insertTestBooking>> | undefined;
    for (let k = 0; k < cutoff && !b; k++) {
      const ms = firstStart + k * HOUR;
      if (ms - Date.now() >= cutoff * HOUR) break;
      try {
        b = await insertTestBooking({
          day: manilaDay(ms),
          hour: new Date(ms + 8 * HOUR).getUTCHours(),
          label: `cutoff-${info.project.name}`,
          guestToken: token,
        });
      } catch (e) {
        if ((e as { code?: string }).code !== "23P01") throw e; // taken: try the next hour
      }
    }
    test.skip(!b, "every hour inside the cutoff is taken right now");

    await page.goto("/my-bookings");
    const button = card(page, b!.ref).getByRole("button", { name: "Cancel booking" });
    await expect(button).toBeDisabled();
    await expect(card(page, b!.ref)).toContainText(`Cancellations close ${cutoff} ${cutoff === 1 ? "hour" : "hours"} before the game.`);
  });

  test("a booking the owner cancelled shows the full refund", async ({ page, context, baseURL }, info) => {
    const token = await becomeGuest(context, baseURL!);
    const day = await freeAdminDay(info.project.name, "owner-cancel-view");
    const b = await insertTestBooking({ day, hour: 10, label: "owner-cancel-view", guestToken: token });
    const now = new Date().toISOString();
    await admin().from("bookings").update({ status: "cancelled", cancelled_by: "owner", cancelled_at: now }).eq("id", b.id);
    const { error } = await admin()
      .from("refunds")
      .insert({ booking_id: b.id, cancel_fee: 0, refund_amount: b.total, gcash_name: "E2E Owner Cancel", gcash_number: `+63${b.phone.slice(1)}`, status: "approved", decided_at: now });
    if (error) throw new Error(`refund: ${error.message}`);

    await page.goto("/my-bookings");
    await tab(page, /^Past/).click();
    await expect(card(page, b.ref)).toContainText(`Cancelled by the court owner. Full refund of ${peso(b.total)} approved.`);
  });
});

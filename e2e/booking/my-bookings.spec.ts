import { randomBytes } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { slotStartIso } from "../../src/lib/booking-time";
import { admin, createTestUser, testEmail, testPhone } from "../support/admin";
import { freeTestDay } from "../support/booking";
import { button, signIn } from "../support/ui";

const RECEIPT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** This browser "is" a guest with this device token (the cookie the checkout would set). */
async function becomeGuest(context: BrowserContext, baseURL: string) {
  const token = randomBytes(32).toString("base64url");
  await context.addCookies([{ name: "dnd_device", value: token, url: baseURL, httpOnly: true }]);
  return token;
}

/** A guest booking for that device token, made through create_booking() (tagged for cleanup). */
async function guestBooking(token: string, day: string, hour: number) {
  const { data, error } = await admin().rpc("create_booking", {
    p_start_at: slotStartIso(day, hour),
    p_hours: 1,
    p_paddles: false,
    p_name: "E2E My Bookings",
    p_email: testEmail("mybookings"),
    p_phone: `+63${testPhone().slice(1)}`,
    p_guest_token: token,
  });
  if (error || !data?.[0]) throw new Error(`create_booking: ${error?.message}`);
  return { id: data[0].booking_id, ref: data[0].ref_code };
}

const card = (page: Page, ref: string) => page.getByRole("article", { name: `Booking ${ref}` }).filter({ visible: true });
const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name }).filter({ visible: true });

test.describe("my bookings", () => {
  test("guest: sees this browser's bookings, cancels one, pays another", async ({ page, context, browser, baseURL }, info) => {
    const token = await becomeGuest(context, baseURL!);
    const day = await freeTestDay(info.project.name, "my-bookings-guest");
    const toCancel = await guestBooking(token, day, 9);
    const toPay = await guestBooking(token, day, 11);
    const expired = await guestBooking(token, day, 13);
    await admin().from("bookings").update({ hold_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", expired.id);

    await page.goto("/my-bookings");
    await expect(tab(page, /^Upcoming \(2\)$/)).toBeVisible();
    await expect(page.getByText("These are the bookings made on")).toBeVisible();
    await expect(card(page, toCancel.ref)).toContainText("Pending payment");
    await expect(card(page, toCancel.ref)).toContainText(/Pay within \d+:\d\d/);

    // cancel an unpaid booking: free and instant
    await card(page, toCancel.ref).getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("dialog", { name: "Cancel this booking?" }).getByRole("button", { name: "Yes, cancel booking" }).click();
    await expect(tab(page, /^Upcoming \(1\)$/)).toBeVisible();
    const { data: cancelled } = await admin().from("bookings").select("status, cancelled_by").eq("id", toCancel.id).single();
    expect(cancelled).toEqual({ status: "cancelled", cancelled_by: "customer" });

    // pay from My bookings
    await card(page, toPay.ref).getByRole("button", { name: "Pay now" }).click();
    const sheet = page.getByRole("dialog", { name: `Pay for ${toPay.ref}` });
    await expect(sheet.getByRole("img", { name: /GCash QR code/ })).toBeVisible();
    await sheet.locator("#proof-file").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: RECEIPT_PNG });
    await sheet.getByRole("button", { name: "Send payment proof" }).click();
    await expect(page.getByRole("dialog", { name: "Thank you!" }).getByText("Payment sent for review")).toBeVisible();
    await page.getByRole("dialog", { name: "Thank you!" }).getByRole("button", { name: "Close" }).click();
    await expect(card(page, toPay.ref)).toContainText("Pending review");

    // past: the expired hold and the cancelled booking
    await tab(page, /^Past/).click();
    await expect(card(page, expired.ref)).toContainText("Expired");
    await expect(card(page, toCancel.ref)).toContainText("Cancelled");

    // another browser (no device cookie) sees none of it
    const other = await browser.newPage();
    await other.goto(new URL("/my-bookings", baseURL).toString());
    await expect(other.getByRole("tab", { name: /^Upcoming \(0\)$/ })).toBeVisible();
    await expect(other.getByText("No upcoming games.")).toBeVisible();
    await other.close();
  });

  test("signing in moves this browser's guest bookings to the account", async ({ page, context, baseURL }, info) => {
    const token = await becomeGuest(context, baseURL!);
    const day = await freeTestDay(info.project.name, "my-bookings-claim");
    const booking = await guestBooking(token, day, 15);
    const user = await createTestUser(`claim-${info.project.name}`);

    await signIn(page, user, "/my-bookings");
    await expect(card(page, booking.ref)).toBeVisible();
    await expect(page.getByText("These are the bookings made on")).toHaveCount(0);

    const { data } = await admin().from("bookings").select("user_id, guest_token_hash").eq("id", booking.id).single();
    expect(data).toEqual({ user_id: user.id, guest_token_hash: null });
  });

  test("the Book button on an empty list opens the booking popup", async ({ page }) => {
    await page.goto("/my-bookings");
    await expect(page.getByText("No upcoming games.")).toBeVisible();
    await page.getByRole("link", { name: "Book the court" }).filter({ visible: true }).click();
    await expect(page.getByRole("dialog", { name: "Book the court" })).toBeVisible();
    await expect(button(page, "Close")).toBeVisible();
  });
});

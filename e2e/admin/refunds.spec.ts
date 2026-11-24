import { expect, test, type Page } from "@playwright/test";
import { peso } from "../../src/lib/format";
import { admin, createTestOwner } from "../support/admin";
import { freeAdminDay, insertTestBooking, pendingReviewBooking, RECEIPT_PNG } from "../support/booking";
import { expectNoHorizontalScroll, heading, signIn } from "../support/ui";

/** Other runs share the database, so always look at this test's own card. */
const requestCard = (page: Page, ref: string) => page.getByRole("article", { name: `Request ${ref}` }).filter({ visible: true });
const refundCard = (page: Page, ref: string) => page.getByRole("article", { name: `Refund ${ref}` }).filter({ visible: true });
const view = (page: Page, name: RegExp) => page.getByRole("navigation", { name: "Refunds" }).filter({ visible: true }).getByRole("link", { name });
const sheet = (page: Page) => page.getByRole("dialog").filter({ visible: true });
const toast = (page: Page, text: string) => page.getByText(text).filter({ visible: true });

/** What request_cancellation() does for the customer: booking → cancel_requested, refund requested. */
async function openRequest(b: { id: string; total: number }, gcash = { name: "Juan Dela Cruz", number: "+639171234567" }) {
  const { data: booking } = await admin().from("bookings").select("status, cancel_fee").eq("id", b.id).single();
  if (!booking) throw new Error("booking not found");
  const { error } = await admin()
    .from("bookings")
    .update({ status: "cancel_requested", status_before_request: booking.status })
    .eq("id", b.id);
  if (error) throw new Error(`request booking: ${error.message}`);
  const { data, error: e2 } = await admin()
    .from("refunds")
    .insert({
      booking_id: b.id,
      cancel_fee: booking.cancel_fee,
      refund_amount: Math.max(b.total - booking.cancel_fee, 0),
      gcash_name: gcash.name,
      gcash_number: gcash.number,
      status: "requested",
    })
    .select("id, refund_amount, cancel_fee")
    .single();
  if (e2) throw new Error(`request refund: ${e2.message}`);
  return data;
}

async function refundRow(bookingId: string) {
  const { data, error } = await admin()
    .from("refunds")
    .select("status, decided_by, decline_reason, gcash_number, refund_proof_path, completed_by")
    .eq("booking_id", bookingId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function bookingStatus(id: string) {
  const { data } = await admin().from("bookings").select("status, cancelled_by, status_before_request").eq("id", id).single();
  return data;
}

test.describe("admin refunds", () => {
  test("owner approves a request, sends the refund and uploads the screenshot", async ({ page }, info) => {
    const owner = await createTestOwner(`refund-approve-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "refund-approve");
    const b = await insertTestBooking({ day, hour: 9, hours: 2, paddles: true, label: "refund-approve" });
    const r = await openRequest(b);

    await signIn(page, owner, "/admin/refunds");
    await expect(heading(page, "Refunds")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Admin" }).filter({ visible: true }).getByRole("link", { name: /^Refunds\s*\d+\+? to decide or send$/ })).toBeVisible();

    const req = requestCard(page, b.ref);
    await expect(req).toContainText(`Paid${peso(b.total)}`);
    await expect(req).toContainText(`Refund if approved${peso(r.refund_amount)}`);
    await expect(req).toContainText("Juan Dela Cruz");
    await expect(req).toContainText("09171234567");
    await expectNoHorizontalScroll(page);

    await req.getByRole("button", { name: "Approve" }).click();
    await expect(heading(page, `Approve cancelling ${b.ref}?`)).toBeVisible();
    await sheet(page).getByRole("button", { name: "Approve cancellation" }).click();
    await expect(toast(page, `${b.ref} cancelled. Send ${peso(r.refund_amount)} to Juan Dela Cruz's GCash`)).toBeVisible();
    await expect(requestCard(page, b.ref)).toHaveCount(0);

    expect(await bookingStatus(b.id)).toEqual({ status: "cancelled", cancelled_by: "customer", status_before_request: null });
    expect(await refundRow(b.id)).toMatchObject({ status: "approved", decided_by: owner.id });

    // To send: amount, where to, then the screenshot
    await view(page, /^To send/).click();
    const send = refundCard(page, b.ref);
    await expect(send).toContainText(`Send by GCash${peso(r.refund_amount)}`);
    await expect(send).toContainText("09171234567");
    await expect(send.getByRole("button", { name: "Copy GCash number" })).toBeVisible();

    await send.getByRole("button", { name: "Mark refunded" }).click();
    await expect(send.getByText("Add the GCash screenshot of the refund first.")).toBeVisible();
    await send.locator('input[type="file"]').setInputFiles({ name: "refund.png", mimeType: "image/png", buffer: RECEIPT_PNG });
    await expect(send.getByRole("img", { name: `Refund screenshot for ${b.ref}` })).toBeVisible();
    await send.getByRole("button", { name: "Mark refunded" }).click();
    await expect(toast(page, `${b.ref} marked refunded.`)).toBeVisible();
    await expect(refundCard(page, b.ref)).toHaveCount(0);

    const done = await refundRow(b.id);
    expect(done).toMatchObject({ status: "completed", gcash_number: null, completed_by: owner.id });
    expect(done.refund_proof_path).toMatch(new RegExp(`^${b.id}/refund-[0-9a-f]{12}\\.jpg$`));

    // History
    await view(page, /^History/).click();
    const hist = refundCard(page, b.ref);
    await expect(hist).toContainText("Refunded");
    await expect(hist).toContainText(`${peso(r.refund_amount)} sent to Juan Dela Cruz`);
    await expect(hist.getByRole("link", { name: "Refund screenshot" })).toBeVisible();
  });

  test("owner declines with a quick reason; the booking stays", async ({ page }, info) => {
    const owner = await createTestOwner(`refund-decline-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "refund-decline");
    const b = await insertTestBooking({ day, hour: 13, label: "refund-decline" });
    await openRequest(b);

    await signIn(page, owner, "/admin/refunds?view=requests");
    await requestCard(page, b.ref).getByRole("button", { name: "Decline" }).click();
    await expect(heading(page, `Decline ${b.ref}?`)).toBeVisible();
    await sheet(page).getByRole("button", { name: "Decline request" }).click();
    await expect(sheet(page).getByText("Write a short reason")).toBeVisible();
    await sheet(page).getByRole("button", { name: "Too close to game time" }).click();
    await sheet(page).getByRole("button", { name: "Decline request" }).click();
    await expect(toast(page, `${b.ref} request declined.`)).toBeVisible();
    await expect(requestCard(page, b.ref)).toHaveCount(0);

    expect(await bookingStatus(b.id)).toEqual({ status: "confirmed", cancelled_by: null, status_before_request: null });
    const row = await refundRow(b.id);
    expect(row).toMatchObject({ status: "declined", gcash_number: null, decided_by: owner.id });
    expect(row.decline_reason).toContain("too close to game time");
  });

  test("a request whose payment isn't checked waits for Payments first", async ({ page }, info) => {
    const owner = await createTestOwner(`refund-unpaid-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "refund-unchecked");
    const b = await pendingReviewBooking(day, 15, "refund-unchecked");
    await openRequest(b);

    await signIn(page, owner, "/admin/refunds?view=requests");
    await expect(requestCard(page, b.ref)).toContainText("Payment not checked yet.");
    await expect(requestCard(page, b.ref).getByRole("button", { name: "Approve" })).toBeDisabled();

    // it is in the Payments queue, marked as asked to cancel
    await requestCard(page, b.ref).getByRole("link", { name: "Payments" }).click();
    const pay = page.getByRole("article", { name: `Payment ${b.ref}` }).filter({ visible: true });
    await expect(pay).toContainText("The customer asked to cancel.");
    await pay.getByRole("button", { name: "Approve" }).click();
    await expect(toast(page, `${b.ref} payment approved. Its cancellation request is waiting in Refunds.`)).toBeVisible();
    expect(await bookingStatus(b.id)).toEqual({ status: "cancel_requested", cancelled_by: null, status_before_request: "confirmed" });

    await page.goto("/admin/refunds?view=requests");
    await expect(requestCard(page, b.ref)).not.toContainText("Payment not checked yet.");
    await expect(requestCard(page, b.ref).getByRole("button", { name: "Approve" })).toBeEnabled();
  });
});

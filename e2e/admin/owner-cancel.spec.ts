import { expect, test, type Page } from "@playwright/test";
import { peso } from "../../src/lib/format";
import { admin, createTestOwner } from "../support/admin";
import { freeAdminDay, insertTestBooking } from "../support/booking";
import { expectNoHorizontalScroll, heading, signIn } from "../support/ui";

/** Card (phones, tablets) or table row (laptops): both carry the label; only one is visible. */
const booking = (page: Page, ref: string) => page.locator(`[aria-label="Booking ${ref}"]`).filter({ visible: true });
const sheet = (page: Page) => page.getByRole("dialog").filter({ visible: true });
const dayUrl = (day: string) => `/admin/bookings?period=custom&from=${day}&to=${day}`;

async function bookingRow(id: string) {
  const { data } = await admin().from("bookings").select("status, cancelled_by").eq("id", id).single();
  return data;
}

async function refunds(bookingId: string) {
  const { data } = await admin()
    .from("refunds")
    .select("status, cancel_fee, refund_amount, gcash_name, gcash_number, decided_by")
    .eq("booking_id", bookingId);
  return data ?? [];
}

test.describe("owner cancels a booking", () => {
  test("a confirmed booking: full refund to the contact's GCash, then it waits in To send", async ({ page }, info) => {
    const owner = await createTestOwner(`ocancel-paid-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "ocancel-paid");
    const b = await insertTestBooking({ day, hour: 9, hours: 2, paddles: true, label: "ocancel-paid" });

    await signIn(page, owner, dayUrl(day));
    await booking(page, b.ref).getByRole("button", { name: "Cancel booking" }).click();
    await expect(heading(page, `Cancel ${b.ref}?`)).toBeVisible();
    await expect(sheet(page)).toContainText(peso(b.total));
    await expect(sheet(page).getByLabel("Customer's GCash name")).toHaveValue("E2E ocancel-paid");
    await expect(sheet(page).getByLabel("Customer's GCash number")).toHaveValue(b.phone);
    await expectNoHorizontalScroll(page);

    await sheet(page).getByRole("button", { name: "Cancel and refund in full" }).click();
    await expect(heading(page, `${b.ref} cancelled`)).toBeVisible();
    await expect(sheet(page)).toContainText(`Send ${peso(b.total)} by GCash`);

    expect(await bookingRow(b.id)).toEqual({ status: "cancelled", cancelled_by: "owner" });
    expect(await refunds(b.id)).toEqual([
      { status: "approved", cancel_fee: 0, refund_amount: b.total, gcash_name: "E2E ocancel-paid", gcash_number: `+63${b.phone.slice(1)}`, decided_by: owner.id },
    ]);

    await sheet(page).getByRole("link", { name: "Go to Refunds" }).click();
    await expect(page).toHaveURL(/\/admin\/refunds\?view=send$/);
    const card = page.getByRole("article", { name: `Refund ${b.ref}` }).filter({ visible: true });
    await expect(card).toContainText("Full refund: you cancelled this booking.");
    await expect(card).toContainText(peso(b.total));
  });

  test("a booking with an open request: the request becomes the full refund", async ({ page }, info) => {
    const owner = await createTestOwner(`ocancel-req-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "ocancel-request");
    const b = await insertTestBooking({ day, hour: 13, label: "ocancel-request" });
    await admin().from("bookings").update({ status: "cancel_requested", status_before_request: "confirmed" }).eq("id", b.id);
    const { data: s } = await admin().from("settings").select("cancel_fee").single();
    await admin().from("refunds").insert({
      booking_id: b.id,
      cancel_fee: s!.cancel_fee,
      refund_amount: Math.max(b.total - s!.cancel_fee, 0),
      gcash_name: "Juan Dela Cruz",
      gcash_number: "+639171234567",
      status: "requested",
    });

    await signIn(page, owner, dayUrl(day));
    await booking(page, b.ref).getByRole("button", { name: "Cancel booking" }).click();
    await expect(sheet(page).getByLabel("Customer's GCash name")).toHaveValue("Juan Dela Cruz");
    await expect(sheet(page).getByLabel("Customer's GCash number")).toHaveValue("09171234567");
    await expect(sheet(page).getByText("From the customer's cancellation request.")).toBeVisible();

    // a bad number is caught before anything changes
    await sheet(page).getByLabel("Customer's GCash number").fill("0917");
    await sheet(page).getByRole("button", { name: "Cancel and refund in full" }).click();
    await expect(sheet(page).getByText("Use an 11-digit PH mobile number")).toBeVisible();
    expect((await bookingRow(b.id))?.status).toBe("cancel_requested");

    await sheet(page).getByLabel("Customer's GCash number").fill("09171234567");
    await sheet(page).getByRole("button", { name: "Cancel and refund in full" }).click();
    await expect(heading(page, `${b.ref} cancelled`)).toBeVisible();
    expect(await refunds(b.id)).toEqual([
      { status: "approved", cancel_fee: 0, refund_amount: b.total, gcash_name: "Juan Dela Cruz", gcash_number: "+639171234567", decided_by: owner.id },
    ]);
  });

  test("an unpaid booking: cancelled with no refund, the row updates", async ({ page }, info) => {
    const owner = await createTestOwner(`ocancel-unpaid-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "ocancel-unpaid");
    const b = await insertTestBooking({ day, hour: 15, label: "ocancel-unpaid", status: "pending_payment" });

    await signIn(page, owner, dayUrl(day));
    await booking(page, b.ref).getByRole("button", { name: "Cancel booking" }).click();
    await expect(sheet(page)).toContainText("Nothing was paid yet, so there's no refund.");
    await expect(sheet(page).getByLabel("Customer's GCash number")).toHaveCount(0);
    await sheet(page).getByRole("button", { name: "Cancel booking" }).click();
    await expect(heading(page, `${b.ref} cancelled`)).toBeVisible();
    await sheet(page).getByRole("button", { name: "Done" }).click();

    await expect(booking(page, b.ref)).toContainText("Cancelled");
    await expect(booking(page, b.ref).getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
    expect(await bookingRow(b.id)).toEqual({ status: "cancelled", cancelled_by: "owner" });
    expect(await refunds(b.id)).toEqual([]);
  });
});

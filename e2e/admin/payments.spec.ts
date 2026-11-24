import { expect, test, type Page } from "@playwright/test";
import { slotStartMs } from "../../src/lib/booking-time";
import { admin, createTestOwner } from "../support/admin";
import { freeAdminDay, pendingReviewBooking } from "../support/booking";
import { button, expectNoHorizontalScroll, heading, signIn } from "../support/ui";

/** Other runs share the database, so always look at this test's own card. */
const card = (page: Page, ref: string) => page.getByRole("article", { name: `Payment ${ref}` }).filter({ visible: true });
const sheet = (page: Page) => page.getByRole("dialog").filter({ visible: true });

async function bookingRow(id: string) {
  const { data, error } = await admin().from("bookings").select("status, reviewed_by, reject_reason").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

test.describe("admin payments", () => {
  test("owner sees the receipt and approves it", async ({ page }, info) => {
    const owner = await createTestOwner(`pay-approve-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "pay-approve");
    const b = await pendingReviewBooking(day, 9, "pay-approve", { hours: 2, paddles: true });

    await signIn(page, owner, "/admin/payments");
    await expect(heading(page, "Payments")).toBeVisible();
    const c = card(page, b.ref);
    await expect(c).toContainText("₱550");
    await expect(c).toContainText("2 hours · paddles rented");
    await expect(c).toContainText("Guest");
    const receipt = c.getByRole("img", { name: `GCash receipt for ${b.ref}` });
    await expect(receipt).toBeVisible();
    await expect.poll(() => receipt.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page);

    await c.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText(`${b.ref} approved.`).filter({ visible: true })).toBeVisible();
    await expect(card(page, b.ref)).toHaveCount(0);

    const row = await bookingRow(b.id);
    expect(row.status).toBe("confirmed");
    expect(row.reviewed_by).toBe(owner.id);
  });

  test("owner rejects with a quick reason; the hours reopen", async ({ page }, info) => {
    const owner = await createTestOwner(`pay-reject-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "pay-reject");
    const b = await pendingReviewBooking(day, 13, "pay-reject");

    await signIn(page, owner, "/admin/payments");
    await card(page, b.ref).getByRole("button", { name: "Reject" }).click();
    await expect(heading(page, `Reject ${b.ref}?`)).toBeVisible();

    await button(page, "Reject payment").click();
    await expect(sheet(page).getByText("Write a short reason")).toBeVisible();

    await sheet(page).getByRole("button", { name: "Not received" }).click();
    await expect(sheet(page).getByLabel("Reason for the customer")).toHaveValue("We didn't receive this payment in GCash.");
    await button(page, "Reject payment").click();

    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByText(`${b.ref} rejected.`).filter({ visible: true })).toBeVisible();
    await expect(card(page, b.ref)).toHaveCount(0);

    const row = await bookingRow(b.id);
    expect(row.status).toBe("rejected");
    expect(row.reject_reason).toBe("We didn't receive this payment in GCash.");
    const { data: taken } = await admin().rpc("get_availability", { p_day: day });
    expect(taken?.some((r) => Date.parse(r.start_at) === slotStartMs(day, 13))).toBe(false);
  });

  test("a payment already handled elsewhere is dropped with a notice", async ({ page }, info) => {
    const owner = await createTestOwner(`pay-stale-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "pay-stale");
    const b = await pendingReviewBooking(day, 15, "pay-stale");

    await signIn(page, owner, "/admin/payments");
    await expect(card(page, b.ref)).toBeVisible();
    await admin().from("bookings").update({ status: "confirmed" }).eq("id", b.id); // another tab approved it

    await card(page, b.ref).getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("already reviewed").filter({ visible: true })).toBeVisible();
    await expect(card(page, b.ref)).toHaveCount(0);
  });
});

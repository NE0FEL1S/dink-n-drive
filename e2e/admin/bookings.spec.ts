import { expect, test, type Page } from "@playwright/test";
import { peso } from "../../src/lib/format";
import { admin, createTestOwner } from "../support/admin";
import { freeAdminDay, insertTestBlock, insertTestBooking, pendingReviewBooking } from "../support/booking";
import { expectNoHorizontalScroll, field, heading, signIn } from "../support/ui";

/** A booking shows as a card on phones and a table row from 768 px; either way it carries this label. */
const booking = (page: Page, ref: string) => page.locator(`[aria-label="Booking ${ref}"]`).filter({ visible: true });
const dayUrl = (path: string, day: string, extra = "") => `${path}?period=custom&from=${day}&to=${day}${extra}`;

test.describe("admin bookings and summary", () => {
  test("bookings for a day: every status, owner blocks, status filter and search", async ({ page }, info) => {
    const owner = await createTestOwner(`bk-table-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "bk-table"); // also adds a confirmed 11 PM claim booking
    const confirmed = await insertTestBooking({ day, hour: 8, hours: 2, paddles: true, label: "bk-confirmed" });
    const review = await pendingReviewBooking(day, 10, "bk-review");
    const rejected = await insertTestBooking({ day, hour: 11, label: "bk-rejected", status: "rejected" });
    const block = await insertTestBlock(day, 14, 2, "bk-block");

    await signIn(page, owner, dayUrl("/admin/bookings", day));
    await expect(heading(page, "Bookings")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "5 bookings" })).toBeVisible();
    await expect(booking(page, confirmed.ref)).toContainText("Confirmed");
    await expect(booking(page, confirmed.ref)).toContainText("₱550");
    await expect(booking(page, review.ref)).toContainText("Pending review");
    await expect(booking(page, review.ref).getByRole("link", { name: `Open the GCash receipt for ${review.ref}` })).toBeVisible();
    await expect(booking(page, rejected.ref)).toContainText("Rejected");
    await expect(booking(page, block.ref)).toContainText("Owner block");
    await expectNoHorizontalScroll(page);

    // status filter submits on change
    await field(page, "Status").selectOption("confirmed");
    await expect(page).toHaveURL(/status=confirmed/);
    await expect(booking(page, confirmed.ref)).toBeVisible();
    await expect(booking(page, rejected.ref)).toHaveCount(0);
    await expect(booking(page, block.ref)).toHaveCount(0);

    await field(page, "Status").selectOption("no_blocks");
    await expect(page).toHaveURL(/status=no_blocks/);
    await expect(booking(page, rejected.ref)).toBeVisible();
    await expect(booking(page, block.ref)).toHaveCount(0);

    // search by the mobile number as people type it (09…); the database stores +639…
    await field(page, "Search").fill(review.phone);
    await page.getByRole("button", { name: "Apply filters" }).filter({ visible: true }).click();
    await expect(page).toHaveURL(new RegExp(`q=${review.phone}`));
    await expect(booking(page, review.ref)).toBeVisible();
    await expect(booking(page, confirmed.ref)).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "1 booking" })).toBeVisible();
  });

  test("period chips switch the range; a custom range shows its dates", async ({ page }, info) => {
    const owner = await createTestOwner(`bk-period-${info.project.name}`);
    await signIn(page, owner, "/admin/bookings");

    const periodNav = page.getByRole("navigation", { name: "Period" }).filter({ visible: true });
    await expect(periodNav.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    await periodNav.getByRole("link", { name: "This month" }).click();
    await expect(page).toHaveURL(/period=month/);
    await expect(periodNav.getByRole("link", { name: "This month" })).toHaveAttribute("aria-current", "page");

    await periodNav.getByRole("link", { name: "Custom range" }).click();
    await expect(page).toHaveURL(/period=custom/);
    await field(page, "From").fill("2026-12-01");
    await field(page, "To").fill("2026-12-07");
    await page.getByRole("button", { name: "Apply filters" }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/from=2026-12-01&to=2026-12-07/);
    await expect(page.getByTestId("period-label").filter({ visible: true })).toHaveText("Dec 1 – 7, 2026");
    await expectNoHorizontalScroll(page);
  });

  test("overview cards follow the earnings rule for the chosen days", async ({ page }, info) => {
    const owner = await createTestOwner(`bk-summary-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "bk-summary"); // + a confirmed 1-hour claim booking
    await insertTestBooking({ day, hour: 8, hours: 2, paddles: true, label: "sum-confirmed" });
    await pendingReviewBooking(day, 10, "sum-review");
    await insertTestBooking({ day, hour: 11, label: "sum-rejected", status: "rejected" });
    await insertTestBooking({ day, hour: 12, label: "sum-expired", status: "expired" });
    await insertTestBlock(day, 14, 2, "sum-block");
    const { data: s } = await admin().from("settings").select("hourly_rate, paddle_fee").single();
    const rate = s!.hourly_rate;

    await signIn(page, owner, dayUrl("/admin", day));
    await expect(heading(page, "Overview")).toBeVisible();
    // counted: the 2-hour booking with paddles and the 1-hour claim booking
    await expect(page.getByTestId("stat-total-earnings").filter({ visible: true })).toContainText(peso(3 * rate + s!.paddle_fee));
    await expect(page.getByTestId("stat-court-revenue").filter({ visible: true })).toContainText(peso(3 * rate));
    await expect(page.getByTestId("stat-paddle-revenue").filter({ visible: true })).toContainText(peso(s!.paddle_fee));
    await expect(page.getByTestId("stat-bookings").filter({ visible: true })).toContainText("2");
    await expect(page.getByTestId("stat-hours-booked").filter({ visible: true })).toContainText("3");
    await expect(page.getByRole("link", { name: /^Pending payments: 1\./ }).filter({ visible: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

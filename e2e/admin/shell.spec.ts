import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { slotStartIso } from "../../src/lib/booking-time";
import { admin, createTestOwner, testEmail, testPhone } from "../support/admin";
import { freeTestDay } from "../support/booking";
import { expectNoHorizontalScroll, heading, signIn } from "../support/ui";

/** The admin nav that is showing: pill tabs on phones, the sidebar on laptops. */
const adminNav = (page: Page) => page.getByRole("navigation", { name: "Admin" }).filter({ visible: true });

/** A tagged guest booking with a screenshot "sent", so the Payments badge has something to count. */
async function pendingReviewBooking(day: string) {
  const { data, error } = await admin().rpc("create_booking", {
    p_start_at: slotStartIso(day, 10),
    p_hours: 1,
    p_paddles: false,
    p_name: "E2E Admin Shell",
    p_email: testEmail("admin-shell"),
    p_phone: `+63${testPhone().slice(1)}`,
    p_guest_token: randomBytes(32).toString("base64url"),
  });
  if (error || !data?.[0]) throw new Error(`create_booking: ${error?.message}`);
  const { error: updateError } = await admin()
    .from("bookings")
    .update({ status: "pending_review", payment_submitted_at: new Date().toISOString() })
    .eq("id", data[0].booking_id);
  if (updateError) throw new Error(`pending_review: ${updateError.message}`);
}

test.describe("admin shell", () => {
  test("owner moves between sections; Payments shows how many are waiting", async ({ page }, info) => {
    const owner = await createTestOwner(`admin-shell-${info.project.name}`);
    await pendingReviewBooking(await freeTestDay(info.project.name, "admin-shell"));

    await signIn(page, owner, "/admin");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(heading(page, "Overview")).toBeVisible();
    await expect(page.getByText(/payments? (is|are) waiting for review/).filter({ visible: true })).toBeVisible();
    await expect(adminNav(page)).toHaveCount(1);
    await expect(adminNav(page).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(adminNav(page).getByRole("link", { name: /^Payments\s*\d+\+? waiting for review$/ })).toBeVisible();
    await expectNoHorizontalScroll(page);

    for (const section of ["Payments", "Bookings", "Settings"] as const) {
      await adminNav(page).getByRole("link", { name: new RegExp(`^${section}`) }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/${section.toLowerCase()}$`));
      await expect(heading(page, section)).toBeVisible();
      await expect(adminNav(page).getByRole("link", { name: new RegExp(`^${section}`) })).toHaveAttribute("aria-current", "page");
      await expectNoHorizontalScroll(page);
    }

    await adminNav(page).getByRole("link", { name: "Overview" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("Review payments on the overview opens the payments section", async ({ page }, info) => {
    const owner = await createTestOwner(`admin-review-${info.project.name}`);
    await pendingReviewBooking(await freeTestDay(info.project.name, "admin-review"));

    await signIn(page, owner, "/admin");
    await page.getByRole("link", { name: "Review payments" }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/admin\/payments$/);
  });
});

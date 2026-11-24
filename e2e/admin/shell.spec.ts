import { expect, test, type Page } from "@playwright/test";
import { createTestOwner } from "../support/admin";
import { freeAdminDay, pendingReviewBooking } from "../support/booking";
import { expectNoHorizontalScroll, heading, signIn } from "../support/ui";

/** The admin nav that is showing: pill tabs on phones, the sidebar on laptops. */
const adminNav = (page: Page) => page.getByRole("navigation", { name: "Admin" }).filter({ visible: true });

test.describe("admin shell", () => {
  test("owner moves between sections; Payments shows how many are waiting", async ({ page }, info) => {
    const owner = await createTestOwner(`admin-shell-${info.project.name}`);
    await pendingReviewBooking(await freeAdminDay(info.project.name, "admin-shell"), 10, "admin-shell");

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
    await pendingReviewBooking(await freeAdminDay(info.project.name, "admin-review"), 10, "admin-review");

    await signIn(page, owner, "/admin");
    await page.getByRole("link", { name: "Review payments" }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/admin\/payments$/);
  });
});

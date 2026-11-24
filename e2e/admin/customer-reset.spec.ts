import { expect, test, type Page } from "@playwright/test";
import { createTestOwner, createTestUser } from "../support/admin";
import { freeAdminDay, insertTestBooking } from "../support/booking";
import { expectNoHorizontalScroll, field, signIn } from "../support/ui";

/** Other runs share the database, so always find this test's own card by its name. */
const customer = (page: Page, name: string) =>
  page.getByRole("article", { name: `Customer ${name}` }).or(page.getByRole("row", { name: `Customer ${name}` })).filter({ visible: true });
const sheet = (page: Page) => page.getByRole("dialog").filter({ visible: true });

test.describe("Owner-assisted password reset", () => {
  test("the owner sets a new password after the phone matches; the customer logs in with it", async ({ page, browser }, testInfo) => {
    const [owner, cust] = await Promise.all([createTestOwner("reset-owner"), createTestUser("reset-cust")]);
    const newPassword = `Court-${Date.now().toString(36)}-9Z!`;

    await signIn(page, owner, `/admin/customers?q=${encodeURIComponent(cust.email)}`);
    await customer(page, cust.fullName).getByRole("button", { name: `Set new password for ${cust.email}` }).click();

    const dialog = sheet(page);
    await expect(dialog.getByRole("heading", { name: "Set a new password" })).toBeVisible();
    await expect(dialog).toContainText(`Logs in with ${cust.email}`);
    await expectNoHorizontalScroll(page);

    // too short
    await field(page, "Customer's phone number").filter({ visible: true }).fill(cust.phone!);
    await dialog.getByLabel("New password").fill("short");
    await dialog.getByRole("button", { name: "Set password" }).click();
    await expect(dialog).toContainText("Use at least 8 characters.");

    // wrong phone: nothing changes
    const wrong = cust.phone!.endsWith("0") ? `${cust.phone!.slice(0, -1)}1` : `${cust.phone!.slice(0, -1)}0`;
    await field(page, "Customer's phone number").filter({ visible: true }).fill(wrong);
    await dialog.getByLabel("New password").fill(newPassword);
    await dialog.getByRole("button", { name: "Set password" }).click();
    await expect(dialog).toContainText("This isn't the phone number on the account.");

    // right phone, typed with spaces like people do
    await field(page, "Customer's phone number").filter({ visible: true }).fill(`${cust.phone!.slice(0, 4)} ${cust.phone!.slice(4, 7)} ${cust.phone!.slice(7)}`);
    await dialog.getByRole("button", { name: "Set password" }).click();
    await expect(dialog.getByRole("heading", { name: "Password changed" })).toBeVisible();
    await expect(dialog.getByTestId("new-password")).toHaveText(newPassword);
    await expect(dialog).toContainText(cust.email);
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);

    // the customer, on their own phone: the old password no longer works, the new one does
    const ctx = await browser.newContext({ ...testInfo.project.use });
    const theirs = await ctx.newPage();
    await theirs.goto("/login");
    await field(theirs, "Email").fill(cust.email);
    await field(theirs, "Password").fill(cust.password);
    await theirs.getByRole("button", { name: "Log in" }).click();
    await expect(theirs).toHaveURL(/\/login/);
    await expect(theirs.getByRole("alert").filter({ visible: true }).first()).toBeVisible();
    await signIn(theirs, { email: cust.email, password: newPassword });
    await expect(theirs.getByRole("button", { name: /Account menu/ }).filter({ visible: true })).toBeVisible();
    await ctx.close();
  });

  test("an account without a phone can't be reset; guests have no button", async ({ page }, testInfo) => {
    const [owner, nophone] = await Promise.all([createTestOwner("reset-owner"), createTestUser("reset-nophone", { complete: false })]);
    const day = await freeAdminDay(testInfo.project.name, "reset-guest");
    const guest = await insertTestBooking({ day, hour: 9, label: "reset-guest" });

    await signIn(page, owner, `/admin/customers?q=${encodeURIComponent(nophone.email)}`);
    const card = customer(page, nophone.fullName);
    await expect(card).toContainText("No phone on file");
    await card.getByRole("button", { name: `Set new password for ${nophone.email}` }).click();
    const dialog = sheet(page);
    await field(page, "Customer's phone number").filter({ visible: true }).fill("09171234567");
    await dialog.getByLabel("New password").fill("Another-pass-1");
    await dialog.getByRole("button", { name: "Set password" }).click();
    await expect(dialog).toContainText("This account has no phone number on file");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    await page.goto(`/admin/customers?q=${encodeURIComponent(guest.email)}`);
    const guestCard = customer(page, "E2E reset-guest");
    await expect(guestCard).toContainText("Guest");
    await expect(guestCard.getByRole("button", { name: /Set new password/ })).toHaveCount(0);
  });
});

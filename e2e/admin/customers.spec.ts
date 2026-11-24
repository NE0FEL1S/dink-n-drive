import { expect, test, type Page } from "@playwright/test";
import { slotStartIso } from "../../src/lib/booking-time";
import { admin, createTestOwner, createTestUser } from "../support/admin";
import { freeAdminDay, insertTestBooking } from "../support/booking";
import { expectNoHorizontalScroll, heading, signIn } from "../support/ui";

/** Other runs share the database, so always find this test's own card by its name. */
const customer = (page: Page, name: string) =>
  page.getByRole("article", { name: `Customer ${name}` }).or(page.getByRole("row", { name: `Customer ${name}` })).filter({ visible: true });

/** "+639171234567" → "0917 123 4567", like the page shows it. */
const local = (phone: string) => `0${phone.slice(3, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}`;

test.describe("Admin customers", () => {
  test("an account and its guest bookings show as one customer, found by phone", async ({ page }, testInfo) => {
    const [owner, cust] = await Promise.all([createTestOwner("cust-owner"), createTestUser("cust-ana")]);
    const phone = `+63${cust.phone!.slice(1)}`;
    const day = await freeAdminDay(testInfo.project.name, "customers");

    // two paid bookings on the customer's phone: one from the account, one as a guest
    const mine = await insertTestBooking({ day, hour: 8, hours: 2, paddles: true, label: "cust-ana" });
    const asGuest = await insertTestBooking({ day, hour: 11, label: "cust-ana-guest" });
    const expired = await insertTestBooking({ day, hour: 13, label: "cust-ana-expired", status: "expired" });
    await admin().from("bookings").update({ user_id: cust.id, guest_token_hash: null, contact_phone: phone }).eq("id", mine.id).throwOnError();
    await admin().from("bookings").update({ contact_phone: phone }).in("id", [asGuest.id, expired.id]).throwOnError();

    await signIn(page, owner, "/admin/customers");
    await expect(heading(page, "Customers")).toBeVisible();
    await expect(page.getByRole("link", { name: "Customers" }).filter({ visible: true }).first()).toHaveAttribute("aria-current", "page");

    // search the way the owner types a number
    const search = page.getByRole("searchbox", { name: "Search" });
    await search.fill(cust.phone!);
    await search.press("Enter");
    await expect(page).toHaveURL(/[?&]q=09\d{9}/);
    await expect(page.getByRole("status").filter({ hasText: /^1 customer matching/ })).toBeVisible();

    const card = customer(page, cust.fullName);
    await expect(card).toContainText("Account + guest");
    await expect(card).toContainText(local(phone));
    await expect(card).toContainText(cust.email);
    await expect(card).toContainText("2"); // bookings (the expired hold doesn't count)
    await expect(card).toContainText("3 h");
    await expect(card).toContainText(`₱${(mine.total + asGuest.total).toLocaleString("en-PH")}`);
    await expect(card).toContainText("None yet"); // no past visit
    const next = new Date(slotStartIso(day, 8)).toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    await expect(card).toContainText(next);
    await expect(card.getByRole("link", { name: local(phone) })).toHaveAttribute("href", `tel:${phone}`);
    await expectNoHorizontalScroll(page);

    // the same customer by name and by email
    await page.goto(`/admin/customers?q=${encodeURIComponent(cust.email.toUpperCase())}`);
    await expect(customer(page, cust.fullName)).toBeVisible();
  });

  test("sorting keeps the search, and an empty search result offers the full list", async ({ page }) => {
    const [owner, cust] = await Promise.all([createTestOwner("cust-owner"), createTestUser("cust-bea")]);

    await signIn(page, owner, `/admin/customers?q=${encodeURIComponent(cust.email)}`);
    const card = customer(page, cust.fullName);
    await expect(card).toContainText("Account");
    await expect(card).toContainText("₱0");

    await page.getByRole("combobox", { name: "Sort by" }).selectOption("spent");
    await expect(page).toHaveURL(/sort=spent/);
    await expect(page).toHaveURL(/q=/);
    await expect(customer(page, cust.fullName)).toBeVisible();

    await page.goto("/admin/customers?q=no-such-customer-xyz");
    await expect(page.getByRole("heading", { name: "No customers match your search." })).toBeVisible();
    await page.getByRole("link", { name: "Show all customers" }).click();
    await expect(page).toHaveURL(/\/admin\/customers$/);
    await expect(page.getByRole("status").filter({ hasText: /\d+ customers?/ })).toBeVisible();
  });

  test("customers can't open the page", async ({ page }) => {
    const cust = await createTestUser("cust-nosy");
    // logging in from an admin link lands on the home page, address bar included
    await signIn(page, cust, "/admin/customers");
    await expect(page).toHaveURL(/\/$/);
    await expect(heading(page, "Customers")).toHaveCount(0);
    // and opening it directly is turned away by the proxy
    await page.goto("/admin/customers");
    await expect(page).toHaveURL(/\/$/);
  });
});

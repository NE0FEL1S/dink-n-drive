import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { dayLabel, slotStartIso } from "../../src/lib/booking-time";
import { peso } from "../../src/lib/format";
import { admin, testEmail, testPhone } from "../support/admin";
import { freeTestDay } from "../support/booking";
import { button, gotoLanding, heading } from "../support/ui";

async function settings() {
  const { data, error } = await admin().from("settings").select("hourly_rate, paddle_fee").single();
  if (error || !data) throw new Error(`settings: ${error?.message}`);
  return data;
}

/** A guest booking made through the real create_booking() function (tagged for cleanup). */
async function bookAsGuest(day: string, startHour: number, hours: number) {
  const { error } = await admin().rpc("create_booking", {
    p_start_at: slotStartIso(day, startHour),
    p_hours: hours,
    p_paddles: false,
    p_name: "E2E Grid Guest",
    p_email: testEmail("grid"),
    p_phone: `+63${testPhone().slice(1)}`,
    p_guest_token: randomBytes(32).toString("base64url"),
  });
  if (error) throw new Error(`create_booking: ${error.message}`);
}

const slot = (page: Page, label: RegExp) => page.getByRole("button", { name: label }).filter({ visible: true });
const bar = (page: Page) => page.getByRole("region", { name: "Your booking" }).filter({ visible: true });

test.describe("booking grid", () => {
  test("pick a range, extend it, rent paddles; booked hours can't be picked", async ({ page }, info) => {
    const s = await settings();
    const day = await freeTestDay(info.project.name, "grid");
    await bookAsGuest(day, 14, 2); // 2:00–4:00 PM taken

    await page.goto("/book");
    await expect(heading(page, "Book the court")).toBeVisible();
    await page.getByRole("button", { name: dayLabel(day), exact: true }).filter({ visible: true }).click();

    await expect(slot(page, /^2:00\sPM to 3:00\sPM, booked$/)).toBeDisabled();
    await expect(slot(page, /^3:00\sPM to 4:00\sPM, booked$/)).toBeDisabled();

    // tap 10 AM → one hour
    await slot(page, /^10:00\sAM to 11:00\sAM/).click();
    await expect(bar(page)).toContainText("1 hour");
    await expect(bar(page)).toContainText(peso(s.hourly_rate));

    // tap noon → 10 AM–1 PM
    await slot(page, /^12:00\sPM to 1:00\sPM/).click();
    await expect(bar(page)).toContainText(/10:00\sAM – 1:00\sPM/);
    await expect(bar(page)).toContainText("3 hours");
    await expect(bar(page)).toContainText(peso(3 * s.hourly_rate));

    // paddles: flat fee per booking
    await page.getByText(/^Rent paddles/).filter({ visible: true }).click();
    await expect(page.getByRole("switch").filter({ visible: true })).toBeChecked();
    await expect(bar(page)).toContainText(peso(3 * s.hourly_rate + s.paddle_fee));

    // 1 PM extends to 2 PM; the next hour is booked, so "+" is disabled
    await slot(page, /^1:00\sPM to 2:00\sPM/).click();
    await expect(bar(page)).toContainText("4 hours");
    await expect(button(page, "One hour more")).toBeDisabled();
    await button(page, "One hour less").click();
    await expect(bar(page)).toContainText("3 hours");

    // across the booked hours → a new selection starts at 4 PM
    await slot(page, /^4:00\sPM to 5:00\sPM/).click();
    await expect(bar(page)).toContainText(/4:00 – 5:00\sPM/);
    await expect(bar(page)).toContainText("1 hour");

    await button(page, "Continue").click();
    await expect(page.getByText(peso(s.hourly_rate + s.paddle_fee)).filter({ visible: true }).first()).toBeVisible();
  });

  test("Book now opens the booking popup over the landing page; closing returns", async ({ page }) => {
    await gotoLanding(page);
    await page.getByRole("link", { name: "Book now" }).filter({ visible: true }).click();

    const sheet = page.getByRole("dialog", { name: "Book the court" });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/\/book$/);
    await expect(sheet.getByRole("button", { name: /^Today, / })).toBeVisible();

    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(sheet).toBeHidden();

    // the landing page is usable again (the closed popup must not leave it inert)
    await page.getByRole("link", { name: "Book now" }).filter({ visible: true }).click();
    await expect(page.getByRole("dialog", { name: "Book the court" })).toBeVisible();
  });
});

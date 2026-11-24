import { expect, test, type Page } from "@playwright/test";
import { addDays, dayLabel, slotStartIso } from "../../src/lib/booking-time";
import { admin, createTestOwner } from "../support/admin";
import { freeAdminDay, insertTestBooking } from "../support/booking";
import { expectNoHorizontalScroll, signIn } from "../support/ui";

const peso = (n: number) => `₱${n.toLocaleString("en-PH")}`;
const chartCard = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: /^Earnings per (day|week)$/ }) }).filter({ visible: true }).last();

/** What admin_daily_earnings counts for one play date: confirmed bookings (no refunds in these tests). */
async function earningsOn(day: string): Promise<number> {
  const { data, error } = await admin()
    .from("bookings")
    .select("court_fee, paddle_fee")
    .eq("kind", "customer")
    .eq("status", "confirmed")
    .gte("start_at", slotStartIso(day, 0))
    .lt("start_at", slotStartIso(addDays(day, 1), 0));
  if (error) throw new Error(error.message);
  return data.reduce((s, b) => s + b.court_fee + b.paddle_fee, 0);
}

test.describe("Overview earnings chart", () => {
  test("bars per day with a readable value on keyboard, and the same numbers as a table", async ({ page }, testInfo) => {
    const owner = await createTestOwner("chart-owner");
    const day = await freeAdminDay(testInfo.project.name, "chart");
    await insertTestBooking({ day, hour: 9, hours: 3, paddles: true, label: "chart" });
    await insertTestBooking({ day, hour: 14, label: "chart-unpaid", status: "pending_review" }); // not counted
    const total = await earningsOn(day);

    await signIn(page, owner, `/admin?period=custom&from=${day}&to=${addDays(day, 6)}`);
    const card = chartCard(page);
    await expect(card.getByRole("heading", { name: "Earnings per day" })).toBeVisible();
    const chart = card.getByRole("group", { name: /^Earnings per day/ });
    await expect(chart.locator("svg path")).not.toHaveCount(0);
    await expectNoHorizontalScroll(page);

    // keyboard: Home is the first day of the range
    await chart.focus();
    await page.keyboard.press("Home");
    await expect(card).toContainText(peso(total));
    await expect(card).toContainText(dayLabel(day));

    await card.getByText("Show as table").click();
    const row = card.getByRole("row", { name: new RegExp(`^${dayLabel(day)}`) });
    await expect(row).toContainText(peso(total));
  });

  test("a single day asks for a longer period; long ranges are grouped by week", async ({ page }) => {
    const owner = await createTestOwner("chart-owner");
    await signIn(page, owner, "/admin?period=today");
    await expect(page.getByText("Pick This week, This month or a custom range to see earnings per day.").filter({ visible: true })).toBeVisible();

    const from = addDays(new Date().toISOString().slice(0, 10), -100);
    await page.goto(`/admin?period=custom&from=${from}&to=${addDays(from, 99)}`);
    await expect(chartCard(page).getByRole("heading", { name: "Earnings per week" })).toBeVisible();
  });
});

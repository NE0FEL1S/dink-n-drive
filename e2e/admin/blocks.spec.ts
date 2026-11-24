import { expect, test, type Page } from "@playwright/test";
import { slotStartMs } from "../../src/lib/booking-time";
import { admin, createTestOwner, testBlockNote } from "../support/admin";
import { freeAdminDay, insertTestBlock, insertTestBooking } from "../support/booking";
import { button, expectNoHorizontalScroll, signIn } from "../support/ui";

const sheet = (page: Page) => page.getByRole("dialog").filter({ visible: true });
const hour = (page: Page, label: string) => sheet(page).getByRole("button", { name: new RegExp(`^${label},`) });

async function openSheetOn(page: Page, day: string) {
  await button(page, "Block hours").click();
  await expect(sheet(page)).toBeVisible();
  await sheet(page).getByLabel("Day").fill(day);
  await expect(sheet(page).getByRole("region", { name: /^Hours on / })).toBeVisible();
}

async function takenStarts(day: string) {
  const { data, error } = await admin().rpc("get_availability", { p_day: day });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => Date.parse(r.start_at));
}

test.describe("admin block hours", () => {
  test("owner blocks two hours (booked hours can't be picked), customers see them taken, then removes the block", async ({ page }, info) => {
    const owner = await createTestOwner(`blk-ui-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "blk-ui");
    await insertTestBooking({ day, hour: 12, label: "blk-booked" });
    const note = testBlockNote(`blk-ui-${info.project.name}`);

    await signIn(page, owner, "/admin/bookings");
    await openSheetOn(page, day);
    await expect(hour(page, "12:00 PM to 1:00 PM")).toHaveCount(0); // booked: shown, not a button
    await expect(sheet(page).getByText("E2E blk-booked")).toBeVisible();

    await hour(page, "9:00 AM to 10:00 AM").click();
    await hour(page, "10:00 AM to 11:00 AM").click();
    await expect(hour(page, "10:00 AM to 11:00 AM")).toHaveAttribute("aria-pressed", "true");
    await sheet(page).getByLabel(/^Note/).fill(note);
    await sheet(page).getByRole("button", { name: "Block 9:00 – 11:00 AM" }).click();
    await expect(sheet(page).getByText(/^Blocked 9:00 – 11:00\sAM on .+ \(DND-[2-9A-HJ-NP-Z]{5}\)\.$/)).toBeVisible();
    await expect(sheet(page).getByText(`Blocked · ${note}`).first()).toBeVisible();

    const { data: block } = await admin().from("bookings").select("id, ref_code, hours, status").eq("block_note", note).single();
    expect(block).toMatchObject({ hours: 2, status: "blocked" });
    expect(await takenStarts(day)).toContain(slotStartMs(day, 9));

    // remove it from the bookings list
    await page.keyboard.press("Escape");
    await page.goto(`/admin/bookings?period=custom&from=${day}&to=${day}&status=blocked`);
    const row = page.locator(`[aria-label="Booking ${block!.ref_code}"]`).filter({ visible: true });
    await expect(row).toContainText("Owner block");
    await expectNoHorizontalScroll(page);
    await row.getByRole("button", { name: "Remove block" }).click();
    await row.getByRole("button", { name: "Yes, remove" }).click();
    await expect(row).toHaveCount(0);
    const { data: gone } = await admin().from("bookings").select("id").eq("id", block!.id);
    expect(gone).toHaveLength(0);
    expect(await takenStarts(day)).not.toContain(slotStartMs(day, 9));
  });

  test("a block can be removed from the Block hours sheet", async ({ page }, info) => {
    const owner = await createTestOwner(`blk-rm-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "blk-rm");
    const block = await insertTestBlock(day, 15, 2, `blk-rm-${info.project.name}`);

    await signIn(page, owner, "/admin/bookings");
    await openSheetOn(page, day);
    await sheet(page).getByRole("button", { name: "Remove block" }).click();
    await sheet(page).getByRole("button", { name: "Yes, remove" }).click();
    await expect(sheet(page).getByText("Removed the 3:00 – 5:00 PM block.")).toBeVisible();
    await expect(hour(page, "3:00 PM to 4:00 PM")).toBeVisible(); // free again
    const { data: gone } = await admin().from("bookings").select("id").eq("id", block.id);
    expect(gone).toHaveLength(0);
  });

  test("hours booked while the sheet is open are refused with a message", async ({ page }, info) => {
    const owner = await createTestOwner(`blk-race-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "blk-race");

    await signIn(page, owner, "/admin/bookings");
    await openSheetOn(page, day);
    await hour(page, "6:00 PM to 7:00 PM").click();
    await insertTestBooking({ day, hour: 18, label: "blk-race" }); // a customer gets there first
    await sheet(page).getByRole("button", { name: "Block 6:00 – 7:00 PM" }).click();
    await expect(sheet(page).getByText("already booked or blocked")).toBeVisible();
    await expect(hour(page, "6:00 PM to 7:00 PM")).toHaveCount(0); // reloaded: now booked
  });
});

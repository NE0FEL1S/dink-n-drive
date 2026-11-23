import { expect, test } from "@playwright/test";
import { hourWords } from "../../src/lib/format";
import { admin } from "../support/admin";
import { expectNoHorizontalScroll, gotoLanding, heading } from "../support/ui";

test.describe("landing page", () => {
  test("shows the hero with opening hours from settings", async ({ page }) => {
    const { data: s, error } = await admin().from("settings").select("open_hour, close_hour").single();
    expect(error).toBeNull();

    await gotoLanding(page);
    await expect(heading(page, /Book your hour/)).toBeVisible();
    await expect(page.getByText(`${hourWords(s!.open_hour)} to ${hourWords(s!.close_hour)}`).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("Book now opens the booking page", async ({ page }) => {
    await gotoLanding(page);
    await page.getByRole("link", { name: "Book now" }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/book$/);
    await expect(heading(page, "Book the court")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("court photos", () => {
  test("open in a lightbox, swipe to the next photo, close", async ({ page }) => {
    await gotoLanding(page);
    // laptops show the photo card; phones (and narrow laptops) the "See the court" tile
    await page.getByRole("button", { name: /See (photos of )?the court/ }).filter({ visible: true }).first().click();

    const gallery = page.getByRole("dialog", { name: "Photos of the court" });
    await expect(gallery).toBeVisible();
    await expect(gallery.getByRole("img")).toHaveCount(2);
    await expect(gallery.getByText("Luyang · 1 / 2")).toBeVisible();

    await gallery.getByRole("button", { name: "Next photo" }).click();
    await expect(gallery.getByText("Luyang · 2 / 2")).toBeVisible();

    await gallery.getByRole("button", { name: "Close photos" }).click();
    await expect(gallery).toBeHidden();
  });
});

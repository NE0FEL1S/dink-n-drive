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

test.describe("court photo", () => {
  test("laptops show the real court photo card; phones keep the clean hero", async ({ page, isMobile }) => {
    await gotoLanding(page);
    const photo = page.getByRole("img", { name: /players .* on the Dink n' Drive court/ });
    if (isMobile) {
      await expect(photo).toBeHidden();
    } else {
      await expect(photo).toBeVisible();
      await expect(page.getByText("The real court").filter({ visible: true })).toBeVisible();
    }
  });
});

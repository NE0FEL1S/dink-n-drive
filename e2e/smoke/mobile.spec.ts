import { expect, test, type Page } from "@playwright/test";
import { createTestOwner, createTestUser } from "../support/admin";
import { signIn } from "../support/ui";

/**
 * DESIGN §7 on every page at 360 px (the narrowest common Android): no sideways scroll,
 * inputs at 16 px or more (iOS zooms in on smaller ones), and buttons / controls at least
 * 44 px tall. Links inside running text and the landing nav's Log in (42 px drawn, 48 px
 * tap area via ::after) are left out. Phones only.
 */
const PAGES = {
  guest: ["/", "/book", "/login", "/community", "/feedback", "/my-bookings"],
  member: ["/profile", "/my-bookings"],
  owner: ["/admin", "/admin/bookings", "/admin/payments", "/admin/refunds", "/admin/customers", "/admin/feedback", "/admin/moderation", "/admin/settings"],
};

async function problems(page: Page, path: string): Promise<string[]> {
  await page.goto(path);
  await page.waitForLoadState("load");
  return page.evaluate(() => {
    const out: string[] = [];
    const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (over > 0) out.push(`page scrolls sideways by ${over}px`);
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const label = (el: Element) => (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("name") || el.tagName).trim().slice(0, 40);
    for (const el of document.querySelectorAll("input, select, textarea")) {
      const type = (el as HTMLInputElement).type;
      if (!shown(el) || ["checkbox", "radio", "file", "hidden"].includes(type)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 16) out.push(`input "${label(el)}" font ${size}px`);
    }
    for (const el of document.querySelectorAll("button, a[href], select, input:not([type=hidden]), summary")) {
      const type = (el as HTMLInputElement).type;
      if (!shown(el) || ["checkbox", "radio", "file"].includes(type) || el.classList.contains("l-login")) continue;
      const inText = getComputedStyle(el).display === "inline";
      const h = el.getBoundingClientRect().height;
      if (!inText && h < 44) out.push(`${el.tagName.toLowerCase()} "${label(el)}" is ${Math.round(h)}px tall`);
    }
    return out;
  });
}

test.describe("mobile checklist at 360 px", () => {
  test.skip(({ isMobile }) => !isMobile, "phones only");
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 360, height: 780 }));

  test("public pages", async ({ page }) => {
    for (const path of PAGES.guest) expect(await problems(page, path), path).toEqual([]);
  });

  test("member and owner pages", async ({ page, browser }, testInfo) => {
    const [member, owner] = await Promise.all([createTestUser("mobile-member"), createTestOwner("mobile-owner")]);
    await signIn(page, member, "/profile");
    for (const path of PAGES.member) expect(await problems(page, path), path).toEqual([]);

    const ctx = await browser.newContext({ ...testInfo.project.use, viewport: { width: 360, height: 780 } });
    const ownerPage = await ctx.newPage();
    await signIn(ownerPage, owner, "/admin");
    for (const path of PAGES.owner) expect(await problems(ownerPage, path), path).toEqual([]);
    await ctx.close();
  });
});

import { expect, type Locator, type Page } from "@playwright/test";
import type { TestUser } from "./admin";

/**
 * `cacheComponents` keeps recently visited routes mounted but hidden (React <Activity>),
 * so a page's form fields can still be in the DOM after navigating away. Always scope
 * locators to visible elements, or `getByLabel` matches two inputs.
 */
export function field(page: Page, label: string | RegExp): Locator {
  return page.getByLabel(label, { exact: typeof label === "string" }).filter({ visible: true });
}

export function button(page: Page, name: string | RegExp): Locator {
  return page.getByRole("button", { name }).filter({ visible: true });
}

export function heading(page: Page, name: string | RegExp): Locator {
  return page.getByRole("heading", { name }).filter({ visible: true });
}

/** Signs in through the real login form. */
export async function signIn(page: Page, user: Pick<TestUser, "email" | "password">, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await field(page, "Email").fill(user.email);
  await field(page, "Password").fill(user.password);
  await button(page, "Log in").click();
  // The redirect renders the next page inside the action's response; a cold `next dev`
  // compiling that route for several workers at once can take longer than the default 10 s.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

/** DESIGN.md §7: no screen may scroll sideways at phone widths. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(0);
}

/** The landing scene positions its elements with JS; wait until it marks itself ready before tapping. */
export async function gotoLanding(page: Page) {
  await page.goto("/");
  await expect(page.locator(".l-ready")).toBeAttached();
}

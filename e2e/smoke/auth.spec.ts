import { expect, test } from "@playwright/test";
import { TEST_PASSWORD, createTestUser, testEmail, testPhone } from "../support/admin";
import { button, expectNoHorizontalScroll, field, heading, signIn } from "../support/ui";

test.describe("accounts", () => {
  test("sign up → complete profile → back to where you started", async ({ page }, info) => {
    await page.goto("/login?next=%2Fbook");
    await expectNoHorizontalScroll(page);
    await button(page, "Create an account").click();

    await field(page, "Full name").fill(`E2E Signup ${info.project.name}`);
    await field(page, "Email").fill(testEmail(`signup-${info.project.name}`));
    await field(page, "Password").fill(TEST_PASSWORD);
    await button(page, "Create account").click();

    await expect(page).toHaveURL(/\/profile\?welcome=1/);
    await expect(heading(page, "Complete your profile")).toBeVisible();
    await field(page, "Mobile number").fill(testPhone());
    await button(page, "Save and continue").click();

    await expect(page).toHaveURL(/\/book$/);
  });

  test("wrong password shows an error and stays on the login page", async ({ page }) => {
    const user = await createTestUser("wrong-pass");
    await page.goto("/login");
    await field(page, "Email").fill(user.email);
    await field(page, "Password").fill("not-the-password");
    await button(page, "Log in").click();

    await expect(page.getByText("That email and password don't match").filter({ visible: true })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("signed-in customer can edit their profile but not open admin", async ({ page }) => {
    const user = await createTestUser("customer");
    await signIn(page, user, "/profile");

    await expect(heading(page, "Your profile")).toBeVisible();
    await expect(field(page, "Mobile number")).toHaveValue(user.phone!);
    await expectNoHorizontalScroll(page);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/);
  });

  test("guests are sent to login for profile and admin", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  });
});

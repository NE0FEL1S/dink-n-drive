import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { dayLabel, slotStartIso } from "../../src/lib/booking-time";
import { peso } from "../../src/lib/format";
import { admin, createTestUser, testEmail, testPhone } from "../support/admin";
import { freeTestDay } from "../support/booking";
import { button, field, signIn } from "../support/ui";


// a tiny valid PNG, standing in for a GCash receipt screenshot
const RECEIPT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function hourlyRate() {
  const { data } = await admin().from("settings").select("hourly_rate").single();
  return data!.hourly_rate;
}

const slot = (page: Page, label: RegExp) => page.getByRole("button", { name: label }).filter({ visible: true });

async function pickHours(page: Page, day: string, from: RegExp, to?: RegExp) {
  await page.goto("/book");
  await page.getByRole("button", { name: dayLabel(day), exact: true }).filter({ visible: true }).click();
  await slot(page, from).click();
  if (to) await slot(page, to).click();
  await button(page, "Continue").click();
}

test.describe("checkout", () => {
  test("guest: details → GCash QR + countdown → upload receipt → pending review", async ({ page, context }, info) => {
    const rate = await hourlyRate();
    const day = await freeTestDay(info.project.name, "checkout-guest");
    const email = testEmail(`checkout-${info.project.name}`);

    await pickHours(page, day, /^10:00\sAM to 11:00\sAM/, /^11:00\sAM to 12:00\sPM/);
    await field(page, "Full name").fill("E2E Checkout Guest");
    await field(page, "Email").fill(email);
    await field(page, "Mobile number").fill(testPhone());
    await button(page, `Book and pay ${peso(2 * rate)}`).click();

    // step 3: pay
    await expect(page.getByText(/^Pay within/).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(peso(2 * rate), { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("img", { name: /GCash QR code/ }).filter({ visible: true })).toBeVisible();
    const ref = (await page.getByText(/^DND-[2-9A-HJ-NP-Z]{5}$/).filter({ visible: true }).first().textContent())!.trim();

    // the device-token cookie is httpOnly (scripts can't read it)
    const cookie = (await context.cookies()).find((c) => c.name === "dnd_device");
    expect(cookie?.httpOnly).toBe(true);

    await page.locator("#proof-file").filter({ visible: true }).setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: RECEIPT_PNG });
    await button(page, "Send payment proof").click();

    // step 4: done
    await expect(page.getByText("Payment sent for review").filter({ visible: true })).toBeVisible();
    await expect(page.getByText(ref).filter({ visible: true }).first()).toBeVisible();

    const { data: b } = await admin()
      .from("bookings")
      .select("ref_code, status, hours, total, payment_proof_path, guest_token_hash, user_id")
      .eq("contact_email", email)
      .single();
    expect(b).toMatchObject({ ref_code: ref, status: "pending_review", hours: 2, total: 2 * rate, user_id: null });
    expect(b!.guest_token_hash).toMatch(/^[0-9a-f]{64}$/);
    const file = await admin().storage.from("payment-proofs").download(b!.payment_proof_path!);
    expect(file.error).toBeNull();
  });

  test("a phone number with 2 unpaid bookings can't book a third", async ({ page }, info) => {
    const day = await freeTestDay(info.project.name, "checkout-unpaid");
    const phone = testPhone();
    for (const hour of [18, 20]) {
      const { error } = await admin().rpc("create_booking", {
        p_start_at: slotStartIso(day, hour),
        p_hours: 1,
        p_paddles: false,
        p_name: "E2E Unpaid",
        p_email: testEmail("unpaid"),
        p_phone: `+63${phone.slice(1)}`,
        p_guest_token: randomBytes(32).toString("base64url"),
      });
      expect(error).toBeNull();
    }

    await pickHours(page, day, /^2:00\sPM to 3:00\sPM/);
    await field(page, "Full name").fill("E2E Unpaid");
    await field(page, "Email").fill(testEmail("unpaid-ui"));
    await field(page, "Mobile number").fill(phone);
    await page.getByRole("button", { name: /^Book and pay/ }).filter({ visible: true }).click();
    await expect(page.getByText(/already has 2 unpaid bookings/).filter({ visible: true })).toBeVisible();
  });

  test("signed in without a phone: details prefilled, phone asked once and saved", async ({ page }, info) => {
    const user = await createTestUser(`checkout-acct-${info.project.name}`, { complete: false });
    await signIn(page, user);
    const day = await freeTestDay(info.project.name, "checkout-account");
    const phone = testPhone();

    await pickHours(page, day, /^4:00\sPM to 5:00\sPM/);
    await expect(page.getByText("We'll use the details on your account.").filter({ visible: true })).toBeVisible();
    await expect(page.getByText(user.email).filter({ visible: true })).toBeVisible();
    await expect(field(page, "Email")).toHaveCount(0);
    await field(page, "Mobile number").fill(phone);
    await page.getByRole("button", { name: /^Book and pay/ }).filter({ visible: true }).click();
    await expect(page.getByText(/^Pay within/).filter({ visible: true })).toBeVisible();

    const { data: b } = await admin().from("bookings").select("user_id, contact_name, contact_phone").eq("user_id", user.id).single();
    expect(b).toMatchObject({ user_id: user.id, contact_name: user.fullName, contact_phone: `+63${phone.slice(1)}` });
    const { data: p } = await admin().from("profiles").select("phone").eq("id", user.id).single();
    expect(p!.phone).toBe(`+63${phone.slice(1)}`);
  });
});

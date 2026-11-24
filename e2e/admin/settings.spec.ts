import { expect, test, type Page } from "@playwright/test";
import { gcashQr } from "../../src/lib/gcash";
import { admin, createTestOwner } from "../support/admin";
import { expectNoHorizontalScroll, field, heading, signIn } from "../support/ui";

/**
 * Settings are one shared row and the GCash QR is the real one, so:
 * - the validation test saves nothing;
 * - the save test runs on one device only (the others would overwrite each other's change) and
 *   puts the original value back through the page, which also refreshes the site's cached settings;
 * - the QR test is opt-in (E2E_QR_TEST=1), so CI never touches the payment QR. It restores the
 *   original image byte for byte (small QR images are uploaded as they are, never re-encoded).
 */

const save = (page: Page) => page.getByRole("button", { name: "Save settings" }).filter({ visible: true });

async function settingsRow() {
  const { data, error } = await admin().from("settings").select("court_name, open_hour, close_hour, hold_minutes, gcash_qr_path").single();
  if (error) throw new Error(error.message);
  return data;
}

test.describe("admin settings", () => {
  test("bad values are refused with a message next to the field; nothing is saved", async ({ page }, info) => {
    const owner = await createTestOwner(`set-bad-${info.project.name}`);
    const before = await settingsRow();

    await signIn(page, owner, "/admin/settings");
    await expect(heading(page, "Settings")).toBeVisible();
    await expect(field(page, "Court name")).toHaveValue(before.court_name);
    await expectNoHorizontalScroll(page);

    await field(page, "Closes at").selectOption(String(before.open_hour));
    await field(page, "Court fee per hour").fill("");
    await field(page, "Minutes to pay").fill("0");
    await save(page).click();

    await expect(page.getByText("Check the highlighted fields.").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Closing must be after opening.").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Fill this in.").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Between 1 and 240 minutes.").filter({ visible: true })).toBeVisible();
    await expect(field(page, "Minutes to pay")).toHaveValue("0"); // what was typed stays
    // nothing was stored (other tests may save the row meanwhile, so check the refused values themselves)
    const after = await settingsRow();
    expect(after.hold_minutes).toBeGreaterThan(0);
    expect(after.close_hour).toBeGreaterThan(after.open_hour);
  });

  test("owner renames the court and saves; the change is stored, then put back", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "changes the shared settings row: one device is enough");
    const owner = await createTestOwner("set-save");
    const original = (await settingsRow()).court_name;

    await signIn(page, owner, "/admin/settings");
    try {
      await field(page, "Court name").fill(`${original} (e2e)`);
      await save(page).click();
      await expect(page.getByText("Settings saved.").filter({ visible: true })).toBeVisible();
      expect((await settingsRow()).court_name).toBe(`${original} (e2e)`);
      await expect(page.getByText(/^Last changed .+ by E2E set-save\.$/)).toBeVisible();
    } finally {
      await page.goto("/admin/settings");
      await field(page, "Court name").fill(original);
      await save(page).click();
      await expect(page.getByText("Settings saved.").filter({ visible: true })).toBeVisible();
    }
    expect((await settingsRow()).court_name).toBe(original);
  });

  test("owner replaces the GCash QR; the one before is kept, older ones are deleted", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop" || process.env.E2E_QR_TEST !== "1", "opt-in: touches the real payment QR");
    const owner = await createTestOwner("set-qr");
    const originalPath = (await settingsRow()).gcash_qr_path;
    test.skip(!originalPath, "no QR set yet");
    const originalUrl = gcashQr(originalPath)!.url;
    const original = Buffer.from(await (await fetch(originalUrl)).arrayBuffer());
    const ext = originalPath!.split(".").pop()!;
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    // a small stand-in "QR": a 1×1 PNG
    const stand = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

    await signIn(page, owner, "/admin/settings");
    await page.locator("#qr-file").setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: stand });
    await expect(page.getByRole("img", { name: "New GCash QR" })).toBeVisible();
    await page.getByRole("button", { name: "Save new QR" }).click();
    await expect(page.getByText("New GCash QR saved.").filter({ visible: true })).toBeVisible();
    const replaced = (await settingsRow()).gcash_qr_path!;
    expect(replaced).toMatch(/^gcash\/qr-[0-9a-f]{12}\.png$/);
    // the replaced QR is kept (other deployments may still show it from cached settings)
    const { data: files } = await admin().storage.from("site-assets").list("gcash");
    expect(files?.some((f) => f.name === originalPath!.slice(6))).toBe(true);

    // put the original image back, unchanged, the same way
    await page.goto("/admin/settings");
    await page.locator("#qr-file").setInputFiles({ name: `qr.${ext}`, mimeType: mime, buffer: original });
    await page.getByRole("button", { name: "Save new QR" }).click();
    await expect(page.getByText("New GCash QR saved.").filter({ visible: true })).toBeVisible();
    const restored = (await settingsRow()).gcash_qr_path!;
    const back = Buffer.from(await (await fetch(gcashQr(restored)!.url)).arrayBuffer());
    expect(back.equals(original)).toBe(true);
    // ...and the stand-in is still there as "the one before", while files older than that are gone
    const { data: after } = await admin().storage.from("site-assets").list("gcash");
    const names = after?.map((f) => f.name) ?? [];
    expect(names).toContain(replaced.slice(6));
    expect(names).not.toContain(originalPath!.slice(6));
  });
});

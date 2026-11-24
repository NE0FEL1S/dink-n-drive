import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";
import { admin, createTestOwner, createTestUser } from "../support/admin";
import { freeAdminDay, insertTestBlock, insertTestBooking, pendingReviewBooking } from "../support/booking";
import { signIn } from "../support/ui";

async function download(page: Page, name: "Excel" | "PDF") {
  const waiting = page.waitForEvent("download");
  await page.getByRole("group", { name: "Export these bookings" }).filter({ visible: true }).getByRole("link", { name }).click();
  const file = await waiting;
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}

test.describe("admin exports", () => {
  test("Excel and PDF hold the filtered bookings, a totals row and the summary", async ({ page }, info) => {
    const owner = await createTestOwner(`exp-${info.project.name}`);
    const day = await freeAdminDay(info.project.name, "exp"); // + a confirmed 1-hour claim booking
    const confirmed = await insertTestBooking({ day, hour: 8, hours: 2, paddles: true, label: "exp-confirmed" });
    const review = await pendingReviewBooking(day, 10, "exp-review");
    const rejected = await insertTestBooking({ day, hour: 11, label: "exp-rejected", status: "rejected" });
    const block = await insertTestBlock(day, 14, 2, `exp-block-${info.project.name}`);
    const { data: s } = await admin().from("settings").select("hourly_rate, paddle_fee").single();
    const rate = s!.hourly_rate;

    await signIn(page, owner, `/admin/bookings?period=custom&from=${day}&to=${day}`);

    // Excel
    const xlsx = await download(page, "Excel");
    expect(xlsx.name).toBe(`dink-n-drive-bookings-${day}.xlsx`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.bytes as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet("Bookings")!;
    const refs = sheet.getColumn(1).values.slice(2).map(String); // [1] is the header
    for (const ref of [confirmed.ref, review.ref, rejected.ref, block.ref]) expect(refs).toContain(ref);
    expect(refs).toHaveLength(6); // 5 bookings + the totals row
    const totals = sheet.getRow(sheet.rowCount); // columns: 1 Reference · 5 Hours · 13 Total
    expect(totals.getCell(1).value).toBe("Totals");
    expect(totals.getCell(13).value).toBe(3 * rate + s!.paddle_fee); // 2 h + paddles, and the 1-hour claim booking
    expect(totals.getCell(5).value).toBe(3);
    const summary = wb.getWorksheet("Summary")!;
    const earnings = summary.getColumn(1).values.findIndex((v) => v === "Total earnings");
    expect(summary.getRow(earnings).getCell(2).value).toBe(3 * rate + s!.paddle_fee);

    // PDF
    const pdf = await download(page, "PDF");
    expect(pdf.name).toBe(`dink-n-drive-bookings-${day}.pdf`);
    const text = pdf.bytes.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain(confirmed.ref);
    expect(text).toContain(`PHP ${(3 * rate + s!.paddle_fee).toLocaleString("en-PH")}`);

    // the status filter carries over to the files
    await page.goto(`/admin/bookings?period=custom&from=${day}&to=${day}&status=confirmed`);
    const onlyConfirmed = await download(page, "Excel");
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(onlyConfirmed.bytes as unknown as ArrayBuffer);
    const refs2 = wb2.getWorksheet("Bookings")!.getColumn(1).values.slice(2).map(String);
    expect(refs2).toContain(confirmed.ref);
    expect(refs2).not.toContain(rejected.ref);
    expect(refs2).not.toContain(block.ref);
  });

  test("guests and customers can't export", async ({ page, playwright, baseURL }, info) => {
    const anon = await playwright.request.newContext({ baseURL });
    const asGuest = await anon.get("/admin/bookings/export?format=xlsx", { maxRedirects: 0 });
    expect(asGuest.status()).toBe(307);
    expect(asGuest.headers()["location"]).toContain("/login");
    await anon.dispose();

    const customer = await createTestUser(`exp-cust-${info.project.name}`);
    await signIn(page, customer);
    const asCustomer = await page.request.get("/admin/bookings/export?format=xlsx", { maxRedirects: 0 });
    expect(asCustomer.status()).toBe(307);
    expect(asCustomer.headers()["location"]).not.toContain("export");
  });
});

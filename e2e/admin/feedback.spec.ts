import { expect, test, type Page } from "@playwright/test";
import { admin, createTestOwner, createTestUser, runId } from "../support/admin";
import { insertTestFeedback, listFeedbackFiles } from "../support/feedback";
import { expectNoHorizontalScroll, heading, signIn } from "../support/ui";

/** Other runs share the database, so always find this test's own card by its message. */
const inboxCard = (page: Page, text: string) =>
  page.getByRole("article", { name: /^Feedback from/ }).filter({ visible: true }).filter({ hasText: text });
const publicCard = (page: Page, text: string) => page.getByRole("article").filter({ visible: true }).filter({ hasText: text });
const sheet = (page: Page) => page.getByRole("dialog").filter({ visible: true });
const tabs = (page: Page) => page.getByRole("navigation", { name: "Feedback status" });

async function row(id: string) {
  const { data } = await admin().from("feedback").select("status, owner_reply, replied_at, deleted_at").eq("id", id).single();
  return data!;
}

test.describe("Admin feedback inbox", () => {
  test("the owner sees who wrote anonymous feedback and moves it through the statuses", async ({ page }, testInfo) => {
    const message = `Inbox anon ${runId()}-${testInfo.project.name}`;
    const [owner, author] = await Promise.all([createTestOwner("fb-owner"), createTestUser("fb-author")]);
    const item = await insertTestFeedback(author, { message, anonymous: true, photos: 1 });

    await signIn(page, owner, "/admin/feedback");
    await expect(heading(page, "Feedback")).toBeVisible();
    const adminNav = page.getByRole("navigation", { name: "Admin" }).filter({ visible: true });
    await expect(adminNav.getByRole("link", { name: /^Feedback/ })).toHaveAttribute("aria-current", "page");
    await expect(adminNav.getByRole("link", { name: /^Feedback/ })).toContainText(/\d+ open/);
    await expect(tabs(page).getByRole("link", { name: /^Open/ })).toHaveAttribute("aria-current", "page");

    const card = inboxCard(page, message);
    await expect(card).toHaveAccessibleName("Feedback from E2E fb-author");
    await expect(card).toContainText("Anonymous to the public");
    await expect(card).toContainText(author.email);
    await expect(card.getByRole("link", { name: author.phone! })).toHaveAttribute("href", `tel:${author.phone}`);
    await expect(card.getByRole("link", { name: "Open photo 1 of 1 full size" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    const status = card.getByRole("group", { name: "Status" });
    await expect(status.getByRole("button", { name: "Open" })).toHaveAttribute("aria-pressed", "true");
    await status.getByRole("button", { name: "In progress" }).click();
    await expect(status.getByRole("button", { name: "In progress" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await row(item.id)).status).toBe("in_progress");
    // It stays on screen (no jumping) until the tab is opened again.
    await expect(card.getByText("In progress", { exact: true }).first()).toBeVisible();

    await tabs(page).getByRole("link", { name: /^In progress/ }).click();
    await expect(page).toHaveURL(/status=in_progress/);
    const moved = inboxCard(page, message);
    await moved.getByRole("group", { name: "Status" }).getByRole("button", { name: "Resolved" }).click();
    await expect.poll(async () => (await row(item.id)).status).toBe("resolved");

    // The public page shows the new status, still anonymous.
    await page.goto("/feedback?status=resolved");
    const pub = publicCard(page, message);
    await expect(pub).toHaveAccessibleName("Feedback from Anonymous");
    await expect(pub.getByText("Resolved", { exact: true })).toBeVisible();
  });

  test("the owner writes, edits and removes the public reply", async ({ page }, testInfo) => {
    const message = `Inbox reply ${runId()}-${testInfo.project.name}`;
    const [owner, author] = await Promise.all([createTestOwner("fb-owner"), createTestUser("fb-author")]);
    const item = await insertTestFeedback(author, { message });
    await signIn(page, owner, "/admin/feedback");

    const card = inboxCard(page, message);
    await card.getByRole("button", { name: "Reply publicly" }).click();
    let form = sheet(page);
    await expect(form.getByRole("heading", { name: "Reply publicly" })).toBeVisible();
    await expect(form).toContainText(message);
    await expect(form.getByRole("button", { name: "Post reply" })).toBeDisabled();
    await form.getByLabel("Your reply").fill("  Thanks! A new net arrives Friday.  ");
    await form.getByRole("button", { name: "Post reply" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Reply posted." })).toBeVisible();
    const reply = card.getByRole("region", { name: "Your public reply" });
    await expect(reply).toContainText("Thanks! A new net arrives Friday.");
    await expect(reply).toContainText("today");
    const saved = await row(item.id);
    expect(saved.owner_reply).toBe("Thanks! A new net arrives Friday.");
    expect(saved.replied_at).not.toBeNull();

    await card.getByRole("button", { name: "Edit reply" }).click();
    form = sheet(page);
    await form.getByLabel("Your reply").fill("New net is up!");
    await form.getByRole("button", { name: "Save reply" }).click();
    await expect(reply).toContainText("New net is up!");
    await expect.poll(async () => (await row(item.id)).owner_reply).toBe("New net is up!");

    await page.goto("/feedback");
    await expect(publicCard(page, message).getByRole("region", { name: /^Reply from / })).toContainText("New net is up!");

    await page.goto("/admin/feedback");
    await inboxCard(page, message).getByRole("button", { name: "Edit reply" }).click();
    await sheet(page).getByRole("button", { name: "Remove reply" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Reply removed." })).toBeVisible();
    await expect(inboxCard(page, message).getByRole("region", { name: "Your public reply" })).toHaveCount(0);
    await expect.poll(async () => (await row(item.id)).owner_reply).toBeNull();
    expect((await row(item.id)).replied_at).toBeNull();
  });

  test("the owner deletes abusive feedback, and its photos leave storage", async ({ page }, testInfo) => {
    const message = `Inbox abuse ${runId()}-${testInfo.project.name}`;
    const [owner, author] = await Promise.all([createTestOwner("fb-owner"), createTestUser("fb-author")]);
    const item = await insertTestFeedback(author, { message, photos: 2, reply: "Please keep it kind." });
    await signIn(page, owner, "/admin/feedback");

    await inboxCard(page, message).getByRole("button", { name: "Delete" }).click();
    const confirm = sheet(page);
    await expect(confirm.getByRole("heading", { name: "Delete this feedback?" })).toBeVisible();
    await expect(confirm).toContainText("with its 2 photos, reactions, comments and your reply");
    await expect(confirm).toContainText("E2E fb-author isn't notified");
    await confirm.getByRole("button", { name: "Yes, delete feedback" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Feedback deleted." })).toBeVisible();
    await expect(inboxCard(page, message)).toHaveCount(0);
    expect((await row(item.id)).deleted_at).not.toBeNull();
    await expect.poll(() => listFeedbackFiles(item.id)).toEqual([]);

    await page.goto("/feedback");
    await expect(publicCard(page, message)).toHaveCount(0);
  });

  test("customers can't open the feedback inbox", async ({ page }) => {
    const customer = await createTestUser("fb-customer");
    await signIn(page, customer, "/");
    await page.goto("/admin/feedback");
    await expect(page).not.toHaveURL(/\/admin/);
  });
});

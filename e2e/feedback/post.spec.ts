import { expect, test, type Page } from "@playwright/test";
import { admin, createTestUser, runId } from "../support/admin";
import { solidPng } from "../support/community";
import { insertTestFeedback, listFeedbackFiles } from "../support/feedback";
import { signIn } from "../support/ui";

const feedbackCard = (page: Page, message: string) =>
  page.getByRole("article").filter({ visible: true }).filter({ hasText: message });
const sheet = (page: Page) => page.getByRole("dialog").filter({ visible: true });
const feedbackButton = (page: Page) => page.getByRole("button", { name: "Feedback", exact: true }).filter({ visible: true });

const green = { name: "green.png", mimeType: "image/png", buffer: solidPng(400, 300, [22, 121, 74]) };

test.describe("Giving feedback", () => {
  test("a member sends anonymous feedback with a photo, then deletes it", async ({ page }, testInfo) => {
    const message = `Lights flicker ${runId()}-${testInfo.project.name}`;
    const member = await createTestUser("reporter");
    await signIn(page, member, "/feedback");

    await feedbackButton(page).click();
    const composer = sheet(page);
    await expect(composer.getByRole("heading", { name: "Give feedback" })).toBeVisible();
    const send = composer.getByRole("button", { name: "Send feedback" });
    await expect(send).toBeDisabled();

    await composer.getByLabel("Your feedback").fill(`  ${message}  `);
    await expect(send).toBeEnabled();
    await composer.locator('input[type="file"]').setInputFiles([green]);
    await expect(composer.getByRole("img", { name: "Photo 1 to post" })).toBeVisible();
    await composer.getByText("Post anonymously").click();
    await expect(composer.getByRole("checkbox", { name: /Post anonymously/ })).toBeChecked();
    await send.click();

    await expect(page.getByRole("status").filter({ hasText: "Thanks! Your feedback is on the page." })).toBeVisible({ timeout: 30_000 });
    await expect(composer).toHaveCount(0);
    const card = feedbackCard(page, message);
    await expect(card).toBeVisible();
    await expect(card).toHaveAccessibleName("Feedback from Anonymous");
    await expect(card.getByText("· Yours")).toBeVisible();
    await expect(card.getByText("Open", { exact: true })).toBeVisible();
    await expect(card.getByRole("img", { name: "Photo posted by Anonymous" })).toBeVisible();

    // Saved: trimmed, anonymous, the photo at <feedback id>/1-400x300.jpg (no user id in the path).
    const { data: saved } = await admin()
      .from("feedback")
      .select("id, message, is_anonymous, status, feedback_photos(path)")
      .eq("user_id", member.id)
      .single();
    expect(saved).toMatchObject({ message, is_anonymous: true, status: "open" });
    expect(saved!.feedback_photos.map((p) => p.path)).toEqual([`${saved!.id}/1-400x300.jpg`]);
    expect(await listFeedbackFiles(saved!.id)).toEqual([`${saved!.id}/1-400x300.jpg`]);

    await page.reload();
    const again = feedbackCard(page, message);
    await expect(again.getByText("· Yours")).toBeVisible();

    // Delete it: the row is soft-deleted and the photo file removed.
    await again.getByRole("button", { name: "Feedback options" }).click();
    await again.getByRole("menuitem", { name: "Delete feedback" }).click();
    const confirm = sheet(page);
    await expect(confirm.getByRole("heading", { name: "Delete this feedback?" })).toBeVisible();
    await expect(confirm.getByText(/with its photo, reactions and comments\./)).toBeVisible();
    await confirm.getByRole("button", { name: "Yes, delete feedback" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Feedback deleted." })).toBeVisible();
    await expect(feedbackCard(page, message)).toHaveCount(0);
    const { data: gone } = await admin().from("feedback").select("deleted_at").eq("id", saved!.id).single();
    expect(gone!.deleted_at).not.toBeNull();
    await expect.poll(() => listFeedbackFiles(saved!.id)).toEqual([]);
  });

  test("text-only feedback shows the member's name; only their own items have a menu", async ({ page }, testInfo) => {
    const tag = `${runId()}-${testInfo.project.name}`;
    const [member, other] = await Promise.all([createTestUser("named"), createTestUser("someone")]);
    await insertTestFeedback(other, { message: `Not mine ${tag}` });
    await insertTestFeedback(member, { message: `Replied ${tag}`, reply: "On it!" });
    await signIn(page, member, "/feedback");

    await expect(feedbackCard(page, `Not mine ${tag}`)).toBeVisible();
    await expect(feedbackCard(page, `Not mine ${tag}`).getByRole("button", { name: "Feedback options" })).toHaveCount(0);

    await feedbackButton(page).click();
    const composer = sheet(page);
    await composer.getByLabel("Your feedback").fill(`Add a bench ${tag}`);
    await composer.getByRole("button", { name: "Send feedback" }).click();
    const card = feedbackCard(page, `Add a bench ${tag}`);
    await expect(card).toHaveAccessibleName("Feedback from E2E named", { timeout: 30_000 });
    await expect(card.getByRole("img")).toHaveCount(0);

    // Feedback can't be edited: the menu only deletes. The sheet mentions the owner's reply.
    const replied = feedbackCard(page, `Replied ${tag}`);
    await replied.getByRole("button", { name: "Feedback options" }).click();
    await expect(replied.getByRole("menuitem")).toHaveCount(1);
    await replied.getByRole("menuitem", { name: "Delete feedback" }).click();
    await expect(sheet(page).getByText(/with its reactions, comments and the owner's reply\./)).toBeVisible();
  });

  test("the daily limit shows a clear message and leaves no stray files", async ({ page }) => {
    const member = await createTestUser("chatty");
    for (let i = 0; i < 5; i++) await insertTestFeedback(member, { message: `Chatty ${i}` });
    await signIn(page, member, "/feedback");

    const uploads: string[] = [];
    page.on("request", (req) => {
      const match = /\/storage\/v1\/object\/feedback-photos\/([^?]+)/.exec(req.url());
      if (req.method() === "POST" && match) uploads.push(decodeURIComponent(match[1]));
    });

    await feedbackButton(page).click();
    const composer = sheet(page);
    await composer.getByLabel("Your feedback").fill("One more thing");
    await composer.locator('input[type="file"]').setInputFiles([green]);
    await composer.getByRole("button", { name: "Send feedback" }).click();
    await expect(composer.getByRole("alert")).toHaveText("You've sent 5 feedback items in the last 24 hours. Please try again tomorrow.", {
      timeout: 30_000,
    });
    await expect(composer.getByRole("button", { name: "Send feedback" })).toBeEnabled();

    expect(uploads).toHaveLength(1);
    const folder = uploads[0].split("/")[0];
    await expect.poll(() => listFeedbackFiles(folder)).toEqual([]);
  });

  test("guests and incomplete profiles are sent to finish signing up first", async ({ page }) => {
    await page.goto("/feedback");
    await page.getByRole("link", { name: "Log in to give feedback" }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/login\?next=%2Ffeedback$/);

    const newcomer = await createTestUser("newbie", { complete: false });
    await signIn(page, newcomer, "/feedback");
    await page.goto("/feedback");
    await page.getByRole("link", { name: "Complete your profile to give feedback" }).click();
    await expect(page).toHaveURL(/\/profile\?welcome=1&next=%2Ffeedback$/);
  });
});

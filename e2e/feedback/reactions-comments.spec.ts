import { expect, test, type Page } from "@playwright/test";
import { admin, createTestUser, runId } from "../support/admin";
import { insertTestFeedback, insertTestFeedbackComment } from "../support/feedback";
import { signIn } from "../support/ui";

const feedbackCard = (page: Page, message: string) =>
  page.getByRole("article").filter({ visible: true }).filter({ hasText: message });
const sheet = (page: Page) => page.getByRole("dialog").filter({ visible: true });

async function reactionRows(feedbackId: string) {
  const { data } = await admin().from("reactions").select("type").eq("feedback_id", feedbackId);
  return (data ?? []).map((r) => r.type);
}

test.describe("Feedback reactions and comments", () => {
  test("a member likes, switches to haha, then removes it", async ({ page }, testInfo) => {
    const message = `React fb ${runId()}-${testInfo.project.name}`;
    const [author, member] = await Promise.all([createTestUser("critic"), createTestUser("reactor")]);
    const item = await insertTestFeedback(author, { message });
    await signIn(page, member, "/feedback");

    const card = feedbackCard(page, message);
    await card.getByRole("button", { name: "Like, 0" }).click();
    await expect(card.getByRole("button", { name: "Like, 1" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => reactionRows(item.id)).toEqual(["like"]);

    await card.getByRole("button", { name: "Haha, 0" }).click();
    await expect(card.getByRole("button", { name: "Haha, 1" })).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByRole("button", { name: "Like, 0" })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => reactionRows(item.id)).toEqual(["haha"]);

    await page.reload();
    await expect(feedbackCard(page, message).getByRole("button", { name: "Haha, 1" })).toHaveAttribute("aria-pressed", "true");

    await feedbackCard(page, message).getByRole("button", { name: "Haha, 1" }).click();
    await expect(feedbackCard(page, message).getByRole("button", { name: "Haha, 0" })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => reactionRows(item.id)).toEqual([]);
  });

  test("a member comments on feedback and deletes their own comment", async ({ page }, testInfo) => {
    const tag = `${runId()}-${testInfo.project.name}`;
    const [author, member] = await Promise.all([createTestUser("critic"), createTestUser("commenter")]);
    const item = await insertTestFeedback(author, { message: `Talk fb ${tag}` });
    await insertTestFeedbackComment(author, item.id, "Anyone else notice this?");
    await signIn(page, member, "/feedback");

    const card = feedbackCard(page, `Talk fb ${tag}`);
    await card.getByRole("button", { name: "1 comment" }).click();
    const comments = sheet(page);
    await expect(comments.getByRole("heading", { name: "Comments" })).toBeVisible();
    const theirs = comments.getByRole("listitem", { name: "Comment by E2E critic" });
    await expect(theirs).toContainText("Anyone else notice this?");
    await expect(theirs.getByRole("button", { name: "Delete" })).toHaveCount(0);
    // Not their feedback: no anonymity note.
    await expect(comments.getByText(/your comments show your name/)).toHaveCount(0);

    const box = comments.getByLabel("Write a comment");
    await box.fill(`  Same here ${tag}  `);
    await comments.getByRole("button", { name: "Send comment" }).click();

    const mine = comments.getByRole("listitem", { name: "Comment by E2E commenter" });
    await expect(mine).toContainText(`Same here ${tag}`);
    await expect(box).toHaveValue("");
    await expect(card.getByRole("button", { name: "2 comments" })).toBeVisible();
    const { data: saved } = await admin().from("comments").select("body").eq("feedback_id", item.id).eq("user_id", member.id).single();
    expect(saved!.body).toBe(`Same here ${tag}`);

    await mine.getByRole("button", { name: "Delete" }).click();
    await mine.getByRole("button", { name: "Yes, delete" }).click();
    await expect(mine).toHaveCount(0);
    await expect(card.getByRole("button", { name: "1 comment" })).toBeVisible();
    const { data: gone } = await admin().from("comments").select("deleted_at").eq("feedback_id", item.id).eq("user_id", member.id).single();
    expect(gone!.deleted_at).not.toBeNull();
  });

  test("on their own anonymous feedback, the author is told comments show their name", async ({ page }, testInfo) => {
    const message = `Anon talk ${runId()}-${testInfo.project.name}`;
    const author = await createTestUser("hidden");
    const item = await insertTestFeedback(author, { message, anonymous: true });
    await signIn(page, author, "/feedback");

    await feedbackCard(page, message).getByRole("button", { name: "Comment", exact: true }).click();
    const comments = sheet(page);
    await expect(comments.getByText("Your feedback is anonymous, but your comments show your name.")).toBeVisible();
    await comments.getByLabel("Write a comment").fill("Thanks for fixing it!");
    await comments.getByRole("button", { name: "Send comment" }).click();
    await expect(comments.getByRole("listitem", { name: "Comment by E2E hidden" })).toContainText("Thanks for fixing it!");
    // The card itself stays anonymous.
    await expect(feedbackCard(page, message)).toHaveAccessibleName("Feedback from Anonymous");
    const { count } = await admin().from("comments").select("id", { count: "exact", head: true }).eq("feedback_id", item.id);
    expect(count).toBe(1);
  });

  test("guests can read feedback comments but log in to write one", async ({ page }, testInfo) => {
    const message = `Read only fb ${runId()}-${testInfo.project.name}`;
    const author = await createTestUser("critic");
    const item = await insertTestFeedback(author, { message });
    await insertTestFeedbackComment(author, item.id, "Fixed now, thanks!");

    await page.goto("/feedback");
    await feedbackCard(page, message).getByRole("button", { name: "1 comment" }).click();
    const comments = sheet(page);
    await expect(comments.getByRole("listitem", { name: "Comment by E2E critic" })).toContainText("Fixed now, thanks!");
    await expect(comments.getByLabel("Write a comment")).toHaveCount(0);
    await comments.getByRole("link", { name: "Log in to comment" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Ffeedback$/);
  });
});

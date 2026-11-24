import { expect, test, type Page } from "@playwright/test";
import { admin, createTestOwner, createTestUser, runId } from "../support/admin";
import { insertTestComment, insertTestPost, listCommunityFiles } from "../support/community";
import { insertTestFeedback, insertTestFeedbackComment } from "../support/feedback";
import { expectNoHorizontalScroll, heading, signIn } from "../support/ui";

/** Other runs share the database, so always find this test's own card by its text. */
const card = (page: Page, kind: "Post" | "Comment", text: string) =>
  page.getByRole("article", { name: new RegExp(`^${kind} by`) }).filter({ visible: true }).filter({ hasText: text });
const sheet = (page: Page) => page.getByRole("dialog").filter({ visible: true });

test.describe("Admin moderation", () => {
  test("the owner deletes a post, and its photos leave storage", async ({ page }, testInfo) => {
    const caption = `Moderate post ${runId()}-${testInfo.project.name}`;
    const [owner, author, fan] = await Promise.all([createTestOwner("mod-owner"), createTestUser("mod-author"), createTestUser("mod-fan")]);
    const post = await insertTestPost(author, { caption, photos: 2 });
    await insertTestComment(fan, post.id, "Nice!");

    await signIn(page, owner, "/admin/moderation");
    await expect(heading(page, "Moderation")).toBeVisible();
    await expect(page.getByRole("link", { name: "Moderation" }).filter({ visible: true }).first()).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Moderation" }).getByRole("link", { name: /^Posts/ })).toHaveAttribute("aria-current", "page");

    const item = card(page, "Post", caption);
    await expect(item).toContainText("E2E mod-author");
    await expect(item).toContainText(author.email);
    await expect(item).toContainText("1 comment");
    await expect(item.getByRole("img", { name: /Photo [12] of 2/ })).toHaveCount(2);
    await expectNoHorizontalScroll(page);

    await item.getByRole("button", { name: "Delete post" }).click();
    const confirm = sheet(page);
    await expect(confirm.getByRole("heading", { name: "Delete this post?" })).toBeVisible();
    await expect(confirm).toContainText("E2E mod-author isn't notified");
    await confirm.getByRole("button", { name: "Yes, delete post" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Post deleted." })).toBeVisible();
    await expect(card(page, "Post", caption)).toHaveCount(0);
    const { data } = await admin().from("posts").select("deleted_at").eq("id", post.id).single();
    expect(data!.deleted_at).not.toBeNull();
    await expect.poll(() => listCommunityFiles(author.id)).toEqual([]);

    await page.goto("/community");
    await expect(page.getByRole("article").filter({ visible: true }).filter({ hasText: caption })).toHaveCount(0);
  });

  test("the owner deletes a comment", async ({ page }, testInfo) => {
    const tag = `${runId()}-${testInfo.project.name}`;
    const [owner, author, rude] = await Promise.all([createTestOwner("mod-owner"), createTestUser("mod-author"), createTestUser("mod-rude")]);
    const post = await insertTestPost(author, { caption: `Commented ${tag}` });
    await insertTestComment(rude, post.id, `Rude words ${tag}`);
    await insertTestComment(author, post.id, `Kind words ${tag}`);

    await signIn(page, owner, "/admin/moderation?view=comments");
    const rudeItem = card(page, "Comment", `Rude words ${tag}`);
    await expect(rudeItem).toContainText(`On E2E mod-author's post: “Commented ${tag}”`);
    await expect(rudeItem).toContainText(rude.email);

    await rudeItem.getByRole("button", { name: "Delete comment" }).click();
    await sheet(page).getByRole("button", { name: "Yes, delete comment" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Comment deleted." })).toBeVisible();
    await expect(card(page, "Comment", `Rude words ${tag}`)).toHaveCount(0);
    await expect(card(page, "Comment", `Kind words ${tag}`)).toBeVisible();

    const { data } = await admin().from("comments").select("body, deleted_at").eq("post_id", post.id);
    expect(data!.find((c) => c.body.startsWith("Rude"))!.deleted_at).not.toBeNull();
    expect(data!.find((c) => c.body.startsWith("Kind"))!.deleted_at).toBeNull();
  });

  test("feedback comments are listed too; comments on deleted posts or feedback are not", async ({ page }, testInfo) => {
    const tag = `${runId()}-${testInfo.project.name}`;
    const [owner, author, talker] = await Promise.all([createTestOwner("mod-owner"), createTestUser("mod-author"), createTestUser("mod-talker")]);
    const item = await insertTestFeedback(author, { message: `Feedback ${tag}`, anonymous: true });
    const goneItem = await insertTestFeedback(author, { message: `Gone feedback ${tag}`, deleted: true });
    const gonePost = await insertTestPost(author, { caption: `Gone post ${tag}`, deleted: true });
    await insertTestFeedbackComment(talker, item.id, `On feedback ${tag}`);
    await insertTestFeedbackComment(talker, goneItem.id, `Hidden one ${tag}`);
    await insertTestComment(talker, gonePost.id, `Hidden two ${tag}`);

    await signIn(page, owner, "/admin/moderation?view=comments");
    const comment = card(page, "Comment", `On feedback ${tag}`);
    // The owner sees the real author, even on anonymous feedback.
    await expect(comment).toContainText(`On E2E mod-author's feedback: “Feedback ${tag}”`);
    await expect(card(page, "Comment", `Hidden one ${tag}`)).toHaveCount(0);
    await expect(card(page, "Comment", `Hidden two ${tag}`)).toHaveCount(0);

    await comment.getByRole("button", { name: "Delete comment" }).click();
    await expect(sheet(page)).toContainText("disappears from the feedback page");
    await sheet(page).getByRole("button", { name: "Yes, delete comment" }).click();
    await expect(card(page, "Comment", `On feedback ${tag}`)).toHaveCount(0);
    const { data } = await admin().from("comments").select("deleted_at").eq("feedback_id", item.id).single();
    expect(data!.deleted_at).not.toBeNull();
  });

  test("customers can't open moderation", async ({ page }) => {
    const customer = await createTestUser("mod-customer");
    await signIn(page, customer, "/");
    await page.goto("/admin/moderation");
    await expect(page).not.toHaveURL(/\/admin/);
  });
});

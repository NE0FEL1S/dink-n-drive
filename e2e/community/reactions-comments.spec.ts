import { expect, test, type Page } from "@playwright/test";
import { admin, createTestUser, runId } from "../support/admin";
import { insertTestComment, insertTestPost } from "../support/community";
import { signIn } from "../support/ui";

const postCard = (page: Page, caption: string) =>
  page.getByRole("article").filter({ visible: true }).filter({ hasText: caption });
const sheet = (page: Page) => page.getByRole("dialog").filter({ visible: true });

async function reactionRows(postId: string) {
  const { data } = await admin().from("reactions").select("type").eq("post_id", postId);
  return (data ?? []).map((r) => r.type);
}

test.describe("Reactions and comments", () => {
  test("a member likes, switches to haha, then removes it", async ({ page }, testInfo) => {
    const caption = `React ${runId()}-${testInfo.project.name}`;
    const [author, member] = await Promise.all([createTestUser("poster"), createTestUser("reactor")]);
    const post = await insertTestPost(author, { caption });
    await signIn(page, member, "/community");

    const card = postCard(page, caption);
    await card.getByRole("button", { name: "Like, 0" }).click();
    await expect(card.getByRole("button", { name: "Like, 1" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => reactionRows(post.id)).toEqual(["like"]);

    await card.getByRole("button", { name: "Haha, 0" }).click();
    await expect(card.getByRole("button", { name: "Haha, 1" })).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByRole("button", { name: "Like, 0" })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => reactionRows(post.id)).toEqual(["haha"]);

    await page.reload();
    await expect(postCard(page, caption).getByRole("button", { name: "Haha, 1" })).toHaveAttribute("aria-pressed", "true");

    await postCard(page, caption).getByRole("button", { name: "Haha, 1" }).click();
    await expect(postCard(page, caption).getByRole("button", { name: "Haha, 0" })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => reactionRows(post.id)).toEqual([]);
  });

  test("a member comments and deletes their own comment", async ({ page }, testInfo) => {
    const tag = `${runId()}-${testInfo.project.name}`;
    const [author, member] = await Promise.all([createTestUser("poster"), createTestUser("commenter")]);
    const post = await insertTestPost(author, { caption: `Talk ${tag}` });
    await insertTestComment(author, post.id, "First! Who's playing Saturday?");
    await signIn(page, member, "/community");

    const card = postCard(page, `Talk ${tag}`);
    await card.getByRole("button", { name: "1 comment" }).click();
    const comments = sheet(page);
    await expect(comments.getByRole("heading", { name: "Comments" })).toBeVisible();
    const theirs = comments.getByRole("listitem", { name: "Comment by E2E poster" });
    await expect(theirs).toContainText("First! Who's playing Saturday?");
    await expect(theirs.getByRole("button", { name: "Delete" })).toHaveCount(0);

    const box = comments.getByLabel("Write a comment");
    await expect(comments.getByRole("button", { name: "Send comment" })).toBeDisabled();
    await box.fill(`  Count me in ${tag}  `);
    await comments.getByRole("button", { name: "Send comment" }).click();

    const mine = comments.getByRole("listitem", { name: "Comment by E2E commenter" });
    await expect(mine).toContainText(`Count me in ${tag}`);
    await expect(mine).toContainText("Just now");
    await expect(box).toHaveValue("");
    await expect(card.getByRole("button", { name: "2 comments" })).toBeVisible();
    const { data: saved } = await admin().from("comments").select("body").eq("post_id", post.id).eq("user_id", member.id).single();
    expect(saved!.body).toBe(`Count me in ${tag}`);

    await mine.getByRole("button", { name: "Delete" }).click();
    await expect(mine.getByText("Delete this comment?")).toBeVisible();
    await mine.getByRole("button", { name: "Yes, delete" }).click();
    await expect(mine).toHaveCount(0);
    await expect(card.getByRole("button", { name: "1 comment" })).toBeVisible();
    const { data: gone } = await admin().from("comments").select("deleted_at").eq("post_id", post.id).eq("user_id", member.id).single();
    expect(gone!.deleted_at).not.toBeNull();
  });

  test("the 30-an-hour comment limit shows a clear message", async ({ page }, testInfo) => {
    const caption = `Chatty ${runId()}-${testInfo.project.name}`;
    const member = await createTestUser("chatty");
    const post = await insertTestPost(member, { caption });
    const { error } = await admin()
      .from("comments")
      .insert(Array.from({ length: 30 }, (_, i) => ({ user_id: member.id, post_id: post.id, body: `c${i}` })));
    expect(error).toBeNull();
    await signIn(page, member, "/community");

    await postCard(page, caption).getByRole("button", { name: "30 comments" }).click();
    const comments = sheet(page);
    await comments.getByLabel("Write a comment").fill("One more");
    await comments.getByRole("button", { name: "Send comment" }).click();
    await expect(comments.getByRole("alert")).toHaveText(
      "You've commented 30 times in the last hour. Please take a short break and try again later.",
    );
    await expect(comments.getByLabel("Write a comment")).toHaveValue("One more");
  });

  test("guests can read comments but log in to write one", async ({ page }, testInfo) => {
    const caption = `Read only ${runId()}-${testInfo.project.name}`;
    const author = await createTestUser("poster");
    const post = await insertTestPost(author, { caption });
    await insertTestComment(author, post.id, "Courts are open till midnight.");

    await page.goto("/community");
    await postCard(page, caption).getByRole("button", { name: "1 comment" }).click();
    const comments = sheet(page);
    await expect(comments.getByRole("listitem", { name: "Comment by E2E poster" })).toContainText("Courts are open till midnight.");
    await expect(comments.getByLabel("Write a comment")).toHaveCount(0);
    await comments.getByRole("link", { name: "Log in to comment" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fcommunity$/);
  });
});

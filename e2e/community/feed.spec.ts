import { expect, test, type Page } from "@playwright/test";
import { createTestUser, runId } from "../support/admin";
import { insertTestComment, insertTestPost, insertTestReaction } from "../support/community";
import { expectNoHorizontalScroll, heading, signIn } from "../support/ui";

/** Other runs share the database (and the feed), so always find this test's own post by its caption. */
const postCard = (page: Page, caption: string) =>
  page.getByRole("article").filter({ visible: true }).filter({ hasText: caption });

test.describe("Community feed", () => {
  test("guests browse posts, and reacting sends them to log in", async ({ page }, testInfo) => {
    const tag = `${runId()}-${testInfo.project.name}`;
    const [author, fan] = await Promise.all([createTestUser("poster"), createTestUser("fan")]);

    const single = await insertTestPost(author, { caption: `Feed check ${tag}\nSecond line`, editedAt: new Date() });
    await insertTestPost(author, { caption: `Two photos ${tag}`, photos: 2 });
    await insertTestPost(author, { caption: `Deleted ${tag}`, deleted: true });
    await insertTestReaction(fan, single.id, "like");
    await insertTestReaction(author, single.id, "haha");
    await insertTestComment(fan, single.id, "Nice game!");

    await page.goto("/community");
    await expect(heading(page, "Community")).toBeVisible();

    const card = postCard(page, `Feed check ${tag}`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAccessibleName("Post by E2E poster");
    await expect(card.getByText("E2E poster")).toBeVisible();
    await expect(card.getByText(/Just now|min ago/)).toBeVisible();
    await expect(card.getByText("Edited")).toBeVisible();
    await expect(card.getByText("Second line")).toBeVisible();
    await expect(card.getByRole("link", { name: "Like, 1" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Haha, 1" })).toBeVisible();
    await expect(card.getByRole("link", { name: "1 comment" })).toBeVisible();

    // One photo keeps its own shape (the 800x600 in its name → 4:3).
    const photo = card.getByRole("img", { name: "Photo posted by E2E poster" });
    await expect(photo).toBeVisible();
    const box = await photo.boundingBox();
    expect(box!.width / box!.height).toBeCloseTo(4 / 3, 1);

    // Two photos sit side by side.
    const pair = postCard(page, `Two photos ${tag}`);
    await expect(pair.getByRole("img", { name: /Photo [12] of 2 posted by E2E poster/ })).toHaveCount(2);
    await expect(pair.getByRole("link", { name: "Comment" })).toBeVisible();

    // Deleted posts never show.
    await expect(page.getByText(`Deleted ${tag}`)).toHaveCount(0);

    await expectNoHorizontalScroll(page);

    await card.getByRole("link", { name: "Like, 1" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fcommunity$/);
  });

  test("older posts load with Load more, without repeats", async ({ page }, testInfo) => {
    const tag = `${runId()}-${testInfo.project.name}`;
    const author = await createTestUser("pager");
    // Over an hour old, so they don't count toward the 5-posts-an-hour limit, and older than
    // anything posted during this run. #0 is the newest, #10 the oldest.
    const start = Date.now() - 2 * 3_600_000;
    for (let i = 0; i <= 10; i++) {
      await insertTestPost(author, { caption: `Page ${tag} #${i}`, createdAt: new Date(start - i * 60_000) });
    }

    await page.goto("/community");
    const oldest = postCard(page, `Page ${tag} #10`);
    const more = page.getByRole("button", { name: "Load more posts" }).filter({ visible: true });
    await expect(page.getByRole("article").filter({ visible: true }).first()).toBeVisible();

    for (let clicks = 0; clicks < 8 && !(await oldest.isVisible()); clicks++) {
      await expect(more).toBeEnabled();
      const before = await page.getByRole("article").filter({ visible: true }).count();
      await more.click();
      await expect.poll(() => page.getByRole("article").filter({ visible: true }).count()).toBeGreaterThan(before);
    }
    await expect(oldest).toBeVisible();

    const mine = page.getByRole("article").filter({ visible: true }).filter({ hasText: `Page ${tag} #` });
    await expect(mine).toHaveCount(11);
    await expect(mine.first()).toContainText(`Page ${tag} #0`);
    await expect(mine.last()).toContainText(`Page ${tag} #10`);
    await expect(mine.last().getByText("2 h ago")).toBeVisible();
  });

  test("members see their own reaction", async ({ page }, testInfo) => {
    const tag = `${runId()}-${testInfo.project.name}`;
    const [author, member] = await Promise.all([createTestUser("poster"), createTestUser("member")]);
    const post = await insertTestPost(author, { caption: `Mine ${tag}` });
    await insertTestReaction(member, post.id, "like");

    await signIn(page, member, "/community");
    const card = postCard(page, `Mine ${tag}`);
    await expect(card.getByRole("img", { name: "Like, 1, your reaction" })).toBeVisible();
    await expect(card.getByRole("img", { name: "Haha, 0" })).toBeVisible();
  });
});

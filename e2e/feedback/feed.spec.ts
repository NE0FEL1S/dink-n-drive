import { expect, test, type Page } from "@playwright/test";
import { createTestUser, runId } from "../support/admin";
import { insertTestFeedback, insertTestFeedbackComment, insertTestFeedbackReaction } from "../support/feedback";
import { expectNoHorizontalScroll, heading, signIn } from "../support/ui";

/** Other runs share the database (and the feed), so always find this test's own item by its message. */
const feedbackCard = (page: Page, message: string) =>
  page.getByRole("article").filter({ visible: true }).filter({ hasText: message });

const filter = (page: Page) => page.getByRole("navigation", { name: "Filter feedback by status" }).filter({ visible: true });

test.describe("Feedback feed", () => {
  test("guests read feedback, replies and anonymous items; reacting sends them to log in", async ({ page }, testInfo) => {
    const tag = `${runId()}-${testInfo.project.name}`;
    const [author, fan] = await Promise.all([createTestUser("critic"), createTestUser("fan")]);

    const named = await insertTestFeedback(author, {
      message: `Net check ${tag}\nSecond line`,
      photos: 1,
      status: "in_progress",
      reply: "Thanks! New net arrives Friday.",
    });
    await insertTestFeedback(author, { message: `Anon check ${tag}`, anonymous: true, photos: 2, status: "resolved" });
    await insertTestFeedback(author, { message: `Deleted ${tag}`, deleted: true });
    await insertTestFeedbackReaction(fan, named.id, "like");
    await insertTestFeedbackReaction(author, named.id, "haha");
    await insertTestFeedbackComment(fan, named.id, "Agreed!");

    await page.goto("/feedback");
    await expect(heading(page, "Feedback")).toBeVisible();

    const card = feedbackCard(page, `Net check ${tag}`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAccessibleName("Feedback from E2E critic");
    await expect(card.getByText("E2E critic")).toBeVisible();
    await expect(card.getByText("In progress", { exact: true })).toBeVisible();
    await expect(card.getByText("Second line")).toBeVisible();
    const reply = card.getByRole("region", { name: /^Reply from / });
    await expect(reply).toBeVisible();
    await expect(reply.getByText("Thanks! New net arrives Friday.")).toBeVisible();
    await expect(card.getByRole("link", { name: "Like, 1" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Haha, 1" })).toBeVisible();
    await expect(card.getByText("1 comment")).toBeVisible();

    // One photo keeps its own shape (the 800x600 in its name → 4:3).
    const photo = card.getByRole("img", { name: "Photo posted by E2E critic" });
    await expect(photo).toBeVisible();
    const box = await photo.boundingBox();
    expect(box!.width / box!.height).toBeCloseTo(4 / 3, 1);

    // Anonymous: no name anywhere on the card, two photos, Resolved, no reply.
    const anon = feedbackCard(page, `Anon check ${tag}`);
    await expect(anon).toHaveAccessibleName("Feedback from Anonymous");
    await expect(anon.getByText("Anonymous", { exact: true })).toBeVisible();
    await expect(anon).not.toContainText("E2E critic");
    await expect(anon.getByText("Resolved", { exact: true })).toBeVisible();
    await expect(anon.getByRole("img", { name: /Photo [12] of 2 posted by Anonymous/ })).toHaveCount(2);
    await expect(anon.getByRole("region", { name: /^Reply from / })).toHaveCount(0);
    for (const src of await anon.getByRole("img").evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src))) {
      expect(src).not.toContain(author.id);
    }

    // Deleted feedback never shows.
    await expect(page.getByText(`Deleted ${tag}`)).toHaveCount(0);

    await expectNoHorizontalScroll(page);

    await card.getByRole("link", { name: "Like, 1" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Ffeedback$/);
  });

  test("status filters show one status at a time; All is the default", async ({ page }, testInfo) => {
    const tag = `${runId()}-${testInfo.project.name}`;
    const author = await createTestUser("filters");
    await insertTestFeedback(author, { message: `Open item ${tag}` });
    await insertTestFeedback(author, { message: `Resolved item ${tag}`, status: "resolved" });

    await page.goto("/feedback");
    await expect(filter(page).getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
    await expect(feedbackCard(page, `Open item ${tag}`)).toBeVisible();
    await expect(feedbackCard(page, `Resolved item ${tag}`)).toBeVisible();
    await expectNoHorizontalScroll(page);

    await filter(page).getByRole("link", { name: "Resolved" }).click();
    await expect(page).toHaveURL(/\/feedback\?status=resolved$/);
    await expect(filter(page).getByRole("link", { name: "Resolved" })).toHaveAttribute("aria-current", "page");
    await expect(feedbackCard(page, `Resolved item ${tag}`)).toBeVisible();
    await expect(feedbackCard(page, `Open item ${tag}`)).toHaveCount(0);
    // Every card on this filter is resolved.
    const cards = page.getByRole("article").filter({ visible: true });
    await expect(cards.filter({ hasNotText: "Resolved" })).toHaveCount(0);

    await filter(page).getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/feedback\?status=open$/);
    await expect(feedbackCard(page, `Open item ${tag}`)).toBeVisible();
    await expect(feedbackCard(page, `Resolved item ${tag}`)).toHaveCount(0);

    await filter(page).getByRole("link", { name: "All" }).click();
    await expect(page).toHaveURL(/\/feedback$/);
    await expect(feedbackCard(page, `Resolved item ${tag}`)).toBeVisible();
  });

  test("older feedback loads with Load more, keeping the filter", async ({ page }, testInfo) => {
    const tag = `${runId()}-${testInfo.project.name}`;
    const author = await createTestUser("pager");
    // Over a day old, so they don't count toward the 5-a-day limit, and older than anything
    // made during this run. #0 is the newest, #10 the oldest.
    const start = Date.now() - 26 * 3_600_000;
    for (let i = 0; i <= 10; i++) {
      await insertTestFeedback(author, { message: `Page ${tag} #${i}`, status: "resolved", createdAt: new Date(start - i * 60_000) });
    }

    await page.goto("/feedback?status=resolved");
    const oldest = feedbackCard(page, `Page ${tag} #10`);
    const more = page.getByRole("button", { name: "Load more feedback" }).filter({ visible: true });
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
    await expect(page.getByRole("article").filter({ visible: true }).filter({ hasNotText: "Resolved" })).toHaveCount(0);
  });

  test("the author sees their anonymous feedback as theirs; others don't", async ({ page }, testInfo) => {
    const tag = `${runId()}-${testInfo.project.name}`;
    const author = await createTestUser("secret");
    await insertTestFeedback(author, { message: `Mine anon ${tag}`, anonymous: true });

    await signIn(page, author, "/feedback");
    const card = feedbackCard(page, `Mine anon ${tag}`);
    await expect(card.getByText("Anonymous (you)")).toBeVisible();
    await expect(card).toHaveAccessibleName("Feedback from Anonymous");
  });
});

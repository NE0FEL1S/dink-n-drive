import { expect, test, type Page } from "@playwright/test";
import { admin, createTestUser, runId } from "../support/admin";
import { insertTestPost, listCommunityFiles, solidPng } from "../support/community";
import { signIn } from "../support/ui";

const postCard = (page: Page, caption: string) =>
  page.getByRole("article").filter({ visible: true }).filter({ hasText: caption });
const sheet = (page: Page) => page.getByRole("dialog").filter({ visible: true });
const postButton = (page: Page) => page.getByRole("button", { name: "Post", exact: true }).filter({ visible: true });

const green = { name: "green.png", mimeType: "image/png", buffer: solidPng(400, 300, [22, 121, 74]) };
const orange = { name: "orange.png", mimeType: "image/png", buffer: solidPng(300, 400, [191, 74, 18]) };
const navy = { name: "navy.png", mimeType: "image/png", buffer: solidPng(200, 200, [15, 27, 51]) };

test.describe("Posting to the community", () => {
  test("a member posts two photos with a caption", async ({ page }, testInfo) => {
    const caption = `New post ${runId()}-${testInfo.project.name}`;
    const member = await createTestUser("writer");
    await signIn(page, member, "/community");

    await postButton(page).click();
    const composer = sheet(page);
    await expect(composer.getByRole("heading", { name: "New post" })).toBeVisible();
    await expect(composer.getByRole("button", { name: "Post", exact: true })).toBeDisabled();

    // Three picked → only the first two are kept.
    await composer.locator('input[type="file"]').setInputFiles([green, orange, navy]);
    await expect(composer.getByText("A post can have up to 2 photos, so we kept the first 2.")).toBeVisible();
    await expect(composer.getByRole("img", { name: /Photo [12] to post/ })).toHaveCount(2);

    // Remove one, add it back.
    await composer.getByRole("button", { name: "Remove photo 2" }).click();
    await expect(composer.getByRole("button", { name: "Add another" })).toBeVisible();
    await composer.locator('input[type="file"]').setInputFiles([orange]);
    await expect(composer.getByRole("img", { name: /Photo [12] to post/ })).toHaveCount(2);

    await composer.getByLabel("Caption (optional)").fill(`  ${caption}  `);
    await composer.getByRole("button", { name: "Post", exact: true }).click();

    await expect(page.getByRole("status").filter({ hasText: "Posted!" })).toBeVisible({ timeout: 30_000 });
    await expect(composer).toHaveCount(0);
    const card = postCard(page, caption);
    await expect(card).toBeVisible();
    await expect(card.getByRole("img", { name: /Photo [12] of 2 posted by E2E writer/ })).toHaveCount(2);
    await expect(card.getByText("Just now")).toBeVisible();

    // Saved: trimmed caption, photos as <n>-<w>x<h>.jpg in the member's folder, in order.
    const { data: post } = await admin().from("posts").select("id, caption, post_photos(path, position)").eq("user_id", member.id).single();
    expect(post!.caption).toBe(caption);
    const paths = post!.post_photos.sort((a, b) => a.position - b.position).map((p) => p.path);
    expect(paths).toEqual([`${member.id}/${post!.id}/1-400x300.jpg`, `${member.id}/${post!.id}/2-300x400.jpg`]);
    expect((await listCommunityFiles(member.id)).sort()).toEqual(paths);

    // Still there after a reload.
    await page.reload();
    await expect(postCard(page, caption)).toBeVisible();
  });

  test("the author edits the caption, then deletes the post", async ({ page }, testInfo) => {
    const tag = `${runId()}-${testInfo.project.name}`;
    const [member, other] = await Promise.all([createTestUser("editor"), createTestUser("other")]);
    const post = await insertTestPost(member, { caption: `Before ${tag}`, photos: 2 });
    await insertTestPost(other, { caption: `Not mine ${tag}` });
    await signIn(page, member, "/community");

    await expect(postCard(page, `Not mine ${tag}`)).toBeVisible();
    await expect(postCard(page, `Not mine ${tag}`).getByRole("button", { name: "Post options" })).toHaveCount(0);

    const card = postCard(page, `Before ${tag}`);
    await card.getByRole("button", { name: "Post options" }).click();
    await card.getByRole("menuitem", { name: "Edit caption" }).click();
    const edit = sheet(page);
    await expect(edit.getByText("Photos can't be changed.")).toBeVisible();
    await expect(edit.getByRole("button", { name: "Save caption" })).toBeDisabled();
    await edit.getByLabel("Caption").fill(`After ${tag}`);
    await edit.getByRole("button", { name: "Save caption" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Caption saved." })).toBeVisible();
    const edited = postCard(page, `After ${tag}`);
    await expect(edited.getByText("Edited")).toBeVisible();
    const { data: saved } = await admin().from("posts").select("caption, edited_at").eq("id", post.id).single();
    expect(saved).toMatchObject({ caption: `After ${tag}` });
    expect(saved!.edited_at).not.toBeNull();

    await edited.getByRole("button", { name: "Post options" }).click();
    await edited.getByRole("menuitem", { name: "Delete post" }).click();
    const confirm = sheet(page);
    await expect(confirm.getByRole("heading", { name: "Delete this post?" })).toBeVisible();
    await expect(confirm.getByText(/with its 2 photos, reactions and comments/)).toBeVisible();
    await confirm.getByRole("button", { name: "Yes, delete post" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Post deleted." })).toBeVisible();
    await expect(postCard(page, `After ${tag}`)).toHaveCount(0);
    const { data: gone } = await admin().from("posts").select("deleted_at").eq("id", post.id).single();
    expect(gone!.deleted_at).not.toBeNull();
    await expect.poll(() => listCommunityFiles(member.id)).toEqual([]);
  });

  test("the hourly limit shows a clear message and leaves no stray files", async ({ page }) => {
    const member = await createTestUser("busy");
    const seeded: string[] = [];
    for (let i = 0; i < 5; i++) seeded.push(...(await insertTestPost(member, { caption: `Busy ${i}` })).paths);
    await signIn(page, member, "/community");

    await postButton(page).click();
    const composer = sheet(page);
    await composer.locator('input[type="file"]').setInputFiles([green]);
    await composer.getByRole("button", { name: "Post", exact: true }).click();
    await expect(composer.getByRole("alert")).toHaveText("You've posted 5 times in the last hour. Please try again a little later.", {
      timeout: 30_000,
    });
    await expect(composer.getByRole("button", { name: "Post", exact: true })).toBeEnabled();
    await expect.poll(async () => (await listCommunityFiles(member.id)).sort()).toEqual(seeded.sort());
  });

  test("guests and incomplete profiles are sent to finish signing up first", async ({ page }) => {
    await page.goto("/community");
    await page.getByRole("link", { name: "Log in to post" }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/login\?next=%2Fcommunity$/);

    const newcomer = await createTestUser("newcomer", { complete: false });
    await signIn(page, newcomer, "/community");
    await page.goto("/community");
    await page.getByRole("link", { name: "Complete your profile to post" }).click();
    await expect(page).toHaveURL(/\/profile\?welcome=1&next=%2Fcommunity$/);
  });
});

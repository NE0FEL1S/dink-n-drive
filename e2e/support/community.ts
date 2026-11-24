import { randomUUID } from "node:crypto";
import { admin, type TestUser } from "./admin";
import { RECEIPT_PNG } from "./booking";

/**
 * Community test data. Posts are inserted directly with the secret key (create_post() needs
 * the author's own session) and belong to tagged test users, so deleting the user removes
 * them; their photo files are removed by cleanupTestData().
 *
 * Photos are a tiny PNG named with a pretend size (`1-800x600.png`): the feed reads the
 * shape from the name, like real uploads (Phase 5C).
 */
export async function insertTestPost(
  author: Pick<TestUser, "id">,
  opts: { caption: string; photos?: 1 | 2; createdAt?: Date; editedAt?: Date; deleted?: boolean; sizes?: string[] },
) {
  const id = randomUUID();
  const count = opts.photos ?? 1;
  const sizes = opts.sizes ?? ["800x600", "600x800"];
  const paths = Array.from({ length: count }, (_, i) => `${author.id}/${id}/${i + 1}-${sizes[i] ?? "800x800"}.png`);

  for (const path of paths) {
    const { error } = await admin().storage.from("community-photos").upload(path, RECEIPT_PNG, { contentType: "image/png" });
    if (error) throw new Error(`insertTestPost upload: ${error.message}`);
  }
  const { error } = await admin()
    .from("posts")
    .insert({
      id,
      user_id: author.id,
      caption: opts.caption,
      created_at: opts.createdAt?.toISOString(),
      edited_at: opts.editedAt?.toISOString() ?? null,
      deleted_at: opts.deleted ? new Date().toISOString() : null,
    });
  if (error) throw new Error(`insertTestPost: ${error.message}`);
  const { error: photoError } = await admin()
    .from("post_photos")
    .insert(paths.map((path, i) => ({ post_id: id, path, position: i + 1 })));
  if (photoError) throw new Error(`insertTestPost photos: ${photoError.message}`);
  return { id, paths };
}

/** What set_post_reaction() does, without the reacting user's session. */
export async function insertTestReaction(user: Pick<TestUser, "id">, postId: string, type: "like" | "haha") {
  const { error } = await admin().from("reactions").insert({ user_id: user.id, post_id: postId, type });
  if (error) throw new Error(`insertTestReaction: ${error.message}`);
}

/** What comment_on_post() does, without the commenter's session. */
export async function insertTestComment(user: Pick<TestUser, "id">, postId: string, body: string) {
  const { error } = await admin().from("comments").insert({ user_id: user.id, post_id: postId, body });
  if (error) throw new Error(`insertTestComment: ${error.message}`);
}

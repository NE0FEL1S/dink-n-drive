import { randomUUID } from "node:crypto";
import { admin, type TestUser } from "./admin";
import { RECEIPT_PNG } from "./booking";

type FeedbackStatus = "open" | "in_progress" | "resolved";

/**
 * Feedback test data. Items are inserted directly with the secret key (create_feedback() needs
 * the author's own session) and belong to tagged test users, so deleting the user removes them;
 * cleanupTestData() removes their photo files first.
 *
 * Photos are a tiny PNG at `<feedback_id>/<n>-<w>x<h>.png` (never the user id; SPEC §8).
 */
export async function insertTestFeedback(
  author: Pick<TestUser, "id">,
  opts: {
    message: string;
    anonymous?: boolean;
    photos?: 0 | 1 | 2;
    status?: FeedbackStatus;
    reply?: string;
    createdAt?: Date;
    deleted?: boolean;
  },
) {
  const id = randomUUID();
  const sizes = ["800x600", "600x800"];
  const paths = Array.from({ length: opts.photos ?? 0 }, (_, i) => `${id}/${i + 1}-${sizes[i]}.png`);

  for (const path of paths) {
    const { error } = await admin().storage.from("feedback-photos").upload(path, RECEIPT_PNG, { contentType: "image/png" });
    if (error) throw new Error(`insertTestFeedback upload: ${error.message}`);
  }
  const { error } = await admin()
    .from("feedback")
    .insert({
      id,
      user_id: author.id,
      message: opts.message,
      is_anonymous: opts.anonymous ?? false,
      status: opts.status ?? "open",
      owner_reply: opts.reply ?? null,
      replied_at: opts.reply ? new Date().toISOString() : null,
      created_at: opts.createdAt?.toISOString(),
      deleted_at: opts.deleted ? new Date().toISOString() : null,
    });
  if (error) throw new Error(`insertTestFeedback: ${error.message}`);
  if (paths.length) {
    const { error: photoError } = await admin()
      .from("feedback_photos")
      .insert(paths.map((path, i) => ({ feedback_id: id, path, position: i + 1 })));
    if (photoError) throw new Error(`insertTestFeedback photos: ${photoError.message}`);
  }
  return { id, paths };
}

/** What set_feedback_reaction() does, without the reacting user's session. */
export async function insertTestFeedbackReaction(user: Pick<TestUser, "id">, feedbackId: string, type: "like" | "haha") {
  const { error } = await admin().from("reactions").insert({ user_id: user.id, feedback_id: feedbackId, type });
  if (error) throw new Error(`insertTestFeedbackReaction: ${error.message}`);
}

/** What comment_on_feedback() does, without the commenter's session. */
export async function insertTestFeedbackComment(user: Pick<TestUser, "id">, feedbackId: string, body: string) {
  const { error } = await admin().from("comments").insert({ user_id: user.id, feedback_id: feedbackId, body });
  if (error) throw new Error(`insertTestFeedbackComment: ${error.message}`);
}

"use server";

import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { COMMUNITY_BUCKET } from "@/lib/community";
import { communityError } from "@/lib/community-errors";
import { createClient } from "@/lib/supabase/server";

export type ModerationResult = { ok: true } | { ok: false; error: string };

/**
 * The owner deletes any post (SPEC §7): soft delete, then its photo files leave the public
 * bucket (storage lets the owner delete them). If the files fail, the post is still gone;
 * deleting again retries them.
 */
export async function removePost(postId: string): Promise<ModerationResult> {
  await requireOwner();
  if (!z.uuid().safeParse(postId).success) return { ok: false, error: communityError("not_found") };

  const supabase = await createClient();
  const { data: paths, error } = await supabase.rpc("delete_post", { p_post_id: postId });
  if (error) return { ok: false, error: communityError(error.message) };
  if (paths?.length) {
    const { error: removeError } = await supabase.storage.from(COMMUNITY_BUCKET).remove(paths);
    if (removeError) console.error("[admin] removePost: photo files not removed", postId, removeError);
  }
  return { ok: true };
}

/** The owner deletes any comment (soft delete). */
export async function removeComment(commentId: string): Promise<ModerationResult> {
  await requireOwner();
  if (!z.uuid().safeParse(commentId).success) return { ok: false, error: communityError("not_found") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_comment", { p_comment_id: commentId });
  if (error) return { ok: false, error: communityError(error.message) };
  return { ok: true };
}

"use server";

import { z } from "zod";
import { COMMUNITY_BUCKET, type FeedPost } from "@/lib/community";
import { communityError } from "@/lib/community-errors";
import { fetchFeedPage } from "@/lib/community-feed";
import { createClient } from "@/lib/supabase/server";

export type MorePostsResult = { ok: true; posts: FeedPost[]; hasMore: boolean; now: number } | { ok: false };

const cursorSchema = z.object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() });

/** The next page of the feed, after the last post on screen. */
export async function loadMorePosts(after: { createdAt: string; id: string }): Promise<MorePostsResult> {
  const parsed = cursorSchema.safeParse(after);
  if (!parsed.success) return { ok: false };
  const page = await fetchFeedPage(parsed.data);
  if (!page) return { ok: false };
  return { ok: true, ...page, now: Date.now() };
}

export type PostActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const captionSchema = z.string().trim().max(2000, "Captions can be up to 2,000 characters.");
/** `<user>/<post>/<n>-<w>x<h>.jpg`: the database checks the folder belongs to the caller and the file exists. */
const photoPathSchema = z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$/);

const createSchema = z.object({
  postId: z.uuid(),
  caption: captionSchema,
  photoPaths: z.array(photoPathSchema).min(1).max(2),
});

/**
 * Saves a post whose photos the browser has already uploaded to the author's folder.
 * create_post() checks the profile, the photos and the 5-an-hour limit.
 */
export async function createPost(input: { postId: string; caption: string; photoPaths: string[] }): Promise<PostActionResult<{ createdAt: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? communityError("invalid_photos") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_post", {
    p_post_id: parsed.data.postId,
    p_caption: parsed.data.caption,
    p_photo_paths: parsed.data.photoPaths,
  });
  if (error) return { ok: false, error: communityError(error.message, error.details) };
  return { ok: true, createdAt: new Date().toISOString() };
}

/** The author changes their caption (photos never change). */
export async function editPostCaption(input: { postId: string; caption: string }): Promise<PostActionResult<{ caption: string; editedAt: string | null }>> {
  const parsed = z.object({ postId: z.uuid(), caption: captionSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? communityError("invalid_caption") };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("edit_post_caption", { p_post_id: parsed.data.postId, p_caption: parsed.data.caption });
  if (error) return { ok: false, error: communityError(error.message) };
  return { ok: true, caption: parsed.data.caption, editedAt: data };
}

/**
 * The author (or the owner) deletes a post. The bucket is public, so the photo files are
 * removed too; storage lets the author and the owner delete them. If that fails the post is
 * still gone from the feed, and calling this again retries the files.
 */
export async function deletePost(postId: string): Promise<PostActionResult> {
  if (!z.uuid().safeParse(postId).success) return { ok: false, error: communityError("not_found") };

  const supabase = await createClient();
  const { data: paths, error } = await supabase.rpc("delete_post", { p_post_id: postId });
  if (error) return { ok: false, error: communityError(error.message) };

  if (paths?.length) {
    const { error: removeError } = await supabase.storage.from(COMMUNITY_BUCKET).remove(paths);
    if (removeError) console.error("deletePost: photo files not removed", postId, removeError);
  }
  return { ok: true };
}

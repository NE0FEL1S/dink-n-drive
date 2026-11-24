"use server";

import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { COMMUNITY_BUCKET, type FeedComment, type FeedPost, type ReactionType } from "@/lib/community";
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

const reactionSchema = z.object({ postId: z.uuid(), type: z.enum(["like", "haha"]).nullable() });

/** 👍 / 😂 (adds or switches), or null to remove. Returns the post's new counts. */
export async function reactToPost(input: {
  postId: string;
  type: ReactionType | null;
}): Promise<PostActionResult<{ likeCount: number; hahaCount: number; myReaction: ReactionType | null }>> {
  const parsed = reactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: communityError("not_found") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("set_post_reaction", { p_post_id: parsed.data.postId, p_type: parsed.data.type as ReactionType })
    .single();
  if (error || !data) return { ok: false, error: communityError(error?.message ?? "") };
  return { ok: true, likeCount: data.like_count, hahaCount: data.haha_count, myReaction: data.my_reaction ?? null };
}

/** A post's comments, oldest first (anyone can read them). */
export async function loadComments(postId: string): Promise<PostActionResult<{ comments: FeedComment[]; now: number }>> {
  if (!z.uuid().safeParse(postId).success) return { ok: false, error: communityError("not_found") };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_comments", { p_post_id: postId });
  if (error) return { ok: false, error: "We couldn't load the comments. Please try again." };
  return { ok: true, comments: (data ?? []) as FeedComment[], now: Date.now() };
}

const commentSchema = z.object({
  postId: z.uuid(),
  body: z.string().trim().min(1, "Write something first.").max(1000, "Comments can be up to 1,000 characters."),
});

/** Adds a comment (30 an hour, checked by the database) and returns it ready to show. */
export async function addComment(input: { postId: string; body: string }): Promise<PostActionResult<{ comment: FeedComment }>> {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? communityError("invalid_comment") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("comment_on_post", { p_post_id: parsed.data.postId, p_body: parsed.data.body })
    .single();
  if (error || !data) return { ok: false, error: communityError(error?.message ?? "", error?.details) };

  const profile = await getProfile();
  return {
    ok: true,
    comment: { id: data.id, created_at: data.created_at, body: parsed.data.body, author_name: profile?.full_name ?? "You", is_mine: true },
  };
}

/** The author deletes their own comment (the owner can delete any; see Admin → Moderation). */
export async function deleteComment(commentId: string): Promise<PostActionResult> {
  if (!z.uuid().safeParse(commentId).success) return { ok: false, error: communityError("not_found") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_comment", { p_comment_id: commentId });
  if (error) return { ok: false, error: communityError(error.message) };
  return { ok: true };
}

"use server";

import { z } from "zod";
import { getProfile } from "@/lib/auth";
import type { FeedComment, ReactionType } from "@/lib/community";
import { FEEDBACK_BUCKET, FEEDBACK_STATUSES, type FeedbackItem } from "@/lib/feedback";
import { feedbackError } from "@/lib/feedback-errors";
import { fetchFeedbackPage } from "@/lib/feedback-feed";
import { createClient } from "@/lib/supabase/server";

export type MoreFeedbackResult = { ok: true; items: FeedbackItem[]; hasMore: boolean; now: number } | { ok: false };

const moreSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});

/** The next page of the feed (same status filter), after the last item on screen. */
export async function loadMoreFeedback(input: { status: string | null; createdAt: string; id: string }): Promise<MoreFeedbackResult> {
  const parsed = moreSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const page = await fetchFeedbackPage(parsed.data.status, { createdAt: parsed.data.createdAt, id: parsed.data.id });
  if (!page) return { ok: false };
  return { ok: true, ...page, now: Date.now() };
}

export type FeedbackActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** `<feedback>/<n>-<w>x<h>.jpg`: the database checks the caller uploaded each file and it exists. */
const photoPathSchema = z.string().regex(/^[0-9a-f-]{36}\/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$/);

const createSchema = z.object({
  feedbackId: z.uuid(),
  message: z.string().trim().min(1, "Write your feedback first.").max(2000, "Feedback can be up to 2,000 characters."),
  anonymous: z.boolean(),
  photoPaths: z.array(photoPathSchema).max(2),
});

/**
 * Saves feedback whose photos (0–2) the browser has already uploaded to
 * feedback-photos/<feedback id>/. create_feedback() checks the profile, the photos and the
 * 5-a-day limit.
 */
export async function createFeedback(input: {
  feedbackId: string;
  message: string;
  anonymous: boolean;
  photoPaths: string[];
}): Promise<FeedbackActionResult<{ createdAt: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? feedbackError("invalid_photos") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_feedback", {
    p_feedback_id: parsed.data.feedbackId,
    p_message: parsed.data.message,
    p_is_anonymous: parsed.data.anonymous,
    p_photo_paths: parsed.data.photoPaths,
  });
  if (error) return { ok: false, error: feedbackError(error.message, error.details) };
  return { ok: true, createdAt: new Date().toISOString() };
}

/**
 * The author (or the owner) deletes feedback. The bucket is public, so the photo files are
 * removed too; storage lets their uploader and the owner delete them. If that fails the item
 * is still gone from the page, and calling this again retries the files.
 */
export async function deleteFeedback(feedbackId: string): Promise<FeedbackActionResult> {
  if (!z.uuid().safeParse(feedbackId).success) return { ok: false, error: feedbackError("not_found") };

  const supabase = await createClient();
  const { data: paths, error } = await supabase.rpc("delete_feedback", { p_feedback_id: feedbackId });
  if (error) return { ok: false, error: feedbackError(error.message) };

  if (paths?.length) {
    const { error: removeError } = await supabase.storage.from(FEEDBACK_BUCKET).remove(paths);
    if (removeError) console.error("deleteFeedback: photo files not removed", feedbackId, removeError);
  }
  return { ok: true };
}

const reactionSchema = z.object({ feedbackId: z.uuid(), type: z.enum(["like", "haha"]).nullable() });

/** 👍 / 😂 (adds or switches), or null to remove. Returns the item's new counts. */
export async function reactToFeedback(input: {
  feedbackId: string;
  type: ReactionType | null;
}): Promise<FeedbackActionResult<{ likeCount: number; hahaCount: number; myReaction: ReactionType | null }>> {
  const parsed = reactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: feedbackError("not_found") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("set_feedback_reaction", { p_feedback_id: parsed.data.feedbackId, p_type: parsed.data.type as ReactionType })
    .single();
  if (error || !data) return { ok: false, error: feedbackError(error?.message ?? "") };
  return { ok: true, likeCount: data.like_count, hahaCount: data.haha_count, myReaction: data.my_reaction ?? null };
}

/** A feedback item's comments, oldest first (anyone can read them). */
export async function loadFeedbackComments(feedbackId: string): Promise<FeedbackActionResult<{ comments: FeedComment[]; now: number }>> {
  if (!z.uuid().safeParse(feedbackId).success) return { ok: false, error: feedbackError("not_found") };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("feedback_comments", { p_feedback_id: feedbackId });
  if (error) return { ok: false, error: "We couldn't load the comments. Please try again." };
  return { ok: true, comments: (data ?? []) as FeedComment[], now: Date.now() };
}

const commentSchema = z.object({
  feedbackId: z.uuid(),
  body: z.string().trim().min(1, "Write something first.").max(1000, "Comments can be up to 1,000 characters."),
});

/** Adds a comment (30 an hour across posts and feedback, checked by the database). */
export async function addFeedbackComment(input: { feedbackId: string; body: string }): Promise<FeedbackActionResult<{ comment: FeedComment }>> {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? feedbackError("invalid_comment") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("comment_on_feedback", { p_feedback_id: parsed.data.feedbackId, p_body: parsed.data.body })
    .single();
  if (error || !data) return { ok: false, error: feedbackError(error?.message ?? "", error?.details) };

  const profile = await getProfile();
  return {
    ok: true,
    comment: { id: data.id, created_at: data.created_at, body: parsed.data.body, author_name: profile?.full_name ?? "You", is_mine: true },
  };
}

/** The author deletes their own comment (the owner can delete any). */
export async function deleteFeedbackComment(commentId: string): Promise<FeedbackActionResult> {
  if (!z.uuid().safeParse(commentId).success) return { ok: false, error: feedbackError("not_found") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_comment", { p_comment_id: commentId });
  if (error) return { ok: false, error: feedbackError(error.message) };
  return { ok: true };
}

"use server";

import { z } from "zod";
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

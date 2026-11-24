"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { FEEDBACK_BUCKET, FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/feedback";
import { feedbackError } from "@/lib/feedback-errors";
import { createClient } from "@/lib/supabase/server";

export type InboxResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const KNOWN = new Set(["not_owner", "not_found", "invalid_status", "invalid_reply"]);

function rpcError(fn: string, error: { message: string; code?: string }): string {
  if (!KNOWN.has(error.message)) console.error(`[admin] ${fn} failed:`, error.code ?? "", error.message);
  return feedbackError(error.message);
}

const statusSchema = z.object({ feedbackId: z.uuid(), status: z.enum(FEEDBACK_STATUSES) });

/** Open / In progress / Resolved (SPEC §8). Shown on the public page at once. */
export async function setFeedbackStatus(feedbackId: string, status: FeedbackStatus): Promise<InboxResult> {
  await requireOwner();
  const parsed = statusSchema.safeParse({ feedbackId, status });
  if (!parsed.success) return { ok: false, error: feedbackError("invalid_status") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_feedback_status", {
    p_feedback_id: parsed.data.feedbackId,
    p_status: parsed.data.status,
  });
  if (error) return { ok: false, error: rpcError("admin_set_feedback_status", error) };
  refresh(); // the tab counts and the Feedback badge
  return { ok: true };
}

const replySchema = z.object({
  feedbackId: z.uuid(),
  reply: z.string().trim().max(2000, "Replies can be up to 2,000 characters."),
});

/**
 * Writes, edits or (empty text) removes the public reply pinned under the feedback.
 * Returns what's saved now: the reply and its time, or nulls once removed.
 */
export async function replyToFeedback(
  feedbackId: string,
  reply: string,
): Promise<InboxResult<{ reply: string | null; repliedAt: string | null }>> {
  await requireOwner();
  const parsed = replySchema.safeParse({ feedbackId, reply });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? feedbackError("invalid_reply") };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_reply_feedback", {
    p_feedback_id: parsed.data.feedbackId,
    p_reply: parsed.data.reply,
  });
  if (error) return { ok: false, error: rpcError("admin_reply_feedback", error) };
  return { ok: true, reply: parsed.data.reply || null, repliedAt: data ?? null };
}

/**
 * The owner deletes abusive feedback (soft delete), then its photo files leave the public
 * bucket (storage lets the owner delete them). If the files fail, the item is still gone;
 * deleting again retries them.
 */
export async function removeFeedback(feedbackId: string): Promise<InboxResult> {
  await requireOwner();
  if (!z.uuid().safeParse(feedbackId).success) return { ok: false, error: feedbackError("not_found") };

  const supabase = await createClient();
  const { data: paths, error } = await supabase.rpc("delete_feedback", { p_feedback_id: feedbackId });
  if (error) return { ok: false, error: rpcError("delete_feedback", error) };
  if (paths?.length) {
    const { error: removeError } = await supabase.storage.from(FEEDBACK_BUCKET).remove(paths);
    if (removeError) console.error("[admin] removeFeedback: photo files not removed", feedbackId, removeError);
  }
  refresh();
  return { ok: true };
}

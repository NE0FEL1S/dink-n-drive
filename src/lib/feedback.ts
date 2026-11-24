import { SUPABASE_URL } from "@/lib/supabase/env";
import type { ReactionType } from "@/lib/community";
import type { Database } from "@/types/database";

/**
 * Feedback helpers shared by server and client code (SPEC §8).
 * Photos live in the public `feedback-photos` bucket at `<feedback_id>/<n>-<width>x<height>.<ext>`.
 * The path never contains the user id, so anonymous feedback can't be traced through its photos.
 */

export type FeedbackStatus = Database["public"]["Enums"]["feedback_status"];

/** One row of feedback_feed(). author_name is null for anonymous feedback. */
export type FeedbackItem = {
  id: string;
  author_name: string | null;
  is_anonymous: boolean;
  message: string;
  status: FeedbackStatus;
  owner_reply: string | null;
  replied_at: string | null;
  created_at: string;
  photo_paths: string[];
  like_count: number;
  haha_count: number;
  comment_count: number;
  my_reaction: ReactionType | null;
  is_mine: boolean;
};

export const FEEDBACK_STATUSES = ["open", "in_progress", "resolved"] as const satisfies readonly FeedbackStatus[];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

/** The status in a `?status=` value, or null for "All" (anything else). */
export function parseFeedbackStatus(value: string | undefined | null): FeedbackStatus | null {
  return FEEDBACK_STATUSES.find((s) => s === value) ?? null;
}

/** Shown in place of the author's name on anonymous feedback. */
export const ANONYMOUS_NAME = "Anonymous";

export const FEEDBACK_BUCKET = "feedback-photos";

export function feedbackPhotoUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${FEEDBACK_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

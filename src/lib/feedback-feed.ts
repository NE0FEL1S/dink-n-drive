import "server-only";

import { createClient } from "@/lib/supabase/server";
import { FEED_PAGE_SIZE } from "@/lib/community";
import type { FeedbackItem, FeedbackStatus } from "@/lib/feedback";

export type FeedbackPage = { items: FeedbackItem[]; hasMore: boolean };

/**
 * One page of the feedback feed as the current visitor sees it, newest first, optionally only
 * one status. Pass the last item of the previous page to get the next one.
 * Returns null when the database call fails.
 */
export async function fetchFeedbackPage(
  status: FeedbackStatus | null,
  after?: { createdAt: string; id: string },
): Promise<FeedbackPage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("feedback_feed", {
    p_status: status ?? undefined,
    p_before: after?.createdAt,
    p_before_id: after?.id,
    p_limit: FEED_PAGE_SIZE + 1, // one extra row tells whether there's another page
  });
  if (error) {
    console.error("feedback_feed failed", error);
    return null;
  }
  const rows = (data ?? []) as FeedbackItem[];
  return { items: rows.slice(0, FEED_PAGE_SIZE), hasMore: rows.length > FEED_PAGE_SIZE };
}

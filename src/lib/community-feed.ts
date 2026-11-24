import "server-only";

import { createClient } from "@/lib/supabase/server";
import { FEED_PAGE_SIZE, type FeedPost } from "@/lib/community";

export type FeedPage = { posts: FeedPost[]; hasMore: boolean };

/**
 * One page of the community feed as the current visitor sees it (their reactions,
 * which posts are theirs). Pass the last post of the previous page to get the next one.
 * Returns null when the database call fails.
 */
export async function fetchFeedPage(after?: { createdAt: string; id: string }): Promise<FeedPage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("community_feed", {
    p_before: after?.createdAt,
    p_before_id: after?.id,
    p_limit: FEED_PAGE_SIZE + 1, // one extra row tells whether there's another page
  });
  if (error) {
    console.error("community_feed failed", error);
    return null;
  }
  const rows = (data ?? []) as FeedPost[];
  return { posts: rows.slice(0, FEED_PAGE_SIZE), hasMore: rows.length > FEED_PAGE_SIZE };
}

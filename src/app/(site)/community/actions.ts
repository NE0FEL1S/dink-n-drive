"use server";

import { z } from "zod";
import type { FeedPost } from "@/lib/community";
import { fetchFeedPage } from "@/lib/community-feed";

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

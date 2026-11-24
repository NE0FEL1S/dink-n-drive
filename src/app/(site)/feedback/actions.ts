"use server";

import { z } from "zod";
import { FEEDBACK_STATUSES, type FeedbackItem } from "@/lib/feedback";
import { fetchFeedbackPage } from "@/lib/feedback-feed";

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

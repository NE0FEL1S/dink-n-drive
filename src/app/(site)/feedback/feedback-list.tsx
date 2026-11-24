"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { FeedbackCard } from "@/components/feed/feedback-card";
import { Button, ButtonLink, Spinner } from "@/components/ui/button";
import type { Viewer } from "@/lib/community";
import type { FeedbackItem, FeedbackStatus } from "@/lib/feedback";
import { loadMoreFeedback } from "./actions";

type Props = {
  status: FeedbackStatus | null;
  initialItems: FeedbackItem[];
  initialHasMore: boolean;
  serverNow: number;
  viewer: Viewer;
  courtName: string;
};

const LOGIN = "/login?next=%2Ffeedback";
const COMPLETE_PROFILE = "/profile?welcome=1&next=%2Ffeedback";

/** The feedback feed: newest first, "Load more" for older items (same status filter). */
export function FeedbackList({ status, initialItems, initialHasMore, serverNow, viewer, courtName }: Props) {
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [now, setNow] = useState(serverNow);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const loadMore = () => {
    const last = items.at(-1);
    if (!last) return;
    setFailed(false);
    startTransition(async () => {
      const result = await loadMoreFeedback({ status, createdAt: last.created_at, id: last.id });
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setNow(result.now);
      setHasMore(result.hasMore);
      setItems((current) => {
        const seen = new Set(current.map((f) => f.id));
        return [...current, ...result.items.filter((f) => !seen.has(f.id))];
      });
    });
  };

  if (items.length === 0) return <EmptyFeedback status={status} viewer={viewer} />;

  return (
    <div className="grid gap-4">
      {items.map((item, i) => (
        <FeedbackCard key={item.id} item={item} nowMs={now} viewer={viewer} courtName={courtName} eager={i === 0} />
      ))}

      {failed && (
        <p role="alert" className="rounded-[var(--radius-card)] bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger">
          We couldn&apos;t load more feedback. Please try again.
        </p>
      )}
      {hasMore ? (
        <Button variant="secondary" className="w-full" onClick={loadMore} disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Loading…" : "Load more feedback"}
        </Button>
      ) : (
        <p className="py-2 text-center text-sm font-medium text-slate-500">You&apos;re all caught up.</p>
      )}
    </div>
  );
}

const EMPTY_FILTERED: Record<FeedbackStatus, string> = {
  open: "No open feedback right now.",
  in_progress: "Nothing in progress right now.",
  resolved: "No resolved feedback yet.",
};

function EmptyFeedback({ status, viewer }: { status: FeedbackStatus | null; viewer: Viewer }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white px-5 py-10 text-center shadow-[var(--shadow-soft)]">
      <span className="grid size-12 place-items-center rounded-full bg-orange-50" aria-hidden="true">
        <MessageSquareText className="size-6 text-orange-500" />
      </span>
      {status ? (
        <>
          <p className="text-[17px] leading-6 font-semibold text-navy-900">{EMPTY_FILTERED[status]}</p>
          <Link
            href="/feedback"
            scroll={false}
            className="mt-1 inline-flex min-h-12 items-center text-[15px] font-semibold text-glacier-700 underline-offset-4 hover:underline"
          >
            Show all feedback
          </Link>
        </>
      ) : (
        <>
          <p className="text-[17px] leading-6 font-semibold text-navy-900">No feedback yet.</p>
          <p className="max-w-xs text-[15px] leading-6 text-slate-500">
            Spotted something to fix, or loved your game? Tell the owner here.
          </p>
          {viewer !== "member" && (
            <ButtonLink href={viewer === "guest" ? LOGIN : COMPLETE_PROFILE} variant="secondary" className="mt-1 w-full max-w-xs">
              {viewer === "guest" ? "Log in to give feedback" : "Complete your profile"}
            </ButtonLink>
          )}
        </>
      )}
    </div>
  );
}

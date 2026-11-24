"use client";

import { useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { PostCard } from "@/components/feed/post-card";
import { Button, ButtonLink, Spinner } from "@/components/ui/button";
import type { FeedPost, Viewer } from "@/lib/community";
import { loadMorePosts } from "./actions";

type Props = { initialPosts: FeedPost[]; initialHasMore: boolean; serverNow: number; viewer: Viewer };

/** The feed: posts newest first, then "Load more" for older ones. */
export function FeedList({ initialPosts, initialHasMore, serverNow, viewer }: Props) {
  const [posts, setPosts] = useState(initialPosts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [now, setNow] = useState(serverNow);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const loadMore = () => {
    const last = posts.at(-1);
    if (!last) return;
    setFailed(false);
    startTransition(async () => {
      const result = await loadMorePosts({ createdAt: last.created_at, id: last.id });
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setNow(result.now);
      setHasMore(result.hasMore);
      setPosts((current) => {
        const seen = new Set(current.map((p) => p.id));
        return [...current, ...result.posts.filter((p) => !seen.has(p.id))];
      });
    });
  };

  if (posts.length === 0) return <EmptyFeed viewer={viewer} />;

  return (
    <div className="grid gap-4">
      {posts.map((post, i) => (
        <PostCard key={post.id} post={post} nowMs={now} viewer={viewer} eager={i === 0} />
      ))}

      {failed && (
        <p role="alert" className="rounded-[var(--radius-card)] bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger">
          We couldn&apos;t load more posts. Please try again.
        </p>
      )}
      {hasMore ? (
        <Button variant="secondary" className="w-full" onClick={loadMore} disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Loading…" : "Load more posts"}
        </Button>
      ) : (
        <p className="py-2 text-center text-sm font-medium text-slate-500">You&apos;re all caught up.</p>
      )}
    </div>
  );
}

function EmptyFeed({ viewer }: { viewer: Viewer }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white px-5 py-10 text-center shadow-[var(--shadow-soft)]">
      <span className="grid size-12 place-items-center rounded-full bg-orange-50" aria-hidden="true">
        <Camera className="size-6 text-orange-500" />
      </span>
      <p className="text-[17px] leading-6 font-semibold text-navy-900">No posts yet.</p>
      <p className="max-w-xs text-[15px] leading-6 text-slate-500">Played a good game? Be the first to share a photo from the court.</p>
      {viewer === "guest" && (
        <ButtonLink href="/login?next=%2Fcommunity" variant="cta" className="mt-1 w-full max-w-xs">
          Log in to post
        </ButtonLink>
      )}
    </div>
  );
}

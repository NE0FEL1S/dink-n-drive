"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { Camera, Plus } from "lucide-react";
import { CommentThread } from "@/components/feed/comment-thread";
import { PostCard } from "@/components/feed/post-card";
import { Button, ButtonLink, buttonClass, Spinner } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Toast } from "@/components/ui/toast";
import { applyReaction, type FeedPost, type ReactionType, type Viewer } from "@/lib/community";
import { addComment, deleteComment, loadComments, loadMorePosts, reactToPost } from "./actions";
import { PostComposer } from "./composer";
import { OwnPostMenu } from "./own-post-menu";

type Props = {
  initialPosts: FeedPost[];
  initialHasMore: boolean;
  serverNow: number;
  viewer: Viewer;
  /** The signed-in member (null for guests and incomplete profiles). */
  me: { id: string; name: string } | null;
};

const LOGIN = "/login?next=%2Fcommunity";
const COMPLETE_PROFILE = "/profile?welcome=1&next=%2Fcommunity";

/** The feed: posts newest first, "Load more" for older ones, and the + Post button. */
export function FeedList({ initialPosts, initialHasMore, serverNow, viewer, me }: Props) {
  const [posts, setPosts] = useState(initialPosts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [now, setNow] = useState(serverNow);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [composing, setComposing] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

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

  const update = (id: string, change: Partial<FeedPost>) =>
    setPosts((current) => current.map((p) => (p.id === id ? { ...p, ...change } : p)));

  /** Shows the new counts at once, then the server's; puts them back if it fails. */
  const react = async (post: FeedPost, type: ReactionType | null) => {
    const before = { like_count: post.like_count, haha_count: post.haha_count, my_reaction: post.my_reaction };
    update(post.id, applyReaction(before, type));
    const result = await reactToPost({ postId: post.id, type });
    if (result.ok) {
      update(post.id, { like_count: result.likeCount, haha_count: result.hahaCount, my_reaction: result.myReaction });
    } else {
      update(post.id, before);
      setToast({ tone: "error", text: result.error });
    }
  };

  const posted = (post: FeedPost) => {
    setComposing(false);
    setNow(Date.now());
    setPosts((current) => [post, ...current]);
    setToast({ tone: "success", text: "Posted! Your photos are on the community feed." });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      {toast && (
        <Toast tone={toast.tone} onDismiss={dismissToast}>
          {toast.text}
        </Toast>
      )}

      {posts.length === 0 ? (
        <EmptyFeed viewer={viewer} onPost={() => setComposing(true)} />
      ) : (
        <div className="grid gap-4">
          {posts.map((post, i) => (
            <PostCard
              key={post.id}
              post={post}
              nowMs={now}
              viewer={viewer}
              eager={i === 0}
              menu={
                post.is_mine ? (
                  <OwnPostMenu
                    post={post}
                    onEdited={(caption, editedAt) => {
                      update(post.id, { caption, edited_at: editedAt });
                      setToast({ tone: "success", text: "Caption saved." });
                    }}
                    onDeleted={() => {
                      setPosts((current) => current.filter((p) => p.id !== post.id));
                      setToast({ tone: "success", text: "Post deleted." });
                    }}
                  />
                ) : undefined
              }
              onReact={viewer === "member" ? (type) => react(post, type) : undefined}
              onComments={() => setCommentsFor(post.id)}
            />
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
      )}

      <PostButton viewer={viewer} onPost={() => setComposing(true)} />

      <Sheet open={commentsFor !== null} onClose={() => setCommentsFor(null)} title="Comments">
        {commentsFor && (
          <CommentThread
            key={commentsFor}
            viewer={viewer}
            returnPath="/community"
            load={() => loadComments(commentsFor)}
            add={(body) => addComment({ postId: commentsFor, body })}
            remove={deleteComment}
            onCountChange={(count) => update(commentsFor, { comment_count: count })}
          />
        )}
      </Sheet>

      {me && (
        <Sheet open={composing} onClose={() => setComposing(false)} title="New post">
          <PostComposer me={me} onPosted={posted} />
        </Sheet>
      )}
    </>
  );
}

/**
 * Floating "+ Post", bottom-right above the home indicator (DESIGN §5). Guests go to log in,
 * accounts without a name + phone to Profile.
 */
function PostButton({ viewer, onPost }: { viewer: Viewer; onPost: () => void }) {
  const className = buttonClass(
    "cta",
    "fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 min-h-14 touch-manipulation px-6 text-[17px] shadow-[0_10px_28px_rgb(191_74_18/0.35)] min-[390px]:right-5 sm:right-8 sm:bottom-8",
  );
  const content = (
    <>
      <Plus className="size-5" strokeWidth={2.5} aria-hidden="true" /> Post
    </>
  );
  if (viewer === "member") {
    return (
      <button type="button" className={className} onClick={onPost}>
        {content}
      </button>
    );
  }
  return (
    <Link href={viewer === "guest" ? LOGIN : COMPLETE_PROFILE} className={className} aria-label={viewer === "guest" ? "Log in to post" : "Complete your profile to post"}>
      {content}
    </Link>
  );
}

function EmptyFeed({ viewer, onPost }: { viewer: Viewer; onPost: () => void }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white px-5 py-10 text-center shadow-[var(--shadow-soft)]">
      <span className="grid size-12 place-items-center rounded-full bg-orange-50" aria-hidden="true">
        <Camera className="size-6 text-orange-500" />
      </span>
      <p className="text-[17px] leading-6 font-semibold text-navy-900">No posts yet.</p>
      <p className="max-w-xs text-[15px] leading-6 text-slate-500">Played a good game? Be the first to share a photo from the court.</p>
      {viewer === "member" ? (
        <Button variant="secondary" className="mt-1 w-full max-w-xs" onClick={onPost}>
          Share a photo
        </Button>
      ) : (
        <ButtonLink href={viewer === "guest" ? LOGIN : COMPLETE_PROFILE} variant="secondary" className="mt-1 w-full max-w-xs">
          {viewer === "guest" ? "Log in to post" : "Complete your profile"}
        </ButtonLink>
      )}
    </div>
  );
}

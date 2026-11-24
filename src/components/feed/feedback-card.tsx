import type { ReactNode } from "react";
import { Reply, UserRound } from "lucide-react";
import { FeedbackStatusBadge } from "@/components/ui/status-badge";
import { photoSize, postTimeLabel, type ReactionType, type Viewer } from "@/lib/community";
import { ANONYMOUS_NAME, feedbackPhotoUrl, type FeedbackItem } from "@/lib/feedback";
import { manilaDateTime } from "@/lib/format";
import { FeedCard } from "./feed-card";
import { ReactionBar } from "./reaction-bar";

/**
 * A feedback item (SPEC §8): author (or "Anonymous"), time, status badge, the message,
 * 0–2 photos, the owner's reply pinned underneath, then reactions and comments.
 */
export function FeedbackCard({
  item,
  nowMs,
  viewer,
  courtName,
  eager = false,
  menu,
  onReact,
  onComments,
}: {
  item: FeedbackItem;
  nowMs: number;
  viewer: Viewer;
  /** Who the reply is from ("Reply from Dink n' Drive"), from settings. */
  courtName: string;
  eager?: boolean;
  /** The ⋯ menu (own feedback). */
  menu?: ReactNode;
  onReact?: (type: ReactionType | null) => Promise<void>;
  onComments?: () => void;
}) {
  const anonymous = item.author_name === null;
  const name = item.author_name ?? ANONYMOUS_NAME;
  const photos = item.photo_paths.map((path) => ({ url: feedbackPhotoUrl(path), ...photoSize(path) }));

  return (
    <FeedCard
      label={`Feedback from ${name}`}
      authorName={name}
      createdAt={item.created_at}
      // Only the author's own session gets is_mine, so this never tells anyone else who wrote it.
      // On the time line, not the name, so the name row keeps room for the badge and ⋯.
      meta={anonymous && item.is_mine ? "Yours" : undefined}
      nowMs={nowMs}
      text={item.message}
      photos={photos}
      eager={eager}
      avatar={
        anonymous ? (
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-ice-100 text-slate-500">
            <UserRound className="size-5" />
          </span>
        ) : undefined
      }
      aside={
        <div className="flex shrink-0 items-center gap-1">
          <FeedbackStatusBadge status={item.status} />
          {menu}
        </div>
      }
      footer={
        <ReactionBar
          likeCount={item.like_count}
          hahaCount={item.haha_count}
          commentCount={item.comment_count}
          myReaction={item.my_reaction}
          viewer={viewer}
          returnPath="/feedback"
          onReact={onReact}
          onComments={onComments}
        />
      }
    >
      {item.owner_reply && (
        <section aria-label={`Reply from ${courtName}`} className="mx-4 mt-3 rounded-[var(--radius-control)] bg-ice-50 px-4 py-3 min-[390px]:mx-5">
          <p className="flex items-center gap-2 text-sm leading-5 font-bold text-navy-900">
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-orange-50">
              <Reply className="size-3.5 text-orange-600" strokeWidth={2.5} />
            </span>
            <span className="min-w-0 truncate">Reply from {courtName}</span>
          </p>
          <p className="mt-1.5 text-[15px] leading-6 [overflow-wrap:anywhere] whitespace-pre-line text-navy-700">{item.owner_reply}</p>
          {item.replied_at && (
            <p className="mt-1 text-[13px] leading-5 text-slate-500">
              <time dateTime={item.replied_at} title={manilaDateTime(item.replied_at)} suppressHydrationWarning>
                {postTimeLabel(item.replied_at, nowMs)}
              </time>
            </p>
          )}
        </section>
      )}
    </FeedCard>
  );
}

import type { ReactNode } from "react";
import { initials, manilaDateTime } from "@/lib/format";
import { postTimeLabel } from "@/lib/community";
import { FeedPhotos, type FeedPhoto } from "./feed-photos";

type Props = {
  /** Accessible name of the card, e.g. "Post by Juan Dela Cruz". */
  label: string;
  authorName: string;
  createdAt: string;
  editedAt?: string | null;
  nowMs: number;
  text?: string;
  photos?: FeedPhoto[];
  /** Load the photos right away (the first card on screen). */
  eager?: boolean;
  /** Replaces the initials circle (e.g. the anonymous icon). Same 40 px size. */
  avatar?: ReactNode;
  /** Top-right slot (status badge, ⋯ menu). */
  aside?: ReactNode;
  /** Between the photos and the footer (the owner's reply on feedback). */
  children?: ReactNode;
  /** Reaction bar / comments. */
  footer?: ReactNode;
};

/**
 * One item in a single-column feed (Community and Feedback; DESIGN §5):
 * white card, author initials + name + time, the text, 0–2 photos, then the footer.
 */
export function FeedCard({ label, authorName, createdAt, editedAt, nowMs, text, photos, eager, avatar, aside, children, footer }: Props) {
  return (
    <article
      aria-label={label}
      className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-soft)]"
    >
      <header className="flex items-center gap-3 px-4 pt-4 min-[390px]:px-5">
        {avatar ?? (
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-50 text-sm font-bold text-orange-600"
          >
            {initials(authorName)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-5 font-bold text-navy-900">{authorName}</p>
          <p className="text-sm leading-5 text-slate-500">
            <time dateTime={createdAt} title={manilaDateTime(createdAt)} suppressHydrationWarning>
              {postTimeLabel(createdAt, nowMs)}
            </time>
            {editedAt && <span> · Edited</span>}
          </p>
        </div>
        {aside}
      </header>

      {text && (
        <p className="px-4 pt-3 text-base leading-6 [overflow-wrap:anywhere] whitespace-pre-line text-navy-700 min-[390px]:px-5">
          {text}
        </p>
      )}

      {photos && photos.length > 0 && (
        <div className="px-4 pt-3 min-[390px]:px-5">
          <FeedPhotos photos={photos} authorName={authorName} eager={eager} />
        </div>
      )}

      {children}

      {footer ?? <div className="h-4" />}
    </article>
  );
}

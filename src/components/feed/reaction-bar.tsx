import Link from "next/link";
import { MessageCircle } from "lucide-react";
import type { ReactionType, Viewer } from "@/lib/community";

type Props = {
  likeCount: number;
  hahaCount: number;
  commentCount: number;
  myReaction: ReactionType | null;
  viewer: Viewer;
  /** Where this feed lives, so log-in / profile completion bring people back. */
  returnPath: string;
};

const itemClass =
  "flex min-h-12 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold tabular-nums whitespace-nowrap " +
  "touch-manipulation transition-[transform,background-color] duration-150 active:scale-[0.98]";
const idleClass = "text-navy-700 hover:bg-ice-50 active:bg-ice-100";
const mineClass = "bg-orange-50 text-orange-600";

const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "haha", emoji: "😂", label: "Haha" },
];

function commentText(n: number) {
  if (n === 0) return "Comment";
  return `${n} ${n === 1 ? "comment" : "comments"}`;
}

/**
 * 👍 / 😂 with counts, and the comments link (SPEC §7, DESIGN §5).
 * Guests are sent to log in, and signed-in users without a name + phone to their profile,
 * because reacting and commenting need a complete profile. Members get the live
 * buttons in Phase 5D; until then their bar shows the counts only.
 */
export function ReactionBar({ likeCount, hahaCount, commentCount, myReaction, viewer, returnPath }: Props) {
  const gate =
    viewer === "guest"
      ? `/login?next=${encodeURIComponent(returnPath)}`
      : viewer === "incomplete"
        ? `/profile?welcome=1&next=${encodeURIComponent(returnPath)}`
        : null;
  const counts: Record<ReactionType, number> = { like: likeCount, haha: hahaCount };

  return (
    <div className="mt-3 flex items-center gap-1 border-t border-line px-2 py-1.5 min-[390px]:px-3">
      {REACTIONS.map(({ type, emoji, label }) => {
        const count = counts[type];
        const mine = myReaction === type;
        const name = `${label}, ${count}${mine ? ", your reaction" : ""}`;
        const content = (
          <>
            <span aria-hidden="true" className="text-lg leading-none">
              {emoji}
            </span>
            <span aria-hidden="true">{count > 0 ? count : label}</span>
          </>
        );
        return gate ? (
          <Link key={type} href={gate} aria-label={name} className={`${itemClass} ${idleClass}`}>
            {content}
          </Link>
        ) : (
          <span key={type} role="img" aria-label={name} className={`${itemClass} ${mine ? mineClass : "text-navy-700"}`}>
            {content}
          </span>
        );
      })}

      {gate ? (
        <Link href={gate} className={`${itemClass} ${idleClass} ml-auto`}>
          <MessageCircle className="size-5" aria-hidden="true" />
          {commentText(commentCount)}
        </Link>
      ) : (
        <span className={`${itemClass} ml-auto text-navy-700`}>
          <MessageCircle className="size-5" aria-hidden="true" />
          {commentText(commentCount)}
        </span>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
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
  /** Members: pick a reaction (null = remove). Resolves when the server has answered. */
  onReact?: (type: ReactionType | null) => Promise<void>;
  /** Opens the comments (everyone can read them). */
  onComments?: () => void;
};

const itemClass =
  "flex min-h-12 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold tabular-nums whitespace-nowrap " +
  "touch-manipulation transition-[transform,background-color,color] duration-150 active:scale-[0.96]";
const idleClass = "text-navy-700 hover:bg-ice-50 active:bg-ice-100";
const mineClass = "bg-orange-50 text-orange-600 hover:bg-orange-50 active:bg-orange-50";

const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "haha", emoji: "😂", label: "Haha" },
];

function commentText(n: number) {
  if (n === 0) return "Comment";
  return `${n} ${n === 1 ? "comment" : "comments"}`;
}

/**
 * 👍 / 😂 with counts, and the comments button (SPEC §7, DESIGN §5). Members tap to react,
 * tap again to remove, or tap the other one to switch. Guests are sent to log in, and
 * signed-in users without a name + phone to their profile, because reacting needs a
 * complete profile. Anyone can open the comments.
 */
export function ReactionBar({ likeCount, hahaCount, commentCount, myReaction, viewer, returnPath, onReact, onComments }: Props) {
  const [busy, setBusy] = useState(false);
  const gate =
    viewer === "guest"
      ? `/login?next=${encodeURIComponent(returnPath)}`
      : viewer === "incomplete"
        ? `/profile?welcome=1&next=${encodeURIComponent(returnPath)}`
        : null;
  const counts: Record<ReactionType, number> = { like: likeCount, haha: hahaCount };

  const react = async (type: ReactionType) => {
    if (!onReact || busy) return;
    setBusy(true);
    try {
      await onReact(myReaction === type ? null : type);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex items-center gap-1 border-t border-line px-2 py-1.5 min-[390px]:px-3">
      {REACTIONS.map(({ type, emoji, label }) => {
        const count = counts[type];
        const mine = myReaction === type;
        const name = `${label}, ${count}`;
        const content = (
          <>
            <span aria-hidden="true" className="text-lg leading-none">
              {emoji}
            </span>
            <span aria-hidden="true">{count > 0 ? count : label}</span>
          </>
        );
        if (gate) {
          return (
            <Link key={type} href={gate} aria-label={name} className={`${itemClass} ${idleClass}`}>
              {content}
            </Link>
          );
        }
        return (
          <button
            key={type}
            type="button"
            aria-label={name}
            aria-pressed={mine}
            aria-busy={busy || undefined}
            onClick={() => react(type)}
            className={`${itemClass} ${mine ? mineClass : idleClass}`}
          >
            {content}
          </button>
        );
      })}

      {onComments ? (
        <button type="button" onClick={onComments} className={`${itemClass} ${idleClass} ml-auto`}>
          <MessageCircle className="size-5" aria-hidden="true" />
          {commentText(commentCount)}
        </button>
      ) : (
        <span className={`${itemClass} ml-auto text-navy-700`}>
          <MessageCircle className="size-5" aria-hidden="true" />
          {commentText(commentCount)}
        </span>
      )}
    </div>
  );
}

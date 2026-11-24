"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { SendHorizontal } from "lucide-react";
import { useCloseGuard } from "@/components/close-guard";
import { Button, ButtonLink, Spinner } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { initials, manilaDateTime } from "@/lib/format";
import { postTimeLabel, type FeedComment, type Viewer } from "@/lib/community";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

type Props = {
  viewer: Viewer;
  /** Where this feed lives, so log-in / profile completion bring people back. */
  returnPath: string;
  load: () => Promise<Result<{ comments: FeedComment[]; now: number }>>;
  add: (body: string) => Promise<Result<{ comment: FeedComment }>>;
  remove: (commentId: string) => Promise<Result>;
  /** Told the live count whenever it changes, so the card's "n comments" stays right. */
  onCountChange: (count: number) => void;
};

const BODY_MAX = 1000;

/**
 * Comments under a post (Phase 6: under feedback too). Oldest first; members write at the
 * bottom (the box stays pinned while the list scrolls) and can delete their own. Guests and
 * incomplete profiles read, with a button to log in / finish their profile instead of the box.
 */
export function CommentThread({ viewer, returnPath, load, add, remove, onCountChange }: Props) {
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [now, setNow] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const boxId = useId();

  useCloseGuard(body.trim() && !sending ? "Discard your comment?" : null);

  // load/onCountChange are recreated by the parent on every render; only the first load matters.
  const loadRef = useRef(load);
  const countRef = useRef(onCountChange);
  useEffect(() => {
    countRef.current = onCountChange;
  }, [onCountChange]);
  useEffect(() => {
    let live = true;
    loadRef.current().then((result) => {
      if (!live) return;
      if (!result.ok) return setLoadError(result.error);
      setComments(result.comments);
      setNow(result.now);
      countRef.current(result.comments.length);
    });
    return () => {
      live = false;
    };
  }, []);

  const send = () => {
    const text = body.trim();
    if (!text || sending) return;
    setError(null);
    startSending(async () => {
      const result = await add(text);
      if (!result.ok) return setError(result.error);
      const next = [...(comments ?? []), result.comment];
      setComments(next);
      setNow(Date.now());
      setBody("");
      countRef.current(next.length);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "nearest" }));
    });
  };

  const removed = (id: string) => {
    const next = (comments ?? []).filter((c) => c.id !== id);
    setComments(next);
    countRef.current(next.length);
  };

  const gate =
    viewer === "guest"
      ? { href: `/login?next=${encodeURIComponent(returnPath)}`, label: "Log in to comment" }
      : viewer === "incomplete"
        ? { href: `/profile?welcome=1&next=${encodeURIComponent(returnPath)}`, label: "Complete your profile to comment" }
        : null;

  return (
    <div className="grid gap-4 pt-1">
      {loadError ? (
        <FormMessage tone="error">{loadError}</FormMessage>
      ) : comments === null ? (
        <div className="grid gap-4" aria-busy="true" aria-label="Loading comments">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <div className="size-8 shrink-0 animate-pulse rounded-full bg-ice-100" />
              <div className="h-14 flex-1 animate-pulse rounded-[var(--radius-control)] bg-ice-100" />
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="py-4 text-center text-[15px] text-slate-500">No comments yet. Start the conversation.</p>
      ) : (
        <ul className="grid gap-4" aria-label="Comments">
          {comments.map((comment) => (
            <CommentRow key={comment.id} comment={comment} nowMs={now} remove={remove} onRemoved={() => removed(comment.id)} />
          ))}
        </ul>
      )}
      <div ref={endRef} />

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-white px-4 pt-3 sm:-mx-6 sm:px-6">
        {gate ? (
          <ButtonLink href={gate.href} variant="secondary" className="w-full">
            {gate.label}
          </ButtonLink>
        ) : (
          <div className="grid gap-2">
            {error && <FormMessage tone="error">{error}</FormMessage>}
            <div className="flex items-end gap-2">
              <label htmlFor={boxId} className="sr-only">
                Write a comment
              </label>
              <textarea
                id={boxId}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  // Laptops: Enter sends, Shift+Enter adds a line. Phones use the Send button.
                  if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(hover: hover)").matches) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                maxLength={BODY_MAX}
                enterKeyHint="send"
                placeholder="Write a comment…"
                disabled={sending}
                className={
                  "max-h-32 min-h-12 flex-1 resize-none [field-sizing:content] rounded-[24px] border border-line bg-white px-4 py-2.5 text-base leading-6 text-navy-900 " +
                  "placeholder:text-slate-300 outline-none transition-[border-color,box-shadow] duration-150 " +
                  "focus:border-orange-600 focus:ring-2 focus:ring-orange-500/40 disabled:bg-ice-50"
                }
              />
              <button
                type="button"
                onClick={send}
                disabled={!body.trim() || sending}
                aria-label="Send comment"
                className="btn-grad grid size-12 shrink-0 touch-manipulation place-items-center rounded-full transition-transform duration-150 active:scale-[0.96] disabled:opacity-50"
              >
                {sending ? <Spinner /> : <SendHorizontal className="size-5" aria-hidden="true" />}
              </button>
            </div>
            {body.length > BODY_MAX - 100 && (
              <p className="text-right text-sm text-slate-500 tabular-nums">
                {body.length.toLocaleString("en-PH")}/{BODY_MAX.toLocaleString("en-PH")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  nowMs,
  remove,
  onRemoved,
}: {
  comment: FeedComment;
  nowMs: number;
  remove: (id: string) => Promise<Result>;
  onRemoved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <li className="flex gap-3" aria-label={`Comment by ${comment.author_name}`}>
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-orange-50 text-xs font-bold text-orange-600"
      >
        {initials(comment.author_name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="rounded-[var(--radius-control)] bg-ice-50 px-3.5 py-2.5">
          <p className="truncate text-sm leading-5 font-bold text-navy-900">{comment.author_name}</p>
          <p className="text-[15px] leading-6 [overflow-wrap:anywhere] whitespace-pre-line text-navy-700">{comment.body}</p>
        </div>
        <div className="flex min-h-8 flex-wrap items-center gap-x-1 pl-3.5 text-sm text-slate-500">
          <time dateTime={comment.created_at} title={manilaDateTime(comment.created_at)} suppressHydrationWarning>
            {postTimeLabel(comment.created_at, nowMs)}
          </time>
          {comment.is_mine && !confirming && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="-my-3 min-h-12 touch-manipulation px-1.5 font-semibold text-danger hover:underline"
              >
                Delete
              </button>
            </>
          )}
        </div>
        {confirming && (
          <div className="mt-1 grid gap-2 rounded-[var(--radius-control)] border border-danger/20 bg-danger-bg/50 p-3">
            <p className="text-sm font-medium text-navy-900">Delete this comment?</p>
            {error && <p className="text-sm font-medium text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="min-h-11 flex-1 border-danger/30! px-4 text-[15px] text-danger! hover:bg-danger-bg! active:bg-danger-bg!"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const result = await remove(comment.id);
                    if (result.ok) onRemoved();
                    else setError(result.error);
                  })
                }
              >
                {pending && <Spinner />}
                Yes, delete
              </Button>
              <Button variant="ghost" className="min-h-11 flex-1 px-4 text-[15px]" disabled={pending} onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

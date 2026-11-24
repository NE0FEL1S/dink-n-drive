"use client";

import { useCallback, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button, Spinner } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Toast } from "@/components/ui/toast";
import { initials } from "@/lib/format";
import { removeComment, removePost } from "./actions";

export type ModerationView = "posts" | "comments";

type Base = { id: string; authorName: string; authorEmail: string | null; when: string; text: string };
export type ModerationItem =
  | (Base & { kind: "post"; edited: boolean; photos: string[]; reactions: number; comments: number })
  | (Base & { kind: "comment"; target: "post" | "feedback"; targetAuthor: string; targetText: string });

const dangerOutline = "border-danger/30! text-danger! hover:bg-danger-bg! active:bg-danger-bg!";

/** Posts or comments as cards, each with Delete (asks first in a sheet). */
export function ModerationList({ view, items: initial }: { view: ModerationView; items: ModerationItem[] }) {
  const [items, setItems] = useState(initial);
  const [confirming, setConfirming] = useState<ModerationItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dismiss = useCallback(() => setToast(null), []);

  return (
    <>
      {/* Outside the list, so deleting the last item still shows it. */}
      {toast && (
        <Toast tone="success" onDismiss={dismiss}>
          {toast}
        </Toast>
      )}
      {items.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-white px-5 py-10 text-center shadow-[var(--shadow-soft)]">
          <p className="text-[17px] font-semibold text-navy-900">{view === "posts" ? "No posts to review." : "No comments to review."}</p>
          <p className="mt-1 text-[15px] text-slate-500">New ones show up here, newest first.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <article
                aria-label={`${item.kind === "post" ? "Post" : "Comment"} by ${item.authorName}`}
                className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-soft)] min-[390px]:p-5"
              >
                <header className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-50 text-sm font-bold text-orange-600"
                  >
                    {initials(item.authorName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] leading-5 font-bold text-navy-900">{item.authorName}</p>
                    <p className="truncate text-sm leading-5 text-slate-500">
                      {item.when}
                      {item.kind === "post" && item.edited && " · Edited"}
                      {item.authorEmail && ` · ${item.authorEmail}`}
                    </p>
                  </div>
                </header>

                {item.kind === "comment" && (
                  <p className="truncate text-sm text-slate-500">
                    On {item.targetAuthor}&apos;s {item.target}
                    {item.targetText && <>: “{item.targetText}”</>}
                  </p>
                )}

                {item.text ? (
                  <p
                    className={
                      "line-clamp-4 text-[15px] leading-6 [overflow-wrap:anywhere] whitespace-pre-line text-navy-700 " +
                      (item.kind === "comment" ? "rounded-[var(--radius-control)] bg-ice-50 px-3.5 py-2.5" : "")
                    }
                  >
                    {item.text}
                  </p>
                ) : (
                  item.kind === "post" && <p className="text-sm text-slate-500 italic">No caption</p>
                )}

                {item.kind === "post" && (
                  <div className="flex items-center gap-2">
                    {item.photos.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- small public thumbnails, already compressed
                      <img
                        key={url}
                        src={url}
                        alt={`Photo ${i + 1} of ${item.photos.length}`}
                        loading="lazy"
                        className="size-20 rounded-[var(--radius-control)] bg-ice-100 object-cover"
                      />
                    ))}
                    <p className="ml-auto text-right text-sm text-slate-500 tabular-nums">
                      {item.reactions} {item.reactions === 1 ? "reaction" : "reactions"}
                      <br />
                      {item.comments} {item.comments === 1 ? "comment" : "comments"}
                    </p>
                  </div>
                )}

                <Button variant="secondary" className={`w-full sm:w-fit sm:justify-self-end ${dangerOutline}`} onClick={() => setConfirming(item)}>
                  <Trash2 className="size-5" aria-hidden="true" />
                  {item.kind === "post" ? "Delete post" : "Delete comment"}
                </Button>
              </article>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming?.kind === "comment" ? "Delete this comment?" : "Delete this post?"}
      >
        {confirming && (
          <ConfirmDelete
            item={confirming}
            onDone={() => {
              setItems((current) => current.filter((i) => i.id !== confirming.id));
              setToast(confirming.kind === "post" ? "Post deleted." : "Comment deleted.");
              setConfirming(null);
            }}
            onKeep={() => setConfirming(null)}
          />
        )}
      </Sheet>
    </>
  );
}

function ConfirmDelete({ item, onDone, onKeep }: { item: ModerationItem; onDone: () => void; onKeep: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-4 pt-1">
      <p className="text-[15px] leading-6 text-slate-500">
        {item.kind === "post" ? (
          <>
            {item.authorName}&apos;s post disappears from the community feed for everyone, with its{" "}
            {item.photos.length === 1 ? "photo" : `${item.photos.length} photos`}, reactions and comments. {item.authorName} isn&apos;t notified.
          </>
        ) : (
          <>
            {item.authorName}&apos;s comment disappears from the {item.target === "post" ? "community feed" : "feedback page"}. {item.authorName}{" "}
            isn&apos;t notified.
          </>
        )}{" "}
        This can&apos;t be undone.
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="grid gap-2">
        <Button
          variant="secondary"
          className={`w-full ${dangerOutline}`}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = item.kind === "post" ? await removePost(item.id) : await removeComment(item.id);
              if (result.ok) onDone();
              else setError(result.error);
            })
          }
        >
          {pending && <Spinner />}
          {item.kind === "post" ? "Yes, delete post" : "Yes, delete comment"}
        </Button>
        <Button variant="ghost" className="w-full" onClick={onKeep} disabled={pending}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

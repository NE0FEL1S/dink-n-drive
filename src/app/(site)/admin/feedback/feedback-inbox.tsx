"use client";

import { useCallback, useState, useTransition } from "react";
import { EyeOff, MessageSquareReply, Phone, Trash2 } from "lucide-react";
import { useCloseGuard } from "@/components/close-guard";
import { CaptionField } from "@/components/feed/caption-field";
import { Button, Spinner } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { FeedbackStatusBadge } from "@/components/ui/status-badge";
import { Toast } from "@/components/ui/toast";
import { sentLabel } from "@/lib/admin-time";
import { FEEDBACK_STATUS_LABELS, FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/feedback";
import { initials } from "@/lib/format";
import { removeFeedback, replyToFeedback, setFeedbackStatus } from "./actions";

export type InboxItem = {
  id: string;
  authorName: string;
  authorEmail: string | null;
  authorPhone: string | null;
  anonymous: boolean;
  when: string;
  message: string;
  status: FeedbackStatus;
  reply: string | null;
  repliedWhen: string | null;
  photos: string[];
  reactions: number;
  comments: number;
};

const dangerOutline = "border-danger/30! text-danger! hover:bg-danger-bg! active:bg-danger-bg!";

const EMPTY: Record<FeedbackStatus | "all", string> = {
  open: "No open feedback. You're all caught up.",
  in_progress: "Nothing in progress.",
  resolved: "No resolved feedback yet.",
  all: "No feedback yet.",
};

/** Feedback cards: status buttons, the public reply (sheet) and Delete (asks first). */
export function FeedbackInbox({ view, items: initial, courtName }: { view: FeedbackStatus | "all"; items: InboxItem[]; courtName: string }) {
  const [items, setItems] = useState(initial);
  const [replying, setReplying] = useState<InboxItem | null>(null);
  const [deleting, setDeleting] = useState<InboxItem | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const dismiss = useCallback(() => setToast(null), []);

  const update = (id: string, change: Partial<InboxItem>) =>
    setItems((current) => current.map((i) => (i.id === id ? { ...i, ...change } : i)));

  return (
    <>
      {/* Outside the list, so deleting the last item still shows it. */}
      {toast && (
        <Toast tone={toast.tone} onDismiss={dismiss}>
          {toast.text}
        </Toast>
      )}
      {items.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-white px-5 py-10 text-center shadow-[var(--shadow-soft)]">
          <p className="text-[17px] font-semibold text-navy-900">{EMPTY[view]}</p>
          <p className="mt-1 text-[15px] text-slate-500">New feedback shows up under Open, newest first.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <InboxCard
                item={item}
                courtName={courtName}
                onStatus={(status) => update(item.id, { status })}
                onError={(text) => setToast({ tone: "error", text })}
                onReply={() => setReplying(item)}
                onDelete={() => setDeleting(item)}
              />
            </li>
          ))}
        </ul>
      )}

      <Sheet open={replying !== null} onClose={() => setReplying(null)} title={replying?.reply ? "Edit your reply" : "Reply publicly"}>
        {replying && (
          <ReplyForm
            item={replying}
            courtName={courtName}
            onSaved={(reply, repliedWhen) => {
              update(replying.id, { reply, repliedWhen });
              setToast({ tone: "success", text: reply ? "Reply posted. Everyone can see it now." : "Reply removed." });
              setReplying(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={deleting !== null} onClose={() => setDeleting(null)} title="Delete this feedback?">
        {deleting && (
          <ConfirmDelete
            item={deleting}
            onDone={() => {
              setItems((current) => current.filter((i) => i.id !== deleting.id));
              setToast({ tone: "success", text: "Feedback deleted." });
              setDeleting(null);
            }}
            onKeep={() => setDeleting(null)}
          />
        )}
      </Sheet>
    </>
  );
}

function InboxCard({
  item,
  courtName,
  onStatus,
  onError,
  onReply,
  onDelete,
}: {
  item: InboxItem;
  courtName: string;
  onStatus: (status: FeedbackStatus) => void;
  onError: (text: string) => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  const [saving, setSaving] = useState<FeedbackStatus | null>(null);

  const changeStatus = async (status: FeedbackStatus) => {
    if (status === item.status || saving) return;
    const before = item.status;
    setSaving(status);
    onStatus(status); // shows at once; put back if the server says no
    const result = await setFeedbackStatus(item.id, status);
    setSaving(null);
    if (!result.ok) {
      onStatus(before);
      onError(result.error);
    }
  };

  return (
    <article
      aria-label={`Feedback from ${item.authorName}`}
      className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-soft)] min-[390px]:p-5"
    >
      <header className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-50 text-sm font-bold text-orange-600">
          {initials(item.authorName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-5 font-bold text-navy-900">{item.authorName}</p>
          <p className="truncate text-sm leading-5 text-slate-500">
            {item.when}
            {item.authorEmail && ` · ${item.authorEmail}`}
          </p>
        </div>
        <FeedbackStatusBadge status={item.status} />
      </header>

      {(item.anonymous || item.authorPhone) && (
        <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {item.anonymous && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-neutral-bg px-3 text-xs font-semibold text-neutral">
              <EyeOff className="size-3.5" aria-hidden="true" />
              Anonymous to the public
            </span>
          )}
          {item.authorPhone && (
            <a
              href={`tel:${item.authorPhone}`}
              className="flex min-h-11 w-fit items-center gap-2 text-[15px] font-semibold text-glacier-700 tabular-nums hover:underline"
            >
              <Phone className="size-4" aria-hidden="true" />
              {item.authorPhone}
            </a>
          )}
        </div>
      )}

      <p className="text-[15px] leading-6 [overflow-wrap:anywhere] whitespace-pre-line text-navy-700">{item.message}</p>

      {(item.photos.length > 0 || item.reactions > 0 || item.comments > 0) && (
        <div className="flex items-center gap-2">
          {item.photos.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`Open photo ${i + 1} of ${item.photos.length} full size`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- small public thumbnails, already compressed */}
              <img src={url} alt="" loading="lazy" className="size-20 rounded-[var(--radius-control)] bg-ice-100 object-cover" />
            </a>
          ))}
          <p className="ml-auto text-right text-sm text-slate-500 tabular-nums">
            {item.reactions} {item.reactions === 1 ? "reaction" : "reactions"}
            <br />
            {item.comments} {item.comments === 1 ? "comment" : "comments"}
          </p>
        </div>
      )}

      <div className="grid gap-1.5">
        <p id={`status-${item.id}`} className="text-sm font-semibold text-navy-900">
          Status
        </p>
        <div role="group" aria-labelledby={`status-${item.id}`} className="grid grid-cols-3 gap-1 rounded-full bg-ice-50 p-1 sm:w-fit">
          {FEEDBACK_STATUSES.map((status) => {
            const active = item.status === status;
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                disabled={saving !== null}
                onClick={() => changeStatus(status)}
                className={
                  "flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-full px-2 text-[14px] font-semibold whitespace-nowrap transition-colors duration-150 sm:px-4 " +
                  (active ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-white active:bg-white disabled:opacity-60")
                }
              >
                {saving === status && <Spinner />}
                {FEEDBACK_STATUS_LABELS[status]}
              </button>
            );
          })}
        </div>
      </div>

      {item.reply && (
        <section aria-label="Your public reply" className="rounded-[var(--radius-control)] bg-ice-50 px-4 py-3">
          <p className="text-sm leading-5 font-bold text-navy-900">
            Reply from {courtName}
            {item.repliedWhen && <span className="font-normal text-slate-500"> · {item.repliedWhen}</span>}
          </p>
          <p className="mt-1 text-[15px] leading-6 [overflow-wrap:anywhere] whitespace-pre-line text-navy-700">{item.reply}</p>
        </section>
      )}

      {/* Phones: Reply on top, Delete below (away from the thumb). From 640 px: Delete · Reply, right-aligned. */}
      <div className="grid gap-2 sm:flex sm:justify-end">
        <Button variant="secondary" className="w-full sm:order-2 sm:w-fit" onClick={onReply}>
          <MessageSquareReply className="size-5" aria-hidden="true" />
          {item.reply ? "Edit reply" : "Reply publicly"}
        </Button>
        <Button variant="secondary" className={`w-full sm:order-1 sm:w-fit ${dangerOutline}`} onClick={onDelete}>
          <Trash2 className="size-5" aria-hidden="true" />
          Delete
        </Button>
      </div>
    </article>
  );
}

function ReplyForm({
  item,
  courtName,
  onSaved,
}: {
  item: InboxItem;
  courtName: string;
  onSaved: (reply: string | null, repliedWhen: string | null) => void;
}) {
  const [text, setText] = useState(item.reply ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [removing, startRemoving] = useTransition();
  const busy = pending || removing;
  const changed = text.trim() !== (item.reply ?? "");

  useCloseGuard(changed && !busy ? "Discard your reply?" : null);

  const save = (value: string, run: typeof start) =>
    run(async () => {
      setError(null);
      const result = await replyToFeedback(item.id, value);
      if (!result.ok) return setError(result.error);
      onSaved(result.reply, result.repliedAt ? sentLabel(Date.parse(result.repliedAt), Date.now()) : null);
    });

  return (
    <div className="grid gap-4 pt-1">
      <blockquote className="line-clamp-4 rounded-[var(--radius-control)] bg-ice-50 px-4 py-3 text-[15px] leading-6 whitespace-pre-line text-navy-700">
        <span className="font-semibold text-navy-900">{item.anonymous ? "Anonymous" : item.authorName}:</span> {item.message}
      </blockquote>
      <CaptionField
        label="Your reply"
        hint={`Everyone sees it under the feedback as “Reply from ${courtName}”.`}
        value={text}
        onChange={setText}
        disabled={busy}
        placeholder="Thanks for letting us know…"
        autoFocus
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="grid gap-2">
        <Button className="w-full" disabled={!changed || !text.trim() || busy} onClick={() => save(text, start)}>
          {pending && <Spinner />}
          {item.reply ? "Save reply" : "Post reply"}
        </Button>
        {item.reply && (
          <Button variant="ghost" className="w-full text-danger!" disabled={busy} onClick={() => save("", startRemoving)}>
            {removing && <Spinner />}
            Remove reply
          </Button>
        )}
      </div>
    </div>
  );
}

function ConfirmDelete({ item, onDone, onKeep }: { item: InboxItem; onDone: () => void; onKeep: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const photos = item.photos.length;
  const parts = [photos === 1 ? "photo" : photos > 1 ? `${photos} photos` : null, "reactions", "comments", item.reply ? "your reply" : null].filter(
    (p): p is string => p !== null,
  );
  const withList = `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

  return (
    <div className="grid gap-4 pt-1">
      <p className="text-[15px] leading-6 text-slate-500">
        {item.authorName}&apos;s feedback disappears from the feedback page for everyone, with its {withList}. {item.authorName} isn&apos;t
        notified. This can&apos;t be undone.
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
              const result = await removeFeedback(item.id);
              if (result.ok) onDone();
              else setError(result.error);
            })
          }
        >
          {pending && <Spinner />}
          Yes, delete feedback
        </Button>
        <Button variant="ghost" className="w-full" onClick={onKeep} disabled={pending}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

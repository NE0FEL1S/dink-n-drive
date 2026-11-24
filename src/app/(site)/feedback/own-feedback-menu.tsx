"use client";

import { useState, useTransition } from "react";
import { Ellipsis, Trash2 } from "lucide-react";
import { Dropdown, menuItemClass } from "@/components/dropdown";
import { Button, Spinner } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import type { FeedbackItem } from "@/lib/feedback";
import { deleteFeedback } from "./actions";

/** ⋯ on your own feedback: delete it (feedback can't be edited, so the owner's reply always fits). */
export function OwnFeedbackMenu({ item, onDeleted }: { item: FeedbackItem; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <Dropdown
        trigger={(props) => (
          <button
            type="button"
            aria-label="Feedback options"
            className="-mr-2 grid size-12 shrink-0 touch-manipulation place-items-center rounded-full text-navy-700 hover:bg-ice-50 active:bg-ice-100"
            {...props}
          >
            <Ellipsis className="size-5" aria-hidden="true" />
          </button>
        )}
      >
        {(closeMenu) => (
          <button
            type="button"
            role="menuitem"
            className={`${menuItemClass} text-danger!`}
            onClick={() => {
              closeMenu();
              setOpen(true);
            }}
          >
            <Trash2 className="size-5" aria-hidden="true" /> Delete feedback
          </button>
        )}
      </Dropdown>

      <Sheet open={open} onClose={close} title="Delete this feedback?">
        <DeleteFeedback item={item} onDeleted={onDeleted} onKeep={close} />
      </Sheet>
    </>
  );
}

function DeleteFeedback({ item, onDeleted, onKeep }: { item: FeedbackItem; onDeleted: () => void; onKeep: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const photos = item.photo_paths.length;
  const parts = [photos === 1 ? "photo" : photos > 1 ? `${photos} photos` : null, "reactions", "comments", item.owner_reply ? "the owner's reply" : null].filter(
    (p): p is string => p !== null,
  );
  const withList = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];

  return (
    <div className="grid gap-4 pt-1">
      <p className="text-[15px] leading-6 text-slate-500">
        It disappears from the feedback page for everyone, with its {withList}. This can&apos;t be undone.
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="grid gap-2">
        <Button
          variant="secondary"
          className="w-full border-danger/30! text-danger! hover:bg-danger-bg! active:bg-danger-bg!"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await deleteFeedback(item.id);
              if (result.ok) onDeleted();
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

"use client";

import { useState, useTransition } from "react";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useCloseGuard } from "@/components/close-guard";
import { Dropdown, menuItemClass } from "@/components/dropdown";
import { Button, Spinner } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import type { FeedPost } from "@/lib/community";
import { deletePost, editPostCaption } from "./actions";
import { CaptionField } from "./caption-field";

type Props = {
  post: FeedPost;
  onEdited: (caption: string, editedAt: string | null) => void;
  onDeleted: () => void;
};

/** ⋯ on your own posts: edit the caption (photos stay) or delete the post. */
export function OwnPostMenu({ post, onEdited, onDeleted }: Props) {
  const [sheet, setSheet] = useState<"edit" | "delete" | null>(null);
  const close = () => setSheet(null);

  return (
    <>
      <Dropdown
        trigger={(props) => (
          <button
            type="button"
            aria-label="Post options"
            className="-mr-2 grid size-12 shrink-0 touch-manipulation place-items-center rounded-full text-navy-700 hover:bg-ice-50 active:bg-ice-100"
            {...props}
          >
            <Ellipsis className="size-5" aria-hidden="true" />
          </button>
        )}
      >
        {(closeMenu) => (
          <>
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                closeMenu();
                setSheet("edit");
              }}
            >
              <Pencil className="size-5 text-navy-700" aria-hidden="true" /> Edit caption
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${menuItemClass} text-danger!`}
              onClick={() => {
                closeMenu();
                setSheet("delete");
              }}
            >
              <Trash2 className="size-5" aria-hidden="true" /> Delete post
            </button>
          </>
        )}
      </Dropdown>

      <Sheet open={sheet === "edit"} onClose={close} title="Edit caption">
        <EditCaption
          post={post}
          onSaved={(caption, editedAt) => {
            onEdited(caption, editedAt);
            close();
          }}
        />
      </Sheet>
      <Sheet open={sheet === "delete"} onClose={close} title="Delete this post?">
        <DeletePost post={post} onDeleted={onDeleted} onKeep={close} />
      </Sheet>
    </>
  );
}

function EditCaption({ post, onSaved }: { post: FeedPost; onSaved: (caption: string, editedAt: string | null) => void }) {
  const [caption, setCaption] = useState(post.caption);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const changed = caption.trim() !== post.caption;

  useCloseGuard(changed && !pending ? "Discard your changes?" : null);

  return (
    <div className="grid gap-4 pt-1">
      <CaptionField label="Caption" value={caption} onChange={setCaption} disabled={pending} autoFocus />
      <p className="-mt-2 text-sm text-slate-500">Photos can&apos;t be changed. To use different photos, delete this post and post again.</p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <Button
        className="w-full"
        disabled={!changed || pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await editPostCaption({ postId: post.id, caption });
            if (result.ok) onSaved(result.caption, result.editedAt);
            else setError(result.error);
          })
        }
      >
        {pending && <Spinner />}
        Save caption
      </Button>
    </div>
  );
}

function DeletePost({ post, onDeleted, onKeep }: { post: FeedPost; onDeleted: () => void; onKeep: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const photos = post.photo_paths.length;

  return (
    <div className="grid gap-4 pt-1">
      <p className="text-[15px] leading-6 text-slate-500">
        It disappears from the community feed for everyone, with its {photos === 1 ? "photo" : `${photos} photos`}, reactions and comments.
        This can&apos;t be undone.
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
              const result = await deletePost(post.id);
              if (result.ok) onDeleted();
              else setError(result.error);
            })
          }
        >
          {pending && <Spinner />}
          Yes, delete post
        </Button>
        <Button variant="ghost" className="w-full" onClick={onKeep} disabled={pending}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

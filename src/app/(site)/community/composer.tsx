"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useCloseGuard } from "@/components/close-guard";
import { Button, Spinner } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { COMMUNITY_BUCKET, type FeedPost } from "@/lib/community";
import { createClient } from "@/lib/supabase/client";
import { createPost } from "./actions";
import { CaptionField } from "./caption-field";

const MAX_PHOTOS = 2;

type Picked = { key: string; file: File; preview: string };
type Phase = "idle" | "preparing" | "uploading" | "saving";

/**
 * New post (SPEC §7): 1–2 photos (required) + an optional caption.
 * Each photo is compressed to a JPEG (max 1600 px, under ~600 KB) in the browser, then
 * uploaded straight to community-photos/<me>/<post>/<n>-<w>x<h>.jpg (storage only lets
 * people write into their own folder). create_post() then saves the post. If saving fails,
 * the uploaded files are removed again.
 */
export function PostComposer({ me, onPosted }: { me: { id: string; name: string }; onPosted: (post: FeedPost) => void }) {
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [caption, setCaption] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = phase !== "idle";
  const dirty = photos.length > 0 || caption.trim() !== "";

  useCloseGuard(busy ? "Your post is still uploading. Close anyway?" : dirty ? "Discard this post?" : null);

  // Free the preview URLs when the sheet closes.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  function pick(list: FileList | null) {
    setError(null);
    setNote(null);
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    if (files.some((f) => !f.type.startsWith("image/") && f.type !== "")) {
      setError("Please choose photos (JPG, PNG or HEIC).");
      return;
    }
    if (files.some((f) => f.size > 30 * 1024 * 1024)) {
      setError("One of those photos is too big. Please choose a smaller one.");
      return;
    }
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setNote(`A post can have up to ${MAX_PHOTOS} photos, so we kept the first ${room === 1 ? "one" : room}.`);
    const added = files.slice(0, room).map((file) => ({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
    setPhotos((current) => [...current, ...added]);
  }

  function remove(key: string) {
    setNote(null);
    setPhotos((current) => {
      const gone = current.find((p) => p.key === key);
      if (gone) URL.revokeObjectURL(gone.preview);
      return current.filter((p) => p.key !== key);
    });
  }

  async function submit() {
    if (photos.length === 0 || busy) return;
    setError(null);
    const postId = crypto.randomUUID();
    const storage = createClient().storage.from(COMMUNITY_BUCKET);
    const uploaded: string[] = [];
    try {
      setPhase("preparing");
      const { default: compress } = await import("browser-image-compression");
      const ready: { blob: Blob; width: number; height: number }[] = [];
      for (const photo of photos) {
        let blob: Blob;
        try {
          blob = await compress(photo.file, { maxSizeMB: 0.6, maxWidthOrHeight: 1600, fileType: "image/jpeg", initialQuality: 0.85, useWebWorker: true });
        } catch {
          throw new Error("We couldn't read one of those photos. Please choose a JPG or PNG.");
        }
        const bitmap = await createImageBitmap(blob);
        ready.push({ blob, width: bitmap.width, height: bitmap.height });
        bitmap.close();
      }

      setPhase("uploading");
      for (const [i, photo] of ready.entries()) {
        const path = `${me.id}/${postId}/${i + 1}-${photo.width}x${photo.height}.jpg`;
        const { error: upErr } = await storage.upload(path, photo.blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw new Error("The upload didn't go through. Check your connection and try again.");
        uploaded.push(path);
      }

      setPhase("saving");
      const saved = await createPost({ postId, caption, photoPaths: uploaded });
      if (!saved.ok) throw new Error(saved.error);

      onPosted({
        id: postId,
        author_name: me.name,
        caption: caption.trim(),
        created_at: saved.createdAt,
        edited_at: null,
        photo_paths: uploaded,
        like_count: 0,
        haha_count: 0,
        comment_count: 0,
        my_reaction: null,
        is_mine: true,
      });
    } catch (e) {
      if (uploaded.length) void storage.remove(uploaded); // nothing points at them now
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setPhase("idle");
    }
  }

  return (
    <div className="grid gap-4 pt-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = ""; // picking the same photo again still fires
        }}
      />

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex min-h-40 touch-manipulation flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-line bg-ice-50 px-4 py-6 text-center hover:border-orange-500/50 active:bg-ice-100"
        >
          <ImagePlus className="size-8 text-orange-500" aria-hidden="true" />
          <span className="text-[15px] font-semibold text-navy-900">Add photos</span>
          <span className="text-sm text-slate-500">1 or 2, from your gallery or camera</span>
        </button>
      ) : (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            {photos.map((photo, i) => (
              <div key={photo.key} className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-control)] bg-ice-100">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img src={photo.preview} alt={`Photo ${i + 1} to post`} className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => remove(photo.key)}
                  disabled={busy}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute top-1 right-1 grid size-11 touch-manipulation place-items-center rounded-full"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-navy-900/75 text-white">
                    <X className="size-4" aria-hidden="true" />
                  </span>
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="flex aspect-[4/5] touch-manipulation flex-col items-center justify-center gap-1.5 rounded-[var(--radius-control)] border-2 border-dashed border-line bg-ice-50 px-2 text-center hover:border-orange-500/50 active:bg-ice-100"
              >
                <ImagePlus className="size-6 text-orange-500" aria-hidden="true" />
                <span className="text-sm font-semibold text-navy-900">Add another</span>
              </button>
            )}
          </div>
          <p className="text-sm text-slate-500">Photos can&apos;t be changed after posting.</p>
        </div>
      )}
      {note && <FormMessage tone="info">{note}</FormMessage>}

      <CaptionField label="Caption (optional)" value={caption} onChange={setCaption} disabled={busy} />

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <Button variant="cta" className="w-full text-[17px]" onClick={submit} disabled={photos.length === 0 || busy}>
        {busy && <Spinner />}
        {phase === "preparing" ? "Preparing photos…" : phase === "uploading" ? "Uploading…" : phase === "saving" ? "Posting…" : "Post"}
      </Button>
    </div>
  );
}

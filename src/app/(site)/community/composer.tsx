"use client";

import { useState } from "react";
import { useCloseGuard } from "@/components/close-guard";
import { CaptionField } from "@/components/feed/caption-field";
import { PhotoPicker, photoPaths, preparePhotos, usePickedPhotos } from "@/components/feed/photo-picker";
import { Button, Spinner } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { COMMUNITY_BUCKET, type FeedPost } from "@/lib/community";
import { createClient } from "@/lib/supabase/client";
import { createPost } from "./actions";

type Phase = "idle" | "preparing" | "uploading" | "saving";

/**
 * New post (SPEC §7): 1–2 photos (required) + an optional caption.
 * Each photo is compressed to a JPEG (max 1600 px, under ~600 KB) in the browser, then
 * uploaded straight to community-photos/<me>/<post>/<n>-<w>x<h>.jpg (storage only lets
 * people write into their own folder). create_post() then saves the post. If saving fails,
 * the uploaded files are removed again.
 */
export function PostComposer({ me, onPosted }: { me: { id: string; name: string }; onPosted: (post: FeedPost) => void }) {
  const { photos, pick, remove, pickError, note } = usePickedPhotos();
  const [caption, setCaption] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = phase !== "idle";
  const dirty = photos.length > 0 || caption.trim() !== "";

  useCloseGuard(busy ? "Your post is still uploading. Close anyway?" : dirty ? "Discard this post?" : null);

  async function submit() {
    if (photos.length === 0 || busy) return;
    setError(null);
    const postId = crypto.randomUUID();
    const storage = createClient().storage.from(COMMUNITY_BUCKET);
    const uploaded: string[] = [];
    try {
      setPhase("preparing");
      const ready = await preparePhotos(photos);

      setPhase("uploading");
      const paths = photoPaths(`${me.id}/${postId}`, ready);
      for (const [i, photo] of ready.entries()) {
        const { error: upErr } = await storage.upload(paths[i], photo.blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw new Error("The upload didn't go through. Check your connection and try again.");
        uploaded.push(paths[i]);
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
      <PhotoPicker
        photos={photos}
        onPick={(files) => pick(files, "A post")}
        onRemove={remove}
        busy={busy}
        emptyHint="1 or 2, from your gallery or camera"
        footnote="Photos can't be changed after posting."
        pickError={pickError}
        note={note}
      />

      <CaptionField label="Caption (optional)" value={caption} onChange={setCaption} disabled={busy} />

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <Button variant="cta" className="w-full text-[17px]" onClick={submit} disabled={photos.length === 0 || busy}>
        {busy && <Spinner />}
        {phase === "preparing" ? "Preparing photos…" : phase === "uploading" ? "Uploading…" : phase === "saving" ? "Posting…" : "Post"}
      </Button>
    </div>
  );
}

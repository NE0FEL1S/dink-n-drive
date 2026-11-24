"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useCloseGuard } from "@/components/close-guard";
import { CaptionField } from "@/components/feed/caption-field";
import { PhotoPicker, photoPaths, preparePhotos, usePickedPhotos } from "@/components/feed/photo-picker";
import { Button, Spinner } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { FEEDBACK_BUCKET, type FeedbackItem } from "@/lib/feedback";
import { createClient } from "@/lib/supabase/client";
import { createFeedback } from "./actions";

type Phase = "idle" | "preparing" | "uploading" | "saving";

/**
 * New feedback (SPEC §8): a message (required), 0–2 photos and "Post anonymously".
 * Photos are compressed in the browser and uploaded to feedback-photos/<feedback id>/
 * (no user id in the path, so anonymous feedback can't be traced through its photos; storage
 * records who uploaded them). create_feedback() then saves it. If saving fails, the uploaded
 * files are removed again.
 */
export function FeedbackComposer({ me, onSent }: { me: { name: string }; onSent: (item: FeedbackItem) => void }) {
  const { photos, pick, remove, pickError, note } = usePickedPhotos();
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = phase !== "idle";
  const ready = message.trim() !== "";

  useCloseGuard(busy ? "Your feedback is still sending. Close anyway?" : ready || photos.length > 0 ? "Discard this feedback?" : null);

  async function submit() {
    if (!ready || busy) return;
    setError(null);
    const feedbackId = crypto.randomUUID();
    const storage = createClient().storage.from(FEEDBACK_BUCKET);
    const uploaded: string[] = [];
    try {
      if (photos.length > 0) {
        setPhase("preparing");
        const prepared = await preparePhotos(photos);

        setPhase("uploading");
        const paths = photoPaths(feedbackId, prepared);
        for (const [i, photo] of prepared.entries()) {
          const { error: upErr } = await storage.upload(paths[i], photo.blob, { contentType: "image/jpeg", upsert: false });
          if (upErr) throw new Error("The upload didn't go through. Check your connection and try again.");
          uploaded.push(paths[i]);
        }
      }

      setPhase("saving");
      const saved = await createFeedback({ feedbackId, message, anonymous, photoPaths: uploaded });
      if (!saved.ok) throw new Error(saved.error);

      onSent({
        id: feedbackId,
        author_name: anonymous ? null : me.name,
        is_anonymous: anonymous,
        message: message.trim(),
        status: "open",
        owner_reply: null,
        replied_at: null,
        created_at: saved.createdAt,
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
      <CaptionField
        label="Your feedback"
        value={message}
        onChange={setMessage}
        disabled={busy}
        placeholder="What should we fix, add or keep doing?"
      />

      <PhotoPicker
        photos={photos}
        onPick={(files) => pick(files, "Feedback")}
        onRemove={remove}
        busy={busy}
        emptyHint="Optional · up to 2, from your gallery or camera"
        footnote="Photos can't be changed after sending."
        pickError={pickError}
        note={note}
      />

      <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-[var(--radius-control)] bg-ice-50 px-3 py-3">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          disabled={busy}
          className="peer sr-only"
        />
        {/* drawn from state (not :checked), so every browser repaints it right away */}
        <span
          aria-hidden="true"
          className={
            "mt-px grid size-6 shrink-0 place-items-center rounded-[7px] border-2 transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/60 " +
            (anonymous ? "border-orange-600 bg-orange-600 text-white" : "border-slate-300 bg-white")
          }
        >
          {anonymous && <Check className="size-4" strokeWidth={3} />}
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] leading-6 font-semibold text-navy-900">Post anonymously</span>
          <span className="block text-sm leading-5 text-slate-500">
            Everyone sees &ldquo;Anonymous&rdquo; instead of your name. The owner can still see it&apos;s you.
          </span>
        </span>
      </label>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <div className="grid gap-2">
        <Button variant="cta" className="w-full text-[17px]" onClick={submit} disabled={!ready || busy}>
          {busy && <Spinner />}
          {phase === "preparing" ? "Preparing photos…" : phase === "uploading" ? "Uploading…" : phase === "saving" ? "Sending…" : "Send feedback"}
        </Button>
        <p className="text-center text-sm text-slate-500">You can delete your feedback later, but not edit it.</p>
      </div>
    </div>
  );
}

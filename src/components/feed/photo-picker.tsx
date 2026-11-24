"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { FormMessage } from "@/components/ui/field";

/**
 * Picking, previewing, compressing and uploading the 1–2 photos of a community post or a
 * feedback item (SPEC §7, §8; DESIGN §5 "New post sheet").
 */

export const MAX_PHOTOS = 2;

export type PickedPhoto = { key: string; file: File; preview: string };

/** The photos picked so far, plus the messages about picking them. Previews are freed on unmount. */
export function usePickedPhotos() {
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  function pick(list: FileList | null, noun: string) {
    setPickError(null);
    setNote(null);
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    if (files.some((f) => !f.type.startsWith("image/") && f.type !== "")) {
      setPickError("Please choose photos (JPG, PNG or HEIC).");
      return;
    }
    if (files.some((f) => f.size > 30 * 1024 * 1024)) {
      setPickError("One of those photos is too big. Please choose a smaller one.");
      return;
    }
    const room = MAX_PHOTOS - photosRef.current.length;
    if (files.length > room) setNote(`${noun} can have up to ${MAX_PHOTOS} photos, so we kept the first ${room === 1 ? "one" : room}.`);
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

  return { photos, pick, remove, pickError, note };
}

export type ReadyPhoto = { blob: Blob; width: number; height: number };

/**
 * Compresses each photo to a JPEG (max 1600 px, under ~600 KB) and reads its real size, which
 * goes into the file name (`<n>-<w>x<h>.jpg`) so the feed can reserve the shape before it loads.
 */
export async function preparePhotos(photos: PickedPhoto[]): Promise<ReadyPhoto[]> {
  const { default: compress } = await import("browser-image-compression");
  const ready: ReadyPhoto[] = [];
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
  return ready;
}

/** `<folder>/<n>-<w>x<h>.jpg` for each prepared photo, in order. */
export function photoPaths(folder: string, ready: ReadyPhoto[]): string[] {
  return ready.map((photo, i) => `${folder}/${i + 1}-${photo.width}x${photo.height}.jpg`);
}

/**
 * The picker: a dashed "Add photos" area, then 4:5 previews in two columns with a ✕ each and an
 * "Add another" tile while there's room.
 */
export function PhotoPicker({
  photos,
  onPick,
  onRemove,
  busy,
  emptyHint,
  footnote,
  pickError,
  note,
}: {
  photos: PickedPhoto[];
  onPick: (files: FileList | null) => void;
  onRemove: (key: string) => void;
  busy: boolean;
  /** Under "Add photos", e.g. "1 or 2, from your gallery or camera". */
  emptyHint: string;
  /** Under the previews, e.g. "Photos can't be changed after posting." */
  footnote: string;
  pickError: string | null;
  note: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const open = () => inputRef.current?.click();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = ""; // picking the same photo again still fires
        }}
      />

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={open}
          disabled={busy}
          className="flex min-h-40 touch-manipulation flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-line bg-ice-50 px-4 py-6 text-center hover:border-orange-500/50 active:bg-ice-100"
        >
          <ImagePlus className="size-8 text-orange-500" aria-hidden="true" />
          <span className="text-[15px] font-semibold text-navy-900">Add photos</span>
          <span className="text-sm text-slate-500">{emptyHint}</span>
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
                  onClick={() => onRemove(photo.key)}
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
                onClick={open}
                disabled={busy}
                className="flex aspect-[4/5] touch-manipulation flex-col items-center justify-center gap-1.5 rounded-[var(--radius-control)] border-2 border-dashed border-line bg-ice-50 px-2 text-center hover:border-orange-500/50 active:bg-ice-100"
              >
                <ImagePlus className="size-6 text-orange-500" aria-hidden="true" />
                <span className="text-sm font-semibold text-navy-900">Add another</span>
              </button>
            )}
          </div>
          <p className="text-sm text-slate-500">{footnote}</p>
        </div>
      )}
      {note && <FormMessage tone="info">{note}</FormMessage>}
      {pickError && <FormMessage tone="error">{pickError}</FormMessage>}
    </>
  );
}

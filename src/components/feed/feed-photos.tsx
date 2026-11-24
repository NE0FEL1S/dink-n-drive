import Image from "next/image";

export type FeedPhoto = { url: string; width?: number; height?: number };

/** Taller than 4:5 or wider than 1.91:1 gets cropped (the same limits Instagram uses). */
const MIN_RATIO = 4 / 5;
const MAX_RATIO = 1.91;

/**
 * 1 photo: shown in its own shape (within the limits above). 2 photos: side by side, 4:5 each.
 * Photos come straight from the public bucket, already compressed in the browser when posted,
 * so they skip the image optimizer. They load lazily unless `eager` (the first post on screen).
 */
export function FeedPhotos({ photos, authorName, eager = false }: { photos: FeedPhoto[]; authorName: string; eager?: boolean }) {
  const count = photos.length;
  if (count === 0) return null;

  if (count === 1) {
    const [photo] = photos;
    const ratio = photo.width && photo.height ? Math.min(Math.max(photo.width / photo.height, MIN_RATIO), MAX_RATIO) : MIN_RATIO;
    return (
      <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-ice-100" style={{ aspectRatio: ratio }}>
        <Image
          src={photo.url}
          alt={`Photo posted by ${authorName}`}
          fill
          unoptimized
          loading={eager ? "eager" : "lazy"}
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-[var(--radius-card)]">
      {photos.slice(0, 2).map((photo, i) => (
        <div key={photo.url} className="relative aspect-[4/5] bg-ice-100">
          <Image
            src={photo.url}
            alt={`Photo ${i + 1} of 2 posted by ${authorName}`}
            fill
            unoptimized
            loading={eager ? "eager" : "lazy"}
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}

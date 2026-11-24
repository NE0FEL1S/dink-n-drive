import { SUPABASE_URL } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

/**
 * Community feed helpers shared by server and client code (SPEC §7).
 * Photos live in the public `community-photos` bucket at
 * `<user_id>/<post_id>/<n>-<width>x<height>.<ext>`; the size in the name lets the feed
 * reserve the photo's shape before it loads (no layout jump, no extra column).
 */

export type ReactionType = Database["public"]["Enums"]["reaction_type"];

/** One row of community_feed() (the generated type misses that some columns can be null). */
export type FeedPost = {
  id: string;
  author_name: string;
  caption: string;
  created_at: string;
  edited_at: string | null;
  photo_paths: string[];
  like_count: number;
  haha_count: number;
  comment_count: number;
  my_reaction: ReactionType | null;
  is_mine: boolean;
};

/** Who is looking at the feed: a guest, a signed-in user without name + phone yet, or a member. */
export type Viewer = "guest" | "incomplete" | "member";

/** Posts per page (the database caps a page at 30). */
export const FEED_PAGE_SIZE = 10;

export const COMMUNITY_BUCKET = "community-photos";

export function communityPhotoUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${COMMUNITY_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Width and height from a photo's file name (`1-1280x960.webp`), or null when it has none. */
export function photoSize(path: string): { width: number; height: number } | null {
  const match = /-(\d{2,5})x(\d{2,5})\.[a-z]+$/i.exec(path);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * When a post was made, short and in Manila time: "Just now", "5 min ago", "3 h ago",
 * then "Nov 24, 3:41 PM" (with the year once it's not this year).
 */
export function postTimeLabel(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  const minutes = Math.floor((nowMs - then) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;

  const manilaYear = (ms: number) => new Date(ms + 8 * 3_600_000).getUTCFullYear();
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    ...(manilaYear(then) !== manilaYear(nowMs) ? { year: "numeric" } : {}),
  });
  const time = d.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}

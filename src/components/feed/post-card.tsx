import type { ReactNode } from "react";
import { communityPhotoUrl, photoSize, type FeedPost, type ReactionType, type Viewer } from "@/lib/community";
import { FeedCard } from "./feed-card";
import { ReactionBar } from "./reaction-bar";

/** A community post: author, time, caption, 1–2 photos, reactions and comments (SPEC §7). */
export function PostCard({
  post,
  nowMs,
  viewer,
  eager = false,
  menu,
  onReact,
  onComments,
}: {
  post: FeedPost;
  nowMs: number;
  viewer: Viewer;
  eager?: boolean;
  /** The ⋯ menu (own posts). */
  menu?: ReactNode;
  onReact?: (type: ReactionType | null) => Promise<void>;
  onComments?: () => void;
}) {
  const photos = post.photo_paths.map((path) => ({ url: communityPhotoUrl(path), ...photoSize(path) }));
  return (
    <FeedCard
      label={`Post by ${post.author_name}`}
      authorName={post.author_name}
      createdAt={post.created_at}
      editedAt={post.edited_at}
      nowMs={nowMs}
      text={post.caption}
      photos={photos}
      eager={eager}
      aside={menu}
      footer={
        <ReactionBar
          likeCount={post.like_count}
          hahaCount={post.haha_count}
          commentCount={post.comment_count}
          myReaction={post.my_reaction}
          viewer={viewer}
          returnPath="/community"
          onReact={onReact}
          onComments={onComments}
        />
      }
    />
  );
}

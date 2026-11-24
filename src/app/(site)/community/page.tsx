import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { getProfile, isProfileComplete } from "@/lib/auth";
import { nowMs } from "@/lib/booking-time";
import type { Viewer } from "@/lib/community";
import { fetchFeedPage } from "@/lib/community-feed";
import { FeedList } from "./feed-list";

export const metadata: Metadata = { title: "Community" };

/**
 * Community feed (SPEC §7): anyone can browse; posting, reacting and commenting need an
 * account with a complete profile. Newest posts first, 10 at a time.
 */
export default function CommunityPage() {
  // Extra bottom padding so the floating + Post button never covers the last card.
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-[calc(6.5rem+env(safe-area-inset-bottom))] min-[390px]:px-5 sm:pt-12">
      <PageHeader eyebrow="Players' corner" title="Community">
        Photos and stories from games at the court.
      </PageHeader>
      <div className="mt-6">
        <Suspense fallback={<FeedSkeleton />}>
          <FeedData />
        </Suspense>
      </div>
    </main>
  );
}

async function FeedData() {
  await connection();
  const [profile, page] = await Promise.all([getProfile(), fetchFeedPage()]);

  if (!page) {
    return (
      <p role="alert" className="rounded-[var(--radius-card)] bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger">
        We couldn&apos;t load the community feed. Please refresh the page.
      </p>
    );
  }

  const viewer: Viewer = !profile ? "guest" : isProfileComplete(profile) ? "member" : "incomplete";
  const me = profile && viewer === "member" ? { id: profile.id, name: profile.full_name ?? "Member" } : null;
  return <FeedList initialPosts={page.posts} initialHasMore={page.hasMore} serverNow={nowMs()} viewer={viewer} me={me} />;
}

function FeedSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading posts">
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="grid gap-3 rounded-[var(--radius-card)] bg-white/70 p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 animate-pulse rounded-full bg-ice-100" />
            <div className="h-4 w-32 animate-pulse rounded-full bg-ice-100" />
          </div>
          <div className="aspect-[4/5] animate-pulse rounded-[var(--radius-card)] bg-ice-100" />
        </div>
      ))}
    </div>
  );
}

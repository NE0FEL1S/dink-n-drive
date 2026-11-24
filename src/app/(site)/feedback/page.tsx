import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { one } from "@/lib/admin-period";
import { getProfile, isProfileComplete } from "@/lib/auth";
import { nowMs } from "@/lib/booking-time";
import type { Viewer } from "@/lib/community";
import { parseFeedbackStatus } from "@/lib/feedback";
import { fetchFeedbackPage } from "@/lib/feedback-feed";
import { getPublicSettings } from "@/lib/settings";
import { FeedbackList } from "./feedback-list";
import { StatusFilter } from "./status-filter";

export const metadata: Metadata = { title: "Feedback" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Public feedback (SPEC §8): anyone can read it; giving feedback, reacting and commenting
 * need an account with a complete profile. Newest first, 10 at a time, with status filters
 * (`?status=open|in_progress|resolved`; none = All).
 */
export default function FeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  // Extra bottom padding so the floating + Feedback button never covers the last card.
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-[calc(6.5rem+env(safe-area-inset-bottom))] min-[390px]:px-5 sm:pt-12">
      <PageHeader eyebrow="Your voice" title="Feedback">
        Ideas, issues and praise for the court. The owner replies right here.
      </PageHeader>
      <div className="mt-6">
        <Suspense fallback={<FeedbackSkeleton />}>
          <FeedbackData searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function FeedbackData({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const status = parseFeedbackStatus(one((await searchParams).status));
  const [profile, page, settings] = await Promise.all([getProfile(), fetchFeedbackPage(status), getPublicSettings()]);

  const viewer: Viewer = !profile ? "guest" : isProfileComplete(profile) ? "member" : "incomplete";
  const me = profile && viewer === "member" ? { name: profile.full_name ?? "Member" } : null;
  return (
    <div className="grid gap-4">
      <StatusFilter current={status} />
      {page ? (
        <FeedbackList
          // a new filter starts with fresh state
          key={status ?? "all"}
          status={status}
          initialItems={page.items}
          initialHasMore={page.hasMore}
          serverNow={nowMs()}
          viewer={viewer}
          courtName={settings.court_name}
          me={me}
        />
      ) : (
        <p role="alert" className="rounded-[var(--radius-card)] bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger">
          We couldn&apos;t load the feedback. Please refresh the page.
        </p>
      )}
    </div>
  );
}

function FeedbackSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading feedback">
      <div className="h-[52px] animate-pulse rounded-full bg-white/70" />
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="grid gap-3 rounded-[var(--radius-card)] bg-white/70 p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 animate-pulse rounded-full bg-ice-100" />
            <div className="h-4 w-32 animate-pulse rounded-full bg-ice-100" />
            <div className="ml-auto h-7 w-16 animate-pulse rounded-full bg-ice-100" />
          </div>
          <div className="h-4 w-full animate-pulse rounded-full bg-ice-100" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-ice-100" />
        </div>
      ))}
    </div>
  );
}

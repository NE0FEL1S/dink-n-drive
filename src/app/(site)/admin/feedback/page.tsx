import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { one } from "@/lib/admin-period";
import { sentLabel } from "@/lib/admin-time";
import { requireOwner } from "@/lib/auth";
import { nowMs } from "@/lib/booking-time";
import { FEEDBACK_STATUS_LABELS, FEEDBACK_STATUSES, feedbackPhotoUrl, parseFeedbackStatus, type FeedbackStatus } from "@/lib/feedback";
import { toLocalPhMobile } from "@/lib/phone";
import { getPublicSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { FeedbackInbox, type InboxItem } from "./feedback-inbox";

export const metadata: Metadata = { title: "Feedback · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type View = FeedbackStatus | "all";

const PAGE_SIZE = 20;
const VIEWS: { view: View; label: string }[] = [
  ...FEEDBACK_STATUSES.map((status) => ({ view: status, label: FEEDBACK_STATUS_LABELS[status] })),
  { view: "all", label: "All" },
];

const href = (view: View, page = 1) => `/admin/feedback?status=${view}${page > 1 ? `&page=${page}` : ""}`;

/**
 * Feedback inbox (SPEC §4, §8): every live item with its real author (also on anonymous
 * ones), newest first. The owner sets the status, writes the public reply and deletes
 * abusive items. Opens on Open, the items still waiting.
 */
export default function AdminFeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Feedback" />
      <Suspense fallback={<InboxSkeleton />}>
        <InboxData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function InboxData({ searchParams }: { searchParams: SearchParams }) {
  await requireOwner();
  await connection();
  const sp = await searchParams;
  const view: View = one(sp.status) === "all" ? "all" : (parseFeedbackStatus(one(sp.status)) ?? "open");
  const page = Math.max(1, Math.min(500, Number.parseInt(one(sp.page) ?? "1", 10) || 1));
  const from = (page - 1) * PAGE_SIZE;
  const now = nowMs();
  const supabase = await createClient();

  // The owner's session reads every row, deleted ones too (RLS), so live ones are filtered here.
  let list = supabase
    .from("feedback")
    .select(
      "id, message, is_anonymous, status, owner_reply, replied_at, created_at, author:profiles!feedback_user_id_fkey(full_name, email, phone), feedback_photos(path, position), reactions(count), comments(count)",
    )
    .is("deleted_at", null)
    .is("comments.deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (view !== "all") list = list.eq("status", view);

  const countOf = (status: FeedbackStatus | null) => {
    let q = supabase.from("feedback").select("id", { count: "exact", head: true }).is("deleted_at", null);
    if (status) q = q.eq("status", status);
    return q;
  };
  const [items, open, inProgress, resolved, all, settings] = await Promise.all([
    list,
    countOf("open"),
    countOf("in_progress"),
    countOf("resolved"),
    countOf(null),
    getPublicSettings(),
  ]);

  const failed = [items, open, inProgress, resolved, all].find((r) => r.error);
  if (failed?.error) {
    console.error("[admin] feedback inbox load failed:", failed.error.message);
    return (
      <p role="alert" className="rounded-[var(--radius-card)] bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger">
        We couldn&apos;t load the feedback. Please refresh the page.
      </p>
    );
  }

  const counts: Record<View, number> = {
    open: open.count ?? 0,
    in_progress: inProgress.count ?? 0,
    resolved: resolved.count ?? 0,
    all: all.count ?? 0,
  };
  const rows: InboxItem[] = (items.data ?? []).map((f) => ({
    id: f.id,
    authorName: f.author?.full_name ?? "Member",
    authorEmail: f.author?.email ?? null,
    authorPhone: f.author?.phone ? toLocalPhMobile(f.author.phone) : null,
    anonymous: f.is_anonymous,
    when: sentLabel(Date.parse(f.created_at), now),
    message: f.message,
    status: f.status,
    reply: f.owner_reply,
    repliedWhen: f.replied_at ? sentLabel(Date.parse(f.replied_at), now) : null,
    photos: [...f.feedback_photos].sort((a, b) => a.position - b.position).map((ph) => feedbackPhotoUrl(ph.path)),
    reactions: f.reactions[0]?.count ?? 0,
    comments: f.comments[0]?.count ?? 0,
  }));
  const total = counts[view];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <nav aria-label="Feedback status" className="w-fit max-w-full overflow-x-auto rounded-full bg-white p-1 shadow-[var(--shadow-soft)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-0.5">
          {VIEWS.map(({ view: key, label }) => {
            const active = key === view;
            return (
              <Link
                key={key}
                href={href(key)}
                aria-current={active ? "page" : undefined}
                className={
                  "flex min-h-11 shrink-0 touch-manipulation items-center justify-center gap-1 rounded-full px-3.5 text-[15px] font-semibold whitespace-nowrap transition-colors duration-150 " +
                  (active ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-ice-50 active:bg-ice-100")
                }
              >
                {label}
                <span className="tabular-nums">({counts[key]})</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* keyed so a new page or view starts with fresh state */}
      <FeedbackInbox key={`${view}-${page}`} view={view} items={rows} courtName={settings.court_name} />

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          <PageLink href={page > 1 ? href(view, page - 1) : null}>← Newer</PageLink>
          <span className="text-sm font-medium text-slate-500 tabular-nums">
            Page {page} of {pages}
          </span>
          <PageLink href={page < pages ? href(view, page + 1) : null}>Older →</PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({ href: to, children }: { href: string | null; children: React.ReactNode }) {
  const cls = "flex min-h-12 min-w-28 items-center justify-center rounded-full border border-line bg-white px-4 text-[15px] font-semibold";
  if (!to) {
    return (
      <span aria-disabled="true" className={`${cls} text-slate-300`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={to} className={`${cls} text-navy-900 hover:bg-ice-50 active:bg-ice-100`}>
      {children}
    </Link>
  );
}

function InboxSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading feedback">
      <div className="h-[52px] animate-pulse rounded-full bg-white/70 sm:w-[420px]" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-[var(--radius-card)] bg-white/70" />
      ))}
    </div>
  );
}

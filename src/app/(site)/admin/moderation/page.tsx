import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { one } from "@/lib/admin-period";
import { sentLabel } from "@/lib/admin-time";
import { requireOwner } from "@/lib/auth";
import { nowMs } from "@/lib/booking-time";
import { communityPhotoUrl } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { ModerationList, type ModerationItem, type ModerationView } from "./moderation-list";

export const metadata: Metadata = { title: "Moderation · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 20;

/**
 * Moderation (SPEC §4, §7): every live community post and comment, newest first, so the
 * owner can delete anything abusive. Feedback items join in Phase 6.
 */
export default function AdminModerationPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Moderation" />
      <Suspense fallback={<ModerationSkeleton />}>
        <ModerationData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ModerationData({ searchParams }: { searchParams: SearchParams }) {
  await requireOwner();
  await connection();
  const sp = await searchParams;
  const view: ModerationView = one(sp.view) === "comments" ? "comments" : "posts";
  const page = Math.max(1, Math.min(500, Number.parseInt(one(sp.page) ?? "1", 10) || 1));
  const from = (page - 1) * PAGE_SIZE;
  const now = nowMs();
  const supabase = await createClient();

  // The owner's session reads deleted rows too (RLS), so live ones are filtered here.
  const [posts, comments] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, caption, created_at, edited_at, author:profiles!posts_user_id_fkey(full_name, email), post_photos(path, position), reactions(count), comments(count)",
        { count: "exact" },
      )
      .is("deleted_at", null)
      .is("comments.deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(view === "posts" ? from : 0, view === "posts" ? from + PAGE_SIZE - 1 : 0),
    supabase
      .from("comments")
      .select(
        "id, body, created_at, author:profiles!comments_user_id_fkey(full_name, email), post:posts!comments_post_id_fkey!inner(id, caption, deleted_at, author:profiles!posts_user_id_fkey(full_name))",
        { count: "exact" },
      )
      .is("deleted_at", null)
      .is("post.deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(view === "comments" ? from : 0, view === "comments" ? from + PAGE_SIZE - 1 : 0),
  ]);

  if (posts.error || comments.error) {
    console.error("[admin] moderation load failed:", posts.error?.message ?? comments.error?.message);
    return (
      <p role="alert" className="rounded-[var(--radius-card)] bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger">
        We couldn&apos;t load the community posts. Please refresh the page.
      </p>
    );
  }

  const counts: Record<ModerationView, number> = { posts: posts.count ?? 0, comments: comments.count ?? 0 };
  const items: ModerationItem[] =
    view === "posts"
      ? posts.data.map((p) => ({
          kind: "post",
          id: p.id,
          authorName: p.author?.full_name ?? "Member",
          authorEmail: p.author?.email ?? null,
          when: sentLabel(Date.parse(p.created_at), now),
          edited: p.edited_at !== null,
          text: p.caption,
          photos: [...p.post_photos].sort((a, b) => a.position - b.position).map((ph) => communityPhotoUrl(ph.path)),
          reactions: p.reactions[0]?.count ?? 0,
          comments: p.comments[0]?.count ?? 0,
        }))
      : comments.data.map((c) => ({
          kind: "comment",
          id: c.id,
          authorName: c.author?.full_name ?? "Member",
          authorEmail: c.author?.email ?? null,
          when: sentLabel(Date.parse(c.created_at), now),
          text: c.body,
          postAuthor: c.post?.author?.full_name ?? "Member",
          postCaption: c.post?.caption ?? "",
        }));

  const total = counts[view];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <nav aria-label="Moderation" className="grid grid-cols-2 gap-1 rounded-full bg-white p-1 shadow-[var(--shadow-soft)] sm:w-fit sm:min-w-[320px]">
        {(["posts", "comments"] as const).map((key) => {
          const active = key === view;
          return (
            <Link
              key={key}
              href={`/admin/moderation?view=${key}`}
              aria-current={active ? "page" : undefined}
              className={
                "flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-full px-2 text-[15px] font-semibold whitespace-nowrap transition-colors duration-150 " +
                (active ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-ice-50 active:bg-ice-100")
              }
            >
              {key === "posts" ? "Posts" : "Comments"}
              <span className="tabular-nums">({counts[key]})</span>
            </Link>
          );
        })}
      </nav>

      {/* keyed so a new page or view starts with fresh state */}
      <ModerationList key={`${view}-${page}`} view={view} items={items} />

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          <PageLink href={page > 1 ? `/admin/moderation?view=${view}&page=${page - 1}` : null}>← Newer</PageLink>
          <span className="text-sm font-medium text-slate-500 tabular-nums">
            Page {page} of {pages}
          </span>
          <PageLink href={page < pages ? `/admin/moderation?view=${view}&page=${page + 1}` : null}>Older →</PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  const cls = "flex min-h-12 min-w-28 items-center justify-center rounded-full border border-line bg-white px-4 text-[15px] font-semibold";
  if (!href) {
    return (
      <span aria-disabled="true" className={`${cls} text-slate-300`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={`${cls} text-navy-900 hover:bg-ice-50 active:bg-ice-100`}>
      {children}
    </Link>
  );
}

function ModerationSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading posts">
      <div className="h-[52px] animate-pulse rounded-full bg-white/70 sm:w-[320px]" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-[var(--radius-card)] bg-white/70" />
      ))}
    </div>
  );
}

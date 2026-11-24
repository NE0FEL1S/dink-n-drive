import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cleanSearch, loadAdminBookings, PAGE_SIZE, parseStatusFilter } from "@/lib/admin-bookings";
import { one, periodParams, resolvePeriod } from "@/lib/admin-period";
import { requireOwner } from "@/lib/auth";
import { manilaDay, nowMs } from "@/lib/booking-time";
import { createClient } from "@/lib/supabase/server";
import { AdminFilters } from "../admin-filters";
import { BookingsTable } from "./bookings-table";

export const metadata: Metadata = { title: "Bookings · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Bookings (SPEC §4, §9): every booking and block by play date, with filters and search. */
export default function AdminBookingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Bookings" />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-white/70" />}>
        <BookingsData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BookingsData({ searchParams }: { searchParams: SearchParams }) {
  await requireOwner();
  await connection();
  const sp = await searchParams;
  const period = resolvePeriod({ period: one(sp.period), from: one(sp.from), to: one(sp.to) }, manilaDay(nowMs()), "today");
  const status = parseStatusFilter(one(sp.status));
  const q = cleanSearch(one(sp.q));
  const page = Math.max(1, Math.floor(Number(one(sp.page)) || 1));

  const { rows, total } = await loadAdminBookings({ period, status, q }, page);

  // Receipts are in a private bucket: one-hour signed links, made with the owner's session.
  const proofUrls = new Map<string, string>();
  const withProof = rows.filter((r) => r.proofPath);
  if (withProof.length) {
    const supabase = await createClient();
    const { data } = await supabase.storage
      .from("payment-proofs")
      .createSignedUrls(withProof.map((r) => r.proofPath!), 60 * 60);
    const byPath = new Map((data ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path!, s.signedUrl]));
    for (const r of withProof) {
      const url = byPath.get(r.proofPath!);
      if (url) proofUrls.set(r.id, url);
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => {
    const params = new URLSearchParams(periodParams(period));
    if (status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    if (n > 1) params.set("page", String(n));
    return `/admin/bookings?${params}`;
  };
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, page * PAGE_SIZE);

  return (
    <div className="grid gap-4">
      <AdminFilters path="/admin/bookings" title="Filters" period={period} search={{ status, q }} />

      {rows.length === 0 ? (
        <Card>
          <p className="text-[15px] leading-6 text-navy-700">
            {total > 0
              ? "There's nothing on this page. Go back to the first page."
              : q || status !== "all"
                ? "No bookings match these filters."
                : "No bookings in this period yet."}
          </p>
        </Card>
      ) : (
        <>
          <p className="px-1 text-sm font-semibold text-slate-500" role="status">
            {total === 1 ? "1 booking" : `${total} bookings`}
            {pages > 1 ? ` · showing ${first}–${last}` : ""}
          </p>
          <BookingsTable rows={rows} proofUrls={proofUrls} />
        </>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonClass("secondary", "px-4")}>
              <ChevronLeft className="size-5" aria-hidden="true" /> Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm font-semibold text-slate-500 tabular-nums">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className={buttonClass("secondary", "px-4")}>
              Next <ChevronRight className="size-5" aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

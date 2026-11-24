import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { CheckCircle2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPendingReviewCount } from "@/lib/admin";
import { adminError } from "@/lib/admin-errors";
import { one, resolvePeriod } from "@/lib/admin-period";
import { requireOwner } from "@/lib/auth";
import { manilaDay, nowMs } from "@/lib/booking-time";
import { peso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { AdminFilters } from "./admin-filters";

export const metadata: Metadata = { title: "Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Overview (SPEC §4, §9): payments waiting, then the summary cards for a period (this month by default). */
export default function AdminOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Overview" />
      <Suspense fallback={<div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-white/70" />}>
        <PaymentsCallout />
      </Suspense>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-[var(--radius-card)] bg-white/70" />}>
        <Summary searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PaymentsCallout() {
  await requireOwner();
  const pending = await getPendingReviewCount();

  if (pending === 0) {
    return (
      <Card className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success-bg">
          <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
        </span>
        <div className="grid gap-1">
          <h2 className="text-[17px] leading-6 font-semibold text-navy-900">All caught up</h2>
          <p className="text-[15px] leading-6 text-navy-700">No payments are waiting for review.</p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="grid gap-4 sm:flex sm:items-center">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-orange-50">
          <Wallet className="size-5 text-orange-500" aria-hidden="true" />
        </span>
        <div className="grid gap-1">
          <h2 className="text-[17px] leading-6 font-semibold text-navy-900">
            {pending === 1 ? "1 payment is" : `${pending} payments are`} waiting for review
          </h2>
          <p className="text-[15px] leading-6 text-navy-700">Check each GCash screenshot, then approve or reject it.</p>
        </div>
      </div>
      <ButtonLink href="/admin/payments" variant="primary" className="w-full sm:ml-auto sm:w-auto">
        Review payments
      </ButtonLink>
    </Card>
  );
}

async function Summary({ searchParams }: { searchParams: SearchParams }) {
  await requireOwner();
  await connection();
  const sp = await searchParams;
  const period = resolvePeriod({ period: one(sp.period), from: one(sp.from), to: one(sp.to) }, manilaDay(nowMs()), "month");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_summary", { p_from: period.from, p_to: period.to }).single();

  return (
    <section aria-label="Summary" className="grid gap-4">
      <AdminFilters path="/admin" title="Earnings" period={period} />
      {error || !data ? (
        <p role="alert" className="rounded-[var(--radius-card)] bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger">
          {error ? adminError(error.message) : "We couldn't load the summary."} Please refresh the page.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total earnings" value={peso(data.total_earnings)} featured hint="Court + paddles + kept cancellation fees" />
          <Stat label="Court revenue" value={peso(data.court_revenue)} />
          <Stat label="Paddle revenue" value={peso(data.paddle_revenue)} />
          <Stat label="Cancellation fees" value={peso(data.cancel_fees)} hint="Kept after refunds are sent" />
          <Stat label="Refunds" value={peso(data.refunds)} hint="Sent back to customers" />
          <Stat label="Bookings" value={data.bookings.toLocaleString("en-PH")} hint="Confirmed" />
          <Stat label="Hours booked" value={data.hours.toLocaleString("en-PH")} hint="Confirmed" />
          <Stat
            label="Pending payments"
            value={data.pending_review.toLocaleString("en-PH")}
            hint={data.pending_review > 0 ? `${peso(data.pending_review_amount)} to review` : "Nothing to review"}
            href={data.pending_review > 0 ? "/admin/payments" : undefined}
            wide
          />
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  featured = false,
  wide = false,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  featured?: boolean;
  /** Two columns wide (fills the grid's last row). */
  wide?: boolean;
  href?: string;
}) {
  const body: ReactNode = (
    <>
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p
        className={
          featured
            ? "font-display text-[34px] leading-10 font-semibold text-navy-900 tabular-nums"
            : "text-[22px] leading-8 font-bold text-navy-900 tabular-nums"
        }
      >
        {value}
      </p>
      {hint && <p className="text-sm text-slate-500">{hint}</p>}
    </>
  );
  const className = `grid content-start gap-0.5 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-soft)] ${
    featured ? "col-span-2 lg:row-span-2 lg:content-center lg:p-6" : wide ? "col-span-2" : ""
  }`;
  return href ? (
    <Link href={href} className={`${className} transition-colors duration-150 hover:bg-ice-50 active:bg-ice-100`} aria-label={`${label}: ${value}. ${hint ?? ""}`}>
      {body}
    </Link>
  ) : (
    <div className={className} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      {body}
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckCircle2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPendingReviewCount } from "@/lib/admin";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin" };

/** Overview (SPEC §4). The summary cards and filters arrive with the bookings table (Phase 3 part D). */
export default function AdminOverviewPage() {
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Overview" />
      <Suspense fallback={<div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-white/70" />}>
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  await requireOwner();
  const pending = await getPendingReviewCount();

  return (
    <div className="grid gap-4">
      {pending > 0 ? (
        <Card className="grid gap-4 sm:flex sm:items-center">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-orange-50">
              <Wallet className="size-5 text-orange-500" aria-hidden="true" />
            </span>
            <div className="grid gap-1">
              <h2 className="text-[17px] leading-6 font-semibold text-navy-900">
                {pending === 1 ? "1 payment is" : `${pending} payments are`} waiting for review
              </h2>
              <p className="text-[15px] leading-6 text-navy-700">
                Check each GCash screenshot, then approve or reject it.
              </p>
            </div>
          </div>
          <ButtonLink href="/admin/payments" variant="primary" className="w-full sm:ml-auto sm:w-auto">
            Review payments
          </ButtonLink>
        </Card>
      ) : (
        <Card className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success-bg">
            <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          </span>
          <div className="grid gap-1">
            <h2 className="text-[17px] leading-6 font-semibold text-navy-900">All caught up</h2>
            <p className="text-[15px] leading-6 text-navy-700">No payments are waiting for review.</p>
          </div>
        </Card>
      )}
    </div>
  );
}

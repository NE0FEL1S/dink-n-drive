import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { getPendingReviewCount } from "@/lib/admin";
import { requireOwner } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Owner area (SPEC §4): tabs on phones, a left sidebar from 1024 px (DESIGN §5 "Admin").
 * The proxy already sends non-owners away; every page and action checks again on the
 * server, and RLS checks again in the database.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom))] min-[390px]:px-5 sm:pt-8 lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start lg:gap-8 lg:pt-12">
      <AdminNav
        paymentsBadge={
          <Suspense fallback={null}>
            <PendingReviewBadge />
          </Suspense>
        }
      />
      <div className="min-w-0">{children}</div>
    </main>
  );
}

async function PendingReviewBadge() {
  await requireOwner();
  const count = await getPendingReviewCount();
  if (count === 0) return null;
  return (
    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-orange-600 px-1.5 text-xs leading-none font-bold text-white tabular-nums">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> waiting for review</span>
    </span>
  );
}

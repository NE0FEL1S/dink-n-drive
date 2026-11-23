import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] min-[390px]:px-5">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-ice-100" />}>
        <AdminHome />
      </Suspense>
    </main>
  );
}

async function AdminHome() {
  // The proxy already redirects non-owners; check again on the server (and RLS checks in the database).
  const owner = await requireOwner();

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Owner" title="Admin" />
      <Card>
        <p className="text-base text-navy-700">
          Signed in as <b className="text-navy-900">{owner.full_name ?? owner.email}</b>. The payment queue, bookings,
          refunds, customers and settings arrive in the next phases.
        </p>
      </Card>
    </div>
  );
}

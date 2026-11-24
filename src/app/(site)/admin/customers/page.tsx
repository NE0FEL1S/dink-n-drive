import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  cleanCustomerSearch,
  CUSTOMER_PAGE_SIZE,
  loadCustomers,
  parseCustomerSort,
  type CustomerSort,
} from "@/lib/admin-customers";
import { one } from "@/lib/admin-period";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CustomerFilters } from "./customer-filters";
import { CustomerList } from "./customer-list";

export const metadata: Metadata = { title: "Customers · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Customers (SPEC §4): guests and account holders grouped by phone number, with paid
 * bookings, hours, total spent and visits. Search and sort live in the URL.
 */
export default function AdminCustomersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Customers" />
      <Suspense fallback={<CustomersSkeleton />}>
        <CustomersData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CustomersData({ searchParams }: { searchParams: SearchParams }) {
  await requireOwner();
  await connection();
  const sp = await searchParams;
  const q = cleanCustomerSearch(one(sp.q));
  const sort = parseCustomerSort(one(sp.sort));
  const page = Math.max(1, Math.min(500, Number.parseInt(one(sp.page) ?? "1", 10) || 1));

  const supabase = await createClient();
  const result = await loadCustomers(supabase, { q, sort, page });

  if ("error" in result) {
    return (
      <div className="grid gap-4">
        <CustomerFilters q={q} sort={sort} />
        <p role="alert" className="rounded-[var(--radius-card)] bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger">
          We couldn&apos;t load the customers. Please refresh the page.
        </p>
      </div>
    );
  }

  const { rows, total } = result;
  const pages = Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * CUSTOMER_PAGE_SIZE + 1;
  const last = Math.min(total, page * CUSTOMER_PAGE_SIZE);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <CustomerFilters q={q} sort={sort} />

      {rows.length === 0 ? (
        <EmptyState q={q} pastEnd={page > 1} />
      ) : (
        <>
          <p className="px-1 text-sm font-semibold text-slate-500" role="status">
            {total === 1 ? "1 customer" : `${total} customers`}
            {q ? ` matching “${q}”` : ""}
            {pages > 1 ? ` · showing ${first}–${last}` : ""}
          </p>
          <CustomerList rows={rows} />
        </>
      )}

      {pages > 1 && rows.length > 0 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={pageHref(q, sort, page - 1)} className={buttonClass("secondary", "px-4")}>
              <ChevronLeft className="size-5" aria-hidden="true" /> Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm font-semibold text-slate-500 tabular-nums">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={pageHref(q, sort, page + 1)} className={buttonClass("secondary", "px-4")}>
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

function pageHref(q: string, sort: CustomerSort, n: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort !== "recent") params.set("sort", sort);
  if (n > 1) params.set("page", String(n));
  const s = params.toString();
  return s ? `/admin/customers?${s}` : "/admin/customers";
}

function EmptyState({ q, pastEnd }: { q: string; pastEnd: boolean }) {
  return (
    <Card className="flex items-start gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ice-100">
        <Users className="size-5 text-navy-700" aria-hidden="true" />
      </span>
      <div className="grid gap-1">
        <h2 className="text-[17px] leading-6 font-semibold text-navy-900">
          {pastEnd ? "There's nothing on this page." : q ? "No customers match your search." : "No customers yet."}
        </h2>
        <p className="text-[15px] leading-6 text-navy-700">
          {pastEnd || q ? (
            <Link href="/admin/customers" className="font-semibold text-glacier-700 hover:underline">
              Show all customers
            </Link>
          ) : (
            "People show up here after they book or sign up."
          )}
        </p>
      </div>
    </Card>
  );
}

function CustomersSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading customers">
      <div className="h-[196px] animate-pulse rounded-[var(--radius-card)] bg-white/70 md:h-[148px]" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-48 animate-pulse rounded-[var(--radius-card)] bg-white/70" />
      ))}
    </div>
  );
}

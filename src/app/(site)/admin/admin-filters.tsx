"use client";

import Form from "next/form";
import Link from "next/link";
import { useId } from "react";
import { Search } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { STATUS_LABELS, type BookingStatus } from "@/components/ui/status-badge";
import { PERIOD_OPTIONS, type Period, type PeriodKey, type StatusFilter } from "@/lib/admin-period";

const STATUS_ORDER: BookingStatus[] = [
  "confirmed",
  "pending_review",
  "pending_payment",
  "cancel_requested",
  "cancelled",
  "rejected",
  "expired",
  "blocked",
];

const inputClass =
  "h-12 w-full min-w-0 rounded-[var(--radius-control)] border border-line bg-white px-4 text-base text-navy-900 " +
  "outline-none transition-[border-color,box-shadow] duration-150 focus:border-orange-600 focus:ring-2 focus:ring-orange-500/40";

type Props = {
  path: "/admin" | "/admin/bookings";
  title: string;
  period: Period;
  /** Bookings page only: status filter and search. */
  search?: { status: StatusFilter; q: string };
};

/**
 * Period chips (links) plus, for a custom range or the bookings search, a GET form. Every
 * filter lives in the URL, so the page renders on the server and the exports can reuse it.
 */
export function AdminFilters({ path, title, period, search }: Props) {
  const id = useId();
  const href = (key: PeriodKey) => {
    const params = new URLSearchParams({ period: key });
    if (key === "custom") {
      params.set("from", period.from);
      params.set("to", period.to);
    }
    if (search) {
      if (search.status !== "all") params.set("status", search.status);
      if (search.q) params.set("q", search.q);
    }
    return `${path}?${params}`;
  };

  return (
    <Card className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[20px] leading-7 font-bold text-navy-900">{title}</h2>
        <p className="text-sm font-semibold text-slate-500" data-testid="period-label">
          {period.label}
        </p>
      </div>

      <nav aria-label="Period" className="flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((o) => {
          const active = period.key === o.key;
          return (
            <Link
              key={o.key}
              href={href(o.key)}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={
                "flex min-h-11 touch-manipulation items-center rounded-full border px-4 text-sm font-semibold transition-colors duration-150 " +
                (active
                  ? "border-navy-900 bg-navy-900 text-white"
                  : "border-line bg-white text-navy-900 hover:bg-ice-50 active:bg-ice-100")
              }
            >
              {o.label}
            </Link>
          );
        })}
      </nav>

      {(period.key === "custom" || search) && (
        <Form
          // remount when the URL's filter changes, so the inputs show the current values
          key={`${period.key}|${period.from}|${period.to}|${search?.status}|${search?.q}`}
          action={path}
          scroll={false}
          className="grid gap-3"
        >
          {period.key === "custom" ? (
            <div className="grid gap-3 min-[420px]:grid-cols-2 sm:max-w-md">
              <input type="hidden" name="period" value="custom" />
              <div className="grid gap-1.5">
                <label htmlFor={`${id}-from`} className="text-sm font-semibold text-navy-900">From</label>
                <input id={`${id}-from`} type="date" name="from" defaultValue={period.from} required className={inputClass} />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor={`${id}-to`} className="text-sm font-semibold text-navy-900">To</label>
                <input id={`${id}-to`} type="date" name="to" defaultValue={period.to} required className={inputClass} />
              </div>
            </div>
          ) : (
            <input type="hidden" name="period" value={period.key} />
          )}

          {search && (
            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <div className="grid gap-1.5">
                <label htmlFor={`${id}-status`} className="text-sm font-semibold text-navy-900">Status</label>
                <select
                  id={`${id}-status`}
                  name="status"
                  defaultValue={search.status}
                  onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  className={`${inputClass} appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='20'%20height='20'%20fill='none'%20stroke='%231F3453'%20stroke-width='2'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='m5%208%205%205%205-5'/%3E%3C/svg%3E")] bg-[right_12px_center] bg-no-repeat pr-10`}
                >
                  <option value="all">All, including blocks</option>
                  <option value="no_blocks">All except blocks</option>
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {s === "blocked" ? "Blocked hours" : STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor={`${id}-q`} className="text-sm font-semibold text-navy-900">Search</label>
                <span className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                  <input
                    id={`${id}-q`}
                    type="search"
                    name="q"
                    defaultValue={search.q}
                    maxLength={60}
                    enterKeyHint="search"
                    autoComplete="off"
                    placeholder="Reference, name, phone or email"
                    className={`${inputClass} pl-12 placeholder:text-slate-300`}
                  />
                </span>
              </div>
            </div>
          )}

          <button type="submit" className={buttonClass("secondary", "w-full sm:w-fit")}>
            {search ? "Apply filters" : "Show this range"}
          </button>
        </Form>
      )}
    </Card>
  );
}

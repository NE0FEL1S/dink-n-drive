"use client";

import Form from "next/form";
import { useId } from "react";
import { Search } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CUSTOMER_SORTS, type CustomerSort } from "@/lib/admin-customers";

const inputClass =
  "h-12 w-full min-w-0 rounded-[var(--radius-control)] border border-line bg-white px-4 text-base text-navy-900 " +
  "outline-none transition-[border-color,box-shadow] duration-150 focus:border-orange-600 focus:ring-2 focus:ring-orange-500/40";

const selectArrow =
  `appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='20'%20height='20'%20fill='none'%20stroke='%231F3453'%20stroke-width='2'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='m5%208%205%205%205-5'/%3E%3C/svg%3E")] bg-[right_12px_center] bg-no-repeat pr-10`;

/** Search + sort, as a GET form: everything lives in the URL, so the page renders on the server. */
export function CustomerFilters({ q, sort }: { q: string; sort: CustomerSort }) {
  const id = useId();
  return (
    <Card>
      <Form key={`${q}|${sort}`} action="/admin/customers" scroll={false} className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-q`} className="text-sm font-semibold text-navy-900">Search</label>
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <input
                id={`${id}-q`}
                type="search"
                name="q"
                defaultValue={q}
                maxLength={60}
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Name, phone or email"
                className={`${inputClass} pl-12 placeholder:text-slate-300`}
              />
            </span>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-sort`} className="text-sm font-semibold text-navy-900">Sort by</label>
            <select
              id={`${id}-sort`}
              name="sort"
              defaultValue={sort}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className={`${inputClass} ${selectArrow}`}
            >
              {CUSTOMER_SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" className={buttonClass("secondary", "w-full sm:w-fit")}>
          Search
        </button>
      </Form>
    </Card>
  );
}

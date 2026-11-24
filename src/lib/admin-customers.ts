import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Admin → Customers (SPEC §4): guests and account holders grouped by phone number, read with
 * the owner-only admin_customers function (supabase/migrations/*_customers_earnings.sql).
 */

export const CUSTOMER_PAGE_SIZE = 20;

export const CUSTOMER_SORTS = [
  { key: "recent", label: "Recent activity" },
  { key: "spent", label: "Total spent" },
  { key: "bookings", label: "Most bookings" },
  { key: "name", label: "Name (A–Z)" },
] as const;

export type CustomerSort = (typeof CUSTOMER_SORTS)[number]["key"];

export function parseCustomerSort(value: string | undefined): CustomerSort {
  return CUSTOMER_SORTS.some((s) => s.key === value) ? (value as CustomerSort) : "recent";
}

/** Same limit as the bookings search; the database allows up to 100. */
export function cleanCustomerSearch(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
}

export type CustomerAccount = {
  id: string;
  name: string | null;
  email: string | null;
  /** Has an email + password login, so the owner may set a new password (Phase 7C). */
  canReset: boolean;
};

export type CustomerRow = {
  /** Stable key for React: the phone, or the account id for accounts without a phone. */
  key: string;
  phone: string | null;
  name: string;
  email: string | null;
  accounts: CustomerAccount[];
  /** Counted (paid) bookings, as in the earnings rule. */
  bookings: number;
  guestBookings: number;
  hours: number;
  totalSpent: number;
  lastVisit: string | null;
  nextVisit: string | null;
};

type RawAccount = { id: string; name: string | null; email: string | null; can_reset: boolean };

function parseAccounts(value: unknown): CustomerAccount[] {
  if (!Array.isArray(value)) return [];
  return (value as RawAccount[]).map((a) => ({ id: a.id, name: a.name, email: a.email, canReset: a.can_reset === true }));
}

export async function loadCustomers(
  supabase: SupabaseClient<Database>,
  { q, sort, page }: { q: string; sort: CustomerSort; page: number },
): Promise<{ rows: CustomerRow[]; total: number } | { error: string }> {
  const { data, error } = await supabase.rpc("admin_customers", {
    p_search: q || undefined,
    p_sort: sort,
    p_limit: CUSTOMER_PAGE_SIZE,
    p_offset: (page - 1) * CUSTOMER_PAGE_SIZE,
  });
  if (error) {
    console.error("[admin] admin_customers failed:", error.code ?? "", error.message);
    return { error: error.message };
  }

  const rows = data.map((r): CustomerRow => {
    const accounts = parseAccounts(r.accounts);
    return {
      key: r.phone ?? accounts[0]?.id ?? r.email ?? r.name,
      phone: r.phone,
      name: r.name ?? accounts[0]?.email ?? "No name yet",
      email: r.email,
      accounts,
      bookings: r.bookings,
      guestBookings: r.guest_bookings,
      hours: r.hours,
      totalSpent: r.total_spent,
      lastVisit: r.last_visit,
      nextVisit: r.next_visit,
    };
  });
  return { rows, total: data[0]?.total_count ?? 0 };
}

/** "+639171234567" → "0917 123 4567" (how customers write their number). */
export function localPhone(phone: string): string {
  const m = /^\+63(9\d{2})(\d{3})(\d{4})$/.exec(phone);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : phone;
}

/** A visit's play date in Manila: "Nov 21, 2026". */
export function visitDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
}

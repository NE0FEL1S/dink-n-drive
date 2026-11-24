import type { NextRequest } from "next/server";
import { STATUS_LABELS } from "@/components/ui/status-badge";
import { cleanSearch, loadAdminBookings, parseStatusFilter } from "@/lib/admin-bookings";
import { buildPdf, buildXlsx, exportFileName, type ExportMeta } from "@/lib/admin-export";
import { resolvePeriod } from "@/lib/admin-period";
import { getProfile } from "@/lib/auth";
import { manilaDay } from "@/lib/booking-time";
import { getPublicSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /admin/bookings/export?format=xlsx|pdf&period=…&from=…&to=…&status=…&q=…
 * The bookings list as Excel or PDF, with the same filter as the Bookings page (SPEC §9).
 * Owner only: the proxy redirects others, this checks again, and RLS checks in the database.
 */
export async function GET(request: NextRequest) {
  const profile = await getProfile();
  if (profile?.role !== "owner") return new Response("Only the court owner can export bookings.", { status: 403 });

  const sp = request.nextUrl.searchParams;
  const format = sp.get("format");
  if (format !== "xlsx" && format !== "pdf") return new Response("Use format=xlsx or format=pdf.", { status: 400 });

  const now = Date.now();
  const period = resolvePeriod(
    { period: sp.get("period") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined },
    manilaDay(now),
    "today",
  );
  const status = parseStatusFilter(sp.get("status") ?? undefined);
  const q = cleanSearch(sp.get("q") ?? undefined);

  const supabase = await createClient();
  const [{ rows }, summaryResult, settings] = await Promise.all([
    loadAdminBookings({ period, status, q }, null),
    supabase.rpc("admin_summary", { p_from: period.from, p_to: period.to }).single(),
    getPublicSettings(),
  ]);
  if (summaryResult.error || !summaryResult.data) {
    console.error("[admin] export summary failed:", summaryResult.error?.message);
    return new Response("We couldn't build the export. Please try again.", { status: 500 });
  }

  const meta: ExportMeta = {
    courtName: settings.court_name,
    periodLabel: period.label,
    from: period.from,
    to: period.to,
    statusLabel:
      status === "all" ? "All, including blocks" : status === "no_blocks" ? "All except blocks" : status === "blocked" ? "Blocked hours" : STATUS_LABELS[status],
    search: q,
    generatedAt: new Date(now).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  };

  const body = format === "xlsx" ? await buildXlsx(rows, summaryResult.data, meta) : buildPdf(rows, summaryResult.data, meta);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type":
        format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      "Content-Disposition": `attachment; filename="${exportFileName(meta, format)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

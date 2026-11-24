import "server-only";

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { STATUS_LABELS } from "@/components/ui/status-badge";
import type { AdminBookingRow } from "@/lib/admin-bookings";
import { dayLabel, timeLabel } from "@/lib/booking-time";
import { manilaDateTime } from "@/lib/format";
import type { Database } from "@/types/database";

export type Summary = Database["public"]["Functions"]["admin_summary"]["Returns"][number];

/** What the export is of: shown in the file's header and its name. */
export type ExportMeta = {
  courtName: string;
  /** "November 2026" */
  periodLabel: string;
  from: string;
  to: string;
  /** "All, including blocks" · "Confirmed" … */
  statusLabel: string;
  search: string;
  /** "Nov 24, 2026, 3:41 PM" (Manila) */
  generatedAt: string;
};

export function exportFileName(meta: Pick<ExportMeta, "from" | "to">, ext: "xlsx" | "pdf"): string {
  const range = meta.from === meta.to ? meta.from : `${meta.from}-to-${meta.to}`;
  return `dink-n-drive-bookings-${range}.${ext}`;
}

/** Totals of the bookings that count as earnings (SPEC §9), for the totals row. */
function countedTotals(rows: AdminBookingRow[]) {
  const counted = rows.filter((r) => r.counted);
  const sum = (f: (r: AdminBookingRow) => number) => counted.reduce((a, r) => a + f(r), 0);
  return {
    bookings: counted.length,
    hours: sum((r) => r.hours),
    court: sum((r) => r.courtFee),
    paddle: sum((r) => r.paddleFee),
    total: sum((r) => r.total),
  };
}

function cancelledText(r: AdminBookingRow): string {
  return r.cancelledBy ? `by ${r.cancelledBy}` : "";
}

/* ---------------------------------------------------------------------------------------------- */
/* Excel                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

const PESO = '"₱"#,##0';
const NAVY = "FF0F1B33";
const ICE = "FFF4F8FB";

/** One row per booking + a totals row (SPEC §9), and a Summary sheet with the period's cards. */
export async function buildXlsx(rows: AdminBookingRow[], summary: Summary, meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.courtName;
  wb.created = new Date();

  const ws = wb.addWorksheet("Bookings", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Reference", key: "ref", width: 12 },
    { header: "Play date", key: "date", width: 14 },
    { header: "Start", key: "start", width: 10 },
    { header: "End", key: "end", width: 10 },
    { header: "Hours", key: "hours", width: 7 },
    { header: "Customer", key: "name", width: 24 },
    { header: "Guest / account", key: "type", width: 15 },
    { header: "Phone", key: "phone", width: 14 },
    { header: "Email", key: "email", width: 30 },
    { header: "Paddles", key: "paddles", width: 9 },
    { header: "Court fee", key: "court", width: 11, style: { numFmt: PESO } },
    { header: "Paddle fee", key: "paddle", width: 11, style: { numFmt: PESO } },
    { header: "Total", key: "total", width: 11, style: { numFmt: PESO } },
    { header: "Status", key: "status", width: 22 },
    { header: "Counts as earnings", key: "counted", width: 10 },
    { header: "Payment screenshot", key: "proof", width: 11 },
    { header: "Approved / rejected by", key: "reviewer", width: 20 },
    { header: "Reviewed at", key: "reviewedAt", width: 18 },
    { header: "Cancelled", key: "cancelled", width: 13 },
    { header: "Refund", key: "refund", width: 10, style: { numFmt: PESO } },
    { header: "Note / reason", key: "note", width: 36 },
  ];

  for (const r of rows) {
    const [y, m, d] = r.day.split("-").map(Number);
    ws.addRow({
      ref: r.ref,
      date: new Date(Date.UTC(y, m - 1, d)),
      start: timeLabel(r.startHour),
      end: timeLabel(r.endHour),
      hours: r.hours,
      name: r.isBlock ? "Owner block" : r.name,
      type: r.isBlock ? "" : r.isGuest ? "Guest" : "Account",
      phone: r.phone,
      email: r.email,
      paddles: r.isBlock ? "" : r.paddles ? "Y" : "N",
      court: r.isBlock ? null : r.courtFee,
      paddle: r.isBlock ? null : r.paddleFee,
      total: r.isBlock ? null : r.total,
      status: r.isBlock ? "Blocked" : STATUS_LABELS[r.status],
      counted: r.counted ? "Y" : "N",
      proof: r.proofPath ? "Y" : "",
      reviewer: r.reviewedBy ?? "",
      reviewedAt: r.reviewedAt ? manilaDateTime(r.reviewedAt) : "",
      cancelled: cancelledText(r),
      refund: r.refundAmount,
      note: r.isBlock ? (r.blockNote ?? "") : (r.rejectReason ?? ""),
    });
  }
  ws.getColumn("date").numFmt = "ddd, mmm d, yyyy";

  const t = countedTotals(rows);
  const totals = ws.addRow({
    ref: "Totals",
    name: `${t.bookings} confirmed ${t.bookings === 1 ? "booking" : "bookings"}`,
    hours: t.hours,
    court: t.court,
    paddle: t.paddle,
    total: t.total,
    status: "Confirmed only",
  });
  totals.font = { bold: true };
  totals.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ICE } };
  totals.eachCell((c) => (c.border = { top: { style: "thin", color: { argb: NAVY } } }));

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 30;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

  const sum = wb.addWorksheet("Summary");
  sum.columns = [
    { key: "label", width: 30 },
    { key: "value", width: 22 },
  ];
  const lines: [string, string | number, string?][] = [
    [meta.courtName, ""],
    ["Bookings export", ""],
    ["Period", meta.periodLabel],
    ["Status filter (Bookings sheet)", meta.statusLabel],
    ["Search (Bookings sheet)", meta.search || "—"],
    ["Generated (Manila time)", meta.generatedAt],
    ["", ""],
    ["Summary for the whole period", ""],
    ["Total earnings", summary.total_earnings, PESO],
    ["Court revenue", summary.court_revenue, PESO],
    ["Paddle revenue", summary.paddle_revenue, PESO],
    ["Cancellation fees (kept)", summary.cancel_fees, PESO],
    ["Refunds (sent back)", summary.refunds, PESO],
    ["Bookings (confirmed)", summary.bookings],
    ["Hours booked (confirmed)", summary.hours],
    ["Pending payments (to review)", summary.pending_review],
    ["Pending payments amount", summary.pending_review_amount, PESO],
  ];
  for (const [label, value, fmt] of lines) {
    const row = sum.addRow({ label, value });
    if (fmt) row.getCell("value").numFmt = fmt;
  }
  sum.getRow(1).font = { bold: true, size: 14 };
  sum.getRow(8).font = { bold: true };
  sum.getRow(9).font = { bold: true };
  sum.getColumn("value").alignment = { horizontal: "left" };
  sum.addRow({});
  sum.addRow({ label: "Earnings count confirmed bookings plus cancellation fees kept after a refund is sent." });
  sum.addRow({ label: "The Summary covers every booking in the period; the Bookings sheet follows the status filter and search." });

  // Tag the sheets so a spreadsheet opened later still says where it came from.
  ws.headerFooter.oddFooter = `${meta.courtName} · ${meta.periodLabel} · Page &P of &N`;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ---------------------------------------------------------------------------------------------- */
/* PDF                                                                                             */
/* ---------------------------------------------------------------------------------------------- */

/** The PDF's built-in fonts have no ₱ sign, so money reads "PHP 1,250" (common on PH receipts). */
function php(n: number): string {
  return `PHP ${n.toLocaleString("en-PH")}`;
}

const NAVY_RGB: [number, number, number] = [15, 27, 51];
const SLATE_RGB: [number, number, number] = [91, 107, 130];
const ICE_RGB: [number, number, number] = [244, 248, 251];
const LINE_RGB: [number, number, number] = [223, 231, 239];

/** A4 landscape: header with the court name and period, summary totals, then the bookings table (SPEC §9). */
export function buildPdf(rows: AdminBookingRow[], summary: Summary, meta: ExportMeta): ArrayBuffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...NAVY_RGB);
  doc.text(meta.courtName, margin, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Bookings · ${meta.periodLabel}`, margin, 23);
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_RGB);
  const filters = [`Status: ${meta.statusLabel}`, meta.search ? `Search: "${meta.search}"` : null].filter(Boolean).join("   ·   ");
  doc.text(filters, margin, 28.5);
  doc.text(`Generated ${meta.generatedAt} (Manila time)`, pageWidth - margin, 16, { align: "right" });

  autoTable(doc, {
    startY: 33,
    margin: { left: margin, right: margin },
    theme: "grid",
    head: [["Total earnings", "Court revenue", "Paddle revenue", "Cancellation fees", "Refunds", "Bookings", "Hours booked", "Pending review"]],
    body: [
      [
        php(summary.total_earnings),
        php(summary.court_revenue),
        php(summary.paddle_revenue),
        php(summary.cancel_fees),
        php(summary.refunds),
        String(summary.bookings),
        String(summary.hours),
        `${summary.pending_review} (${php(summary.pending_review_amount)})`,
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: LINE_RGB, lineWidth: 0.2, textColor: NAVY_RGB },
    headStyles: { fillColor: ICE_RGB, textColor: SLATE_RGB, fontStyle: "bold", fontSize: 7.5 },
    bodyStyles: { fontStyle: "bold", fontSize: 10 },
  });

  const t = countedTotals(rows);
  const afterSummary = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  autoTable(doc, {
    startY: afterSummary + 6,
    margin: { left: margin, right: margin, bottom: 14 },
    theme: "striped",
    head: [["Ref", "Play date", "Time", "Hrs", "Customer", "Email", "Paddles", "Court", "Paddle fee", "Total", "Status", "Reviewed by"]],
    body: rows.map((r) => [
      r.ref,
      dayLabel(r.day),
      `${timeLabel(r.startHour)} – ${timeLabel(r.endHour)}`,
      String(r.hours),
      r.isBlock ? `Owner block${r.blockNote ? `\n${r.blockNote}` : ""}` : `${r.name} (${r.isGuest ? "guest" : "account"})\n${r.phone}`,
      r.isBlock ? "" : r.email,
      r.isBlock ? "" : r.paddles ? "Y" : "N",
      r.isBlock ? "" : php(r.courtFee),
      r.isBlock ? "" : php(r.paddleFee),
      r.isBlock ? "" : php(r.total),
      [r.isBlock ? "Blocked" : STATUS_LABELS[r.status], cancelledText(r), r.refundAmount !== null ? `refund ${php(r.refundAmount)}` : ""]
        .filter(Boolean)
        .join("\n"),
      r.reviewedBy ?? "",
    ]),
    foot: [
      [
        "Totals",
        "",
        "",
        String(t.hours),
        `${t.bookings} confirmed`,
        "",
        "",
        php(t.court),
        php(t.paddle),
        php(t.total),
        "Confirmed only",
        "",
      ],
    ],
    showFoot: "lastPage",
    styles: { fontSize: 7.5, cellPadding: 1.6, textColor: NAVY_RGB, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: NAVY_RGB, textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: ICE_RGB, textColor: NAVY_RGB, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 252, 253] },
    columnStyles: {
      // A4 landscape leaves 273 mm; these take 250, so "Reviewed by" gets ~23 mm.
      0: { cellWidth: 21, fontStyle: "bold" },
      1: { cellWidth: 19 },
      2: { cellWidth: 30 },
      3: { cellWidth: 9, halign: "right" },
      4: { cellWidth: 38 },
      5: { cellWidth: 38 },
      6: { cellWidth: 13, halign: "center" },
      7: { cellWidth: 19, halign: "right" },
      8: { cellWidth: 17, halign: "right" },
      9: { cellWidth: 19, halign: "right" },
      10: { cellWidth: 27 },
    },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE_RGB);
      doc.text(`${meta.courtName} · ${meta.periodLabel}`, margin, pageHeight - 6);
      doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - margin, pageHeight - 6, { align: "right" });
    },
  });

  if (rows.length === 0) {
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    doc.setFontSize(10);
    doc.setTextColor(...SLATE_RGB);
    doc.text("No bookings match this period and filter.", margin, y + 8);
  }

  return doc.output("arraybuffer");
}

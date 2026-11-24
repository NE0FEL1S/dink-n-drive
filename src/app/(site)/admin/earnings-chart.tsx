"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { BarChart3 } from "lucide-react";
import { axisPeso, niceTicks, type ChartData } from "@/lib/earnings-chart";
import { peso } from "@/lib/format";

const HEIGHT = 220; // whole SVG, px
const TOP = 22; // room for the best-day label
const BOTTOM = 26; // x-axis labels
const BAR_MAX = 24;
const GAP = 2; // surface gap between touching bars
const LABEL_MIN_GAP = 34; // px between x-axis labels

/** Bar with a 4px rounded top, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function details(p: ChartData["points"][number]): string {
  if (p.bookings === 0) return p.earnings > 0 ? "Kept cancellation fees" : "No paid bookings";
  return `${p.bookings === 1 ? "1 booking" : `${p.bookings} bookings`} · ${p.hours} h`;
}

/**
 * Earnings per day (or per week for long ranges) on Overview (SPEC §9). One series, so no
 * legend: the title names it. Bars are orange-500 on white (validated ≥ 3:1), the best day
 * carries its value, and every bar gives its value on hover, tap and arrow keys. The same
 * numbers are in "Show as table".
 */
export function EarningsChart({ data, periodLabel }: { data: ChartData; periodLabel: string }) {
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { points, max, unit } = data;
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const left = Math.max(...ticks.map((t) => axisPeso(t, top).length)) * 7 + 10;
  const plotW = Math.max(0, width - left);
  const plotH = HEIGHT - TOP - BOTTOM;
  const slot = points.length ? plotW / points.length : 0;
  const barW = Math.max(1, Math.min(BAR_MAX, slot - GAP));
  const y = (v: number) => TOP + plotH - (v / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(LABEL_MIN_GAP / Math.max(slot, 1)));
  const best = points.reduce((b, p, i) => (p.earnings > (points[b]?.earnings ?? 0) ? i : b), 0);
  const unitWord = unit === "day" ? "day" : "week";

  const pick = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - box.left) / Math.max(slot, 1));
    setActive(Math.min(points.length - 1, Math.max(0, i)));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = points.length - 1;
    const now = active ?? best;
    const next =
      e.key === "ArrowRight" ? Math.min(last, now + 1)
      : e.key === "ArrowLeft" ? Math.max(0, now - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : e.key === "Escape" ? null
      : undefined;
    if (next === undefined) return;
    e.preventDefault();
    setActive(next);
  };

  const shown = active !== null ? points[active] : null;
  const tipX = active !== null ? left + slot * active + slot / 2 : 0;

  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-4 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-soft)] min-[390px]:p-5 lg:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`${id}-title`} className="text-[20px] leading-7 font-bold text-navy-900">
          Earnings per {unitWord}
        </h2>
        <p className="text-sm font-semibold text-slate-500">{periodLabel}</p>
      </div>

      {max === 0 ? (
        <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-ice-50 px-4 py-6">
          <BarChart3 className="size-5 shrink-0 text-slate-500" aria-hidden="true" />
          <p className="text-[15px] text-navy-700">No earnings in this period yet. Confirmed bookings show up here by play date.</p>
        </div>
      ) : (
        <>
          <div
            ref={wrap}
            tabIndex={0}
            role="group"
            aria-roledescription="bar chart"
            aria-label={`Earnings per ${unitWord}, ${periodLabel}. Best ${unitWord}: ${points[best].title}, ${peso(points[best].earnings)}. Use the left and right arrow keys to read each ${unitWord}.`}
            onKeyDown={onKey}
            onFocus={() => setActive((a) => a ?? best)}
            onBlur={() => setActive(null)}
            className="relative -mx-1 touch-pan-y rounded-[var(--radius-control)] px-1 outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60"
            style={{ height: HEIGHT }}
          >
            {width > 0 && (
              <svg width={width} height={HEIGHT} aria-hidden="true" className="block overflow-visible">
                {/* gridlines + y ticks */}
                {ticks.map((t) => (
                  <g key={t}>
                    <line x1={left} x2={width} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} shapeRendering="crispEdges" />
                    <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">
                      {axisPeso(t, top)}
                    </text>
                  </g>
                ))}

                {/* bars: nothing drawn at ₱0 */}
                {points.map((p, i) =>
                  p.earnings > 0 ? (
                    <path
                      key={p.key}
                      d={barPath(left + slot * i + (slot - barW) / 2, y(p.earnings), barW, TOP + plotH - y(p.earnings))}
                      fill={active === i ? "var(--color-orange-600)" : "var(--color-orange-500)"}
                      opacity={active !== null && active !== i ? 0.55 : 1}
                    />
                  ) : null,
                )}

                {/* the best day's value, kept inside the plot */}
                {active === null && (
                  <text
                    x={Math.min(width - 4, Math.max(left + 4, left + slot * best + slot / 2))}
                    y={y(points[best].earnings) - 6}
                    textAnchor={best === 0 ? "start" : best === points.length - 1 ? "end" : "middle"}
                    className="fill-navy-900 text-[12px] font-bold tabular-nums"
                  >
                    {peso(points[best].earnings)}
                  </text>
                )}

                {/* x labels */}
                {points.map((p, i) =>
                  i % labelEvery === 0 ? (
                    <text
                      key={p.key}
                      x={left + slot * i + slot / 2}
                      y={HEIGHT - 8}
                      textAnchor="middle"
                      className={`text-[11px] ${active === i ? "fill-navy-900 font-semibold" : "fill-slate-500"}`}
                    >
                      {p.axis}
                    </text>
                  ) : null,
                )}

                {/* hit area: the whole column, not just the painted bar */}
                <rect
                  x={left}
                  y={0}
                  width={plotW}
                  height={HEIGHT - BOTTOM}
                  fill="transparent"
                  onPointerMove={pick}
                  onPointerDown={pick}
                  onPointerLeave={(e) => {
                    if (e.pointerType === "mouse") setActive(null);
                  }}
                />
              </svg>
            )}

            {shown && (
              <div
                className="pointer-events-none absolute top-0 z-10 grid w-max max-w-[200px] gap-0.5 rounded-[12px] border border-line bg-white px-3 py-2 shadow-[0_8px_24px_rgb(4_24_48/0.16)]"
                style={{ left: Math.min(Math.max(tipX - 90, 0), Math.max(0, width - 180)) }}
              >
                <p className="text-[17px] leading-6 font-bold text-navy-900 tabular-nums">{peso(shown.earnings)}</p>
                <p className="text-sm font-semibold text-navy-700">{shown.title}</p>
                <p className="text-sm text-slate-500">{details(shown)}</p>
              </div>
            )}
          </div>
          <p className="sr-only" aria-live="polite">
            {shown ? `${shown.title}: ${peso(shown.earnings)}, ${details(shown)}` : ""}
          </p>

          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full px-3 text-sm font-semibold text-glacier-700 hover:bg-glacier-50 [&::-webkit-details-marker]:hidden -ml-3">
              <span className="group-open:hidden">Show as table</span>
              <span className="hidden group-open:inline">Hide table</span>
            </summary>
            <div className="mt-2 max-h-80 overflow-y-auto rounded-[var(--radius-control)] border border-line">
              <table className="w-full border-collapse text-left text-sm text-navy-700">
                <caption className="sr-only">Earnings per {unitWord}, {periodLabel}</caption>
                <thead className="sticky top-0 bg-ice-50 text-xs font-semibold tracking-[0.04em] text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-3 py-2">{unit === "day" ? "Day" : "Week"}</th>
                    <th scope="col" className="px-3 py-2 text-right">Earnings</th>
                    <th scope="col" className="px-3 py-2 text-right">Bookings</th>
                    <th scope="col" className="px-3 py-2 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.key} className="border-t border-line">
                      <th scope="row" className="px-3 py-2 font-semibold whitespace-nowrap text-navy-900">{p.title}</th>
                      <td className="px-3 py-2 text-right font-semibold text-navy-900 tabular-nums">{peso(p.earnings)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.bookings}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

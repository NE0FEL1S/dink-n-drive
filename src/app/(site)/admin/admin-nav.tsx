"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { CalendarDays, LayoutDashboard, RotateCcw, Settings, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";

type Section = { href: string; label: string; icon: LucideIcon; badge?: "payments" | "refunds" };

/** Owner sections built so far. Customers and Feedback join in their phases. */
const SECTIONS: Section[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/admin/payments", label: "Payments", icon: Wallet, badge: "payments" },
  { href: "/admin/refunds", label: "Refunds", icon: RotateCcw, badge: "refunds" },
  { href: "/admin/moderation", label: "Moderation", icon: ShieldCheck },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

type Props = {
  /** Streams in (Suspense) with the count of payments waiting for review. */
  paymentsBadge: ReactNode;
  /** Streams in with the count of cancellation requests to decide + refunds to send. */
  refundsBadge: ReactNode;
};

/**
 * Admin navigation (DESIGN §5 "Admin"): a row of pill tabs that scrolls sideways on
 * phones and tablets, and a sticky left sidebar from 1024 px. Both are rendered; CSS
 * shows one. Inside the admin layout's grid, the hidden one takes no space.
 */
export function AdminNav({ paymentsBadge, refundsBadge }: Props) {
  const pathname = usePathname();
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the current tab in view on narrow phones (e.g. Settings at 360 px). The tabs can
  // change width after the first paint (the Payments badge streams in, fonts load), so
  // check again whenever one of them resizes.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const reveal = () => {
      const active = el.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;
      const left = active.offsetLeft - 4;
      const right = active.offsetLeft + active.offsetWidth + 4;
      if (left < el.scrollLeft) el.scrollLeft = left;
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    for (const tab of el.children) observer.observe(tab);
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <>
      <nav aria-label="Admin" className="mb-6 lg:hidden">
        <div
          ref={scroller}
          className="relative flex w-fit max-w-full gap-0.5 overflow-x-auto overscroll-x-contain rounded-full bg-white p-1 shadow-[var(--shadow-soft)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SECTIONS.map((s) => {
            const active = isActive(pathname, s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex min-h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-full px-3.5 text-[15px] font-semibold whitespace-nowrap transition-colors duration-150 " +
                  (active ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-ice-50 active:bg-ice-100")
                }
              >
                {s.label}
                {s.badge === "payments" && paymentsBadge}
                {s.badge === "refunds" && refundsBadge}
              </Link>
            );
          })}
        </div>
      </nav>

      <aside className="hidden lg:sticky lg:top-[calc(72px+env(safe-area-inset-top)+24px)] lg:block">
        <nav
          aria-label="Admin"
          className="grid gap-1 rounded-[var(--radius-card)] border border-line bg-white p-2 shadow-[var(--shadow-soft)]"
        >
          <p className="px-3.5 pt-2 pb-1.5 text-xs font-semibold tracking-[0.06em] text-slate-500 uppercase">Admin</p>
          {SECTIONS.map((s) => {
            const active = isActive(pathname, s.href);
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] px-3.5 text-[15px] font-semibold transition-colors duration-150 " +
                  (active ? "bg-orange-50 text-orange-600" : "text-navy-900 hover:bg-ice-50 active:bg-ice-100")
                }
              >
                <Icon className={`size-5 ${active ? "text-orange-600" : "text-navy-700"}`} aria-hidden="true" />
                {s.label}
                {s.badge && <span className="ml-auto">{s.badge === "payments" ? paymentsBadge : refundsBadge}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Dropdown, menuItemClass } from "./dropdown";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/community", label: "Community" },
  { href: "/feedback", label: "Feedback" },
  { href: "/my-bookings", label: "My bookings" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Laptop: links in a pill group; the active one is an orange-50 pill (DESIGN §6). */
export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-0.5 rounded-[14px] bg-white/40 p-1 ring-1 ring-white/60 md:flex">
      {NAV_LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-10 items-center rounded-[10px] px-4 text-[14.5px] font-bold whitespace-nowrap transition-colors ${
              active ? "bg-orange-50 text-orange-600" : "text-navy-900 hover:bg-white/70 active:bg-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone: orange-gradient menu button opening the links as 48px rows. */
export function MobileNav({ className = "md:hidden" }: { className?: string }) {
  const pathname = usePathname();
  return (
    <div className={className}>
      <Dropdown
        trigger={(props) => (
          <button
            type="button"
            aria-label="Menu"
            className="btn-grad grid size-12 place-items-center rounded-[var(--radius-control)] active:scale-[0.98]"
            {...props}
          >
            <Menu className="size-[22px]" strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
      >
        {(close) =>
          NAV_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                onClick={close}
                aria-current={active ? "page" : undefined}
                className={`${menuItemClass} ${active ? "bg-orange-50 text-orange-600" : ""}`}
              >
                {link.label}
              </Link>
            );
          })
        }
      </Dropdown>
    </div>
  );
}

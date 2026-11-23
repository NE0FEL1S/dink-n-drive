import { Suspense } from "react";
import { AccountArea } from "./account-area";
import { Logo } from "./logo";
import { DesktopNav, MobileNav } from "./nav-links";

/** Sticky frosted header (DESIGN §6). The account area streams in, so the rest stays in the static shell. */
export function SiteHeader() {
  return (
    <header className="glass sticky top-0 z-40 border-b border-white/60 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgb(15_27_51/0.04)]">
      {/* ≥1024px: logo | links centered | account (3-column grid). Below: logo … account + menu button. */}
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 min-[390px]:px-5 md:h-[72px] lg:grid lg:grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] lg:gap-4">
        <Logo />
        <div className="hidden lg:block">
          <Suspense>
            <DesktopNav />
          </Suspense>
        </div>
        <div className="ml-auto flex items-center gap-2 lg:justify-self-end">
          <Suspense fallback={<div className="h-11 w-[84px] animate-pulse rounded-[var(--radius-control)] bg-ice-100" />}>
            <AccountArea />
          </Suspense>
          <Suspense>
            <MobileNav className="lg:hidden" />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

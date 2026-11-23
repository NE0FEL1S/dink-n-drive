import { Suspense } from "react";
import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { AccountMenu } from "./account-menu";
import { Logo } from "./logo";
import { DesktopNav, MobileNav } from "./nav-links";

/** Sticky frosted header (DESIGN §6). The account area streams in, so the rest stays in the static shell. */
export function SiteHeader() {
  return (
    <header className="glass sticky top-0 z-40 border-b border-white/60 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgb(15_27_51/0.04)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 min-[390px]:px-5 md:h-[72px]">
        <Logo />
        <div className="ml-6 hidden md:block">
          <Suspense>
            <DesktopNav />
          </Suspense>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Suspense fallback={<div className="h-11 w-[84px] animate-pulse rounded-[var(--radius-control)] bg-ice-100" />}>
            <AccountArea />
          </Suspense>
          <Suspense>
            <MobileNav />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function AccountArea() {
  const profile = await getProfile();

  if (!profile) {
    return (
      <Link
        href="/login"
        className="btn-grad flex h-11 items-center rounded-[var(--radius-control)] px-4 text-[15px] whitespace-nowrap active:scale-[0.98] sm:px-5"
      >
        Log in
      </Link>
    );
  }

  return (
    <AccountMenu
      name={profile.full_name ?? profile.email ?? "Account"}
      email={profile.email}
      isOwner={profile.role === "owner"}
    />
  );
}

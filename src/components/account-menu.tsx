"use client";

import Link from "next/link";
import { CalendarCheck, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { initials } from "@/lib/format";
import { Dropdown, menuItemClass } from "./dropdown";

type Props = { name: string; email: string | null; isOwner: boolean };

/** Avatar button + account menu: My bookings, Profile, Admin (owner only), Sign out (DESIGN §6). */
export function AccountMenu({ name, email, isOwner }: Props) {
  return (
    <Dropdown
      trigger={(props) => (
        <button
          type="button"
          aria-label={`Account menu for ${name}`}
          className="grid size-12 place-items-center rounded-full active:scale-[0.98]"
          {...props}
        >
          <span className="btn-grad grid size-10 place-items-center rounded-full text-sm ring-2 ring-white">
            {initials(name)}
          </span>
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="border-b border-line px-3.5 pt-2 pb-3">
            <p className="truncate text-[15px] font-bold text-navy-900">{name}</p>
            {email && <p className="truncate text-sm text-slate-500">{email}</p>}
          </div>
          <div className="grid pt-1.5">
            <Link href="/my-bookings" role="menuitem" onClick={close} className={menuItemClass}>
              <CalendarCheck className="size-5 text-navy-700" aria-hidden="true" /> My bookings
            </Link>
            <Link href="/profile" role="menuitem" onClick={close} className={menuItemClass}>
              <UserRound className="size-5 text-navy-700" aria-hidden="true" /> Profile
            </Link>
            {isOwner && (
              <Link href="/admin" role="menuitem" onClick={close} className={menuItemClass}>
                <LayoutDashboard className="size-5 text-navy-700" aria-hidden="true" /> Admin
              </Link>
            )}
            <form action={signOut}>
              <button type="submit" role="menuitem" className={menuItemClass}>
                <LogOut className="size-5 text-navy-700" aria-hidden="true" /> Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </Dropdown>
  );
}

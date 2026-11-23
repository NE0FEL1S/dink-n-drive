import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { AccountMenu } from "./account-menu";

/**
 * "Log in" button for guests, avatar + account menu for signed-in users.
 * Reads the session, so render it inside <Suspense>.
 */
export async function AccountArea({ loginClassName = "" }: { loginClassName?: string }) {
  const profile = await getProfile();

  if (!profile) {
    return (
      <Link
        href="/login"
        className={`btn-grad flex h-11 items-center rounded-[var(--radius-control)] px-4 text-[15px] whitespace-nowrap active:scale-[0.98] sm:px-5 ${loginClassName}`}
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

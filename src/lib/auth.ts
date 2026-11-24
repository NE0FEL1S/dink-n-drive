import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "phone" | "email" | "role"
>;

/**
 * The signed-in user's id, verified from the session JWT, or null.
 * Reads cookies, so call it inside a <Suspense> boundary (cacheComponents).
 */
export const getUserId = cache(async (): Promise<string | null> => {
  // Session checks compare token expiry with the current time, so they must run at
  // request time, never in a prerender or prefetch (cacheComponents).
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
});

/** The signed-in user's profile, or null for guests. Deduplicated per request. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const userId = await getUserId();
  if (!userId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, phone, email, role")
    .eq("id", userId)
    .maybeSingle();
  return data;
});

export function isProfileComplete(profile: Pick<Profile, "full_name" | "phone"> | null): boolean {
  return Boolean(profile?.full_name && profile.phone);
}

/** For pages and actions that need a signed-in user. */
export async function requireProfile(nextPath: string): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return profile;
}

/** For owner-only pages and actions (the proxy and RLS check too). */
export async function requireOwner(): Promise<Profile> {
  const profile = await requireProfile("/admin");
  if (profile.role !== "owner") redirect("/");
  return profile;
}

/** Where to send a user right after signing in: complete the profile first if needed; /admin only for the owner. */
export async function postSignInPath(userId: string, next: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("full_name, phone, role").eq("id", userId).maybeSingle();
  // Only the owner may open /admin. Send anyone else home here, so the address bar shows
  // "/" too (a redirect from inside the admin page would leave "/admin/…" in it).
  if (/^\/admin(\/|\?|$)/.test(next) && data?.role !== "owner") next = "/";
  if (!isProfileComplete(data)) {
    return `/profile?welcome=1&next=${encodeURIComponent(next)}`;
  }
  return next;
}

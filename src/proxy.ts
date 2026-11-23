import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { safeNextPath } from "@/lib/safe-next";

/**
 * Runs before every page request (see `config.matcher`):
 * 1. Refreshes the Supabase session cookie.
 * 2. Guards routes: /profile needs a signed-in user, /admin needs the owner.
 *    Pages and Server Actions check again on the server, and RLS checks again
 *    in the database. The proxy is the first line, never the only one.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          cacheHeaders = { ...cacheHeaders, ...headers };
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    },
  );

  // Verifies the JWT and refreshes the session if needed. Must run before any response is built.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;

  const { pathname, search } = request.nextUrl;

  /** Redirect while keeping any refreshed session cookies. */
  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const [key, value] of Object.entries(cacheHeaders)) redirect.headers.set(key, value);
    return redirect;
  };

  const needsUser = pathname.startsWith("/profile") || pathname.startsWith("/admin");

  if (needsUser && !userId) {
    return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
  }

  if (pathname.startsWith("/admin") && userId) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (profile?.role !== "owner") return redirectTo("/");
  }

  if (pathname === "/login" && userId) {
    return redirectTo(safeNextPath(request.nextUrl.searchParams.get("next")));
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static files, image optimization and public assets.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};

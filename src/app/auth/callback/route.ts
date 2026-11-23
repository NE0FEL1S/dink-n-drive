import { NextResponse, type NextRequest } from "next/server";
import { postSignInPath } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

/** Google OAuth lands here with ?code=… (PKCE). Exchange it for a session cookie, then continue. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      return NextResponse.redirect(new URL(await postSignInPath(data.user.id, next), origin));
    }
  }

  return NextResponse.redirect(new URL(`/login?error=google&next=${encodeURIComponent(next)}`, origin));
}

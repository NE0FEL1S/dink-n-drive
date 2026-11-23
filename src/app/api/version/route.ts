/**
 * Which commit this deployment was built from (Vercel sets VERCEL_GIT_COMMIT_SHA at build time).
 * Prerendered at build. CI polls it to know when `staging` serves the pushed commit.
 * The repo is public, so the commit id is not sensitive.
 */
export function GET() {
  return Response.json({ commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
}

// Public Supabase config (safe in the browser). The secret key lives only in
// src/lib/supabase/admin.ts.
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See docs/SETUP.md Part 2.`);
  }
  return value;
}

// Accessed as literal `process.env.NEXT_PUBLIC_*` so Next.js inlines them in client bundles.
export const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_PUBLISHABLE_KEY = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

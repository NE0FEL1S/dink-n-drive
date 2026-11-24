import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SUPABASE_URL } from "./env";

/**
 * Supabase client with the SECRET key. Bypasses RLS.
 * Server-only: never import from a Client Component, never expose the key.
 * Use only where the spec calls for it (signed upload URLs for guests, guests' refund
 * screenshots after my_refund_proof() checks ownership,
 * owner-assisted password reset, e2e cleanup).
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing environment variable SUPABASE_SECRET_KEY. See docs/SETUP.md Part 2.");
  }

  return createClient<Database>(SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

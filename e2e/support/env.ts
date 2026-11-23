import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

/**
 * Loads `.env.local` when it exists (local runs; CI passes env vars as secrets)
 * and gives the whole run one id, shared by the runner and its workers.
 */
export function loadTestEnv() {
  if (existsSync(".env.local") && !process.env.SUPABASE_SECRET_KEY) {
    process.loadEnvFile(".env.local");
  }
  process.env.E2E_RUN_ID ??= `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
}

export function requireEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SECRET_KEY" | "E2E_RUN_ID"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Locally it comes from .env.local; in CI from repository secrets.`);
  return value;
}

import type { FullConfig } from "@playwright/test";
import { cleanupTestData, runId } from "./support/admin";

/**
 * 1. Removes leftovers from crashed runs (older than an hour) before this run starts.
 * 2. Against a local `next dev`, opens the main routes once so they're compiled before the
 *    parallel tests hit them (a cold dev server compiling under load can fail requests).
 */
export default async function globalSetup(config: FullConfig) {
  const removed = await cleanupTestData("stale");
  console.log(`[e2e] run ${runId()} · removed stale test data: ${JSON.stringify(removed)}`);

  const baseURL = config.projects[0]?.use.baseURL;
  if (baseURL?.startsWith("http://localhost")) {
    for (const path of ["/", "/book", "/login", "/profile"]) {
      await fetch(new URL(path, baseURL), { redirect: "manual" }).catch(() => undefined);
    }
  }
}

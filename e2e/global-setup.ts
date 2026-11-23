import { cleanupTestData, runId } from "./support/admin";

/** Removes leftovers from crashed runs (older than an hour) before this run starts. */
export default async function globalSetup() {
  const removed = await cleanupTestData("stale");
  console.log(`[e2e] run ${runId()} · removed stale test data: ${JSON.stringify(removed)}`);
}

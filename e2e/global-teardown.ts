import { cleanupTestData, runId } from "./support/admin";

/** Deletes everything this run created (users, their bookings, guest bookings, stored files). */
export default async function globalTeardown() {
  const removed = await cleanupTestData("run");
  console.log(`[e2e] run ${runId()} · cleaned up: ${JSON.stringify(removed)}`);
}

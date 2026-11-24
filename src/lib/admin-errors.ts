/**
 * The admin functions raise short keys (supabase/migrations/*_admin_functions.sql).
 * This turns them into what the owner reads.
 */
const KNOWN = new Set([
  "not_owner",
  "not_found",
  "not_pending_review",
  "invalid_reason",
  "slot_taken",
  "outside_opening_hours",
  "in_the_past",
  "not_on_the_hour",
  "invalid_hours",
  "invalid_note",
  "invalid_range",
]);

/**
 * For server actions: the owner-facing message for a database error, and a server log line
 * when it isn't one of the expected keys (a network failure, a bug), so it shows in the logs.
 */
export function adminRpcError(fn: string, error: { message: string; code?: string }): string {
  if (!KNOWN.has(error.message)) console.error(`[admin] ${fn} failed:`, error.code ?? "", error.message);
  return adminError(error.message);
}

export function adminError(key: string | undefined): string {
  switch (key) {
    case "not_owner":
      return "Only the court owner can do this. Please log in again.";
    case "not_found":
      return "We couldn't find that booking. It may have been removed.";
    case "not_pending_review":
      return "This payment was already reviewed (maybe in another tab). The list has been updated.";
    case "invalid_reason":
      return "Write a short reason (up to 500 characters). The customer will see it.";
    case "slot_taken":
      return "Some of those hours are already booked or blocked.";
    case "outside_opening_hours":
      return "Those hours are outside opening hours.";
    case "in_the_past":
      return "Those hours have already passed.";
    case "not_on_the_hour":
    case "invalid_hours":
      return "Pick whole hours.";
    case "invalid_note":
      return "Keep the note under 200 characters.";
    case "invalid_range":
      return "The start date must be on or before the end date.";
    default:
      return "Something went wrong. Please try again.";
  }
}

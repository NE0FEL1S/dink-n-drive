import { communityError } from "@/lib/community-errors";

/**
 * Friendly messages for the error keys the feedback functions raise
 * (supabase/migrations/20261124115343_feedback_functions.sql). Shared keys fall back to
 * the community wording.
 */
export function feedbackError(key: string, detail?: string | null): string {
  switch (key) {
    case "rate_limited":
      return detail === "30"
        ? communityError(key, detail)
        : "You've sent 5 feedback items in the last 24 hours. Please try again tomorrow.";
    case "invalid_message":
      return "Write your feedback first (up to 2,000 characters).";
    case "not_found":
      return "That feedback isn't there anymore. It may have been deleted.";
    case "invalid_feedback":
      return "Something went wrong. Please try again.";
    default:
      return communityError(key, detail);
  }
}

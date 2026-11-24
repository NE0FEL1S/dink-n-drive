/**
 * Friendly messages for the error keys the community functions raise
 * (supabase/migrations/20261124084000_community_functions.sql).
 */
export function communityError(key: string, detail?: string | null): string {
  switch (key) {
    case "not_signed_in":
      return "Please log in again, then try once more.";
    case "profile_incomplete":
      return "Add your name and mobile number in Profile first.";
    case "rate_limited":
      return detail === "30"
        ? "You've commented 30 times in the last hour. Please take a short break and try again later."
        : "You've posted 5 times in the last hour. Please try again a little later.";
    case "invalid_photos":
      return "Something went wrong with the photos. Please pick them again.";
    case "invalid_caption":
      return "Captions can be up to 2,000 characters.";
    case "invalid_comment":
      return "Comments need 1 to 1,000 characters.";
    case "not_found":
      return "That post isn't there anymore. It may have been deleted.";
    case "invalid_post":
      return "Something went wrong. Please try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

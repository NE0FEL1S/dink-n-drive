/**
 * The booking and cancellation functions raise short keys (supabase/migrations/*_booking_functions.sql,
 * *_cancellation_refunds.sql).
 * This turns them into what the customer reads. Field keys point at a form field.
 */
export type BookingErrorInfo = { message: string; field?: "name" | "email" | "phone" | "gcashName" | "gcashNumber"; repick?: boolean };

export function bookingError(key: string | undefined, detail?: string | null): BookingErrorInfo {
  switch (key) {
    case "slot_taken":
      return { message: "Someone just booked part of those hours. Please pick different hours.", repick: true };
    case "unpaid_limit":
      return {
        message: `This mobile number already has ${detail ?? "2"} unpaid bookings. Pay for one, or cancel it in My bookings, before booking again.`,
      };
    case "in_the_past":
      return { message: "That hour has already started. Please pick a later one.", repick: true };
    case "outside_opening_hours":
      return { message: "Those hours are outside opening hours. Please pick again.", repick: true };
    case "too_far_ahead":
      return { message: "That day is too far ahead to book yet. Please pick an earlier day.", repick: true };
    case "not_on_the_hour":
    case "invalid_hours":
      return { message: "Please pick whole hours.", repick: true };
    case "invalid_name":
      return { message: "Enter your full name.", field: "name" };
    case "invalid_email":
      return { message: "Enter a valid email address.", field: "email" };
    case "invalid_phone":
      return { message: "Use an 11-digit PH mobile number, like 09171234567.", field: "phone" };
    case "invalid_token":
      return { message: "Your browser blocked our booking cookie. Please allow cookies for this site and try again." };
    case "hold_expired":
      return { message: "The hold ran out, so the hours were released. Please book again.", repick: true };
    case "not_awaiting_payment":
      return { message: "This booking isn't waiting for payment anymore. Check My bookings." };
    case "not_paid":
      return { message: "This booking isn't paid yet, so you can cancel it for free instead." };
    case "already_requested":
      return { message: "You already asked to cancel this booking. The court owner will review it." };
    case "not_cancellable":
      return { message: "This booking can't be cancelled anymore. Check its status in My bookings." };
    case "past_cutoff":
      return {
        message: `Cancellations close ${detail ?? "3"} ${detail === "1" ? "hour" : "hours"} before the game starts. Please message the court owner.`,
      };
    case "invalid_gcash_name":
      return { message: "Enter the name on the GCash account.", field: "gcashName" };
    case "invalid_gcash_number":
      return { message: "Use an 11-digit GCash number, like 09171234567.", field: "gcashNumber" };
    case "not_found":
      return { message: "We couldn't find that booking on this browser." };
    case "proof_missing":
    case "invalid_path":
      return { message: "The upload didn't finish. Please try again." };
    default:
      return { message: "Something went wrong. Please try again." };
  }
}

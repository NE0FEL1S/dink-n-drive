import type { Metadata } from "next";
import { AdminPlaceholder } from "../admin-placeholder";

export const metadata: Metadata = { title: "Bookings · Admin" };

export default function AdminBookingsPage() {
  return (
    <AdminPlaceholder title="Bookings">
      Every booking with filters by date and status, search, block hours, and Excel / PDF exports.
    </AdminPlaceholder>
  );
}

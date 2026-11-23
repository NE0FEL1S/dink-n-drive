import type { Metadata } from "next";
import { AdminPlaceholder } from "../admin-placeholder";

export const metadata: Metadata = { title: "Settings · Admin" };

export default function AdminSettingsPage() {
  return (
    <AdminPlaceholder title="Settings">
      Prices, opening hours, hold time, cancellation rules, booking limits and the GCash QR.
    </AdminPlaceholder>
  );
}

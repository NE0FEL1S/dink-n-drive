import type { Metadata } from "next";
import { AdminPlaceholder } from "../admin-placeholder";

export const metadata: Metadata = { title: "Payments · Admin" };

export default function AdminPaymentsPage() {
  return (
    <AdminPlaceholder title="Payments">
      GCash screenshots waiting for review, with Approve and Reject.
    </AdminPlaceholder>
  );
}

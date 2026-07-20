"use client";

import { useParams, useRouter } from "next/navigation";
import { CustomerInfoView } from "@/components/features/customers/customer-history-dialog";

/**
 * Customer information page — a FIXED page route (not a dialog).
 *
 * Clicking a customer name ANYWHERE in the app navigates here via
 * `router.push('/customers/[id]')`. The page renders the full "Thông tin
 * khách hàng" interface inline (header + 8 tabs + data tables), with a back
 * button that returns to the previous page.
 *
 * This replaces the old overlay-dialog approach — the interface is now a
 * dedicated, fixed page like the Hóa đơn page.
 */
export default function CustomerInfoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = params?.id;

  if (!customerId || typeof customerId !== "string") {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <p className="text-sm">Liên kết không hợp lệ.</p>
      </div>
    );
  }

  return (
    <CustomerInfoView
      customerId={customerId}
      onBack={() => router.back()}
    />
  );
}

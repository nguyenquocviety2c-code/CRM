"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  InvoiceActivityActionLabel,
  ActionBadgeColors,
  type InvoiceActivityActionType,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

interface ActivityRow {
  id: string;
  invoice_id: string | null;
  invoice_code: string | null;
  action: string;
  detail: string | null;
  value: string | null;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
  created_by_staff?: { name: string; username?: string | null } | null;
  // Kiosk special case: when created_by is null (customer-placed booking),
  // the API enriches the row with the invoice's customer name.
  created_by_customer?: { name: string; phone?: string | null } | null;
}

interface InvoiceActivityTableProps {
  invoiceId: string;
}

/**
 * Activity history table shown in the order/invoice detail dialog.
 *
 * Columns:
 *   1. Hành động — Khởi tạo / Chỉnh sửa (one row per edit) / Checkin / Thanh toán
 *   2. Thời gian — when the action was performed
 *   3. Người thực hiện — the staff who performed the action (from the auth
 *      cookie's staff id at the time of the action)
 *
 * Rules:
 *   - If the order has never been edited, no "Chỉnh sửa" rows appear.
 *   - Each edit produces a NEW "Chỉnh sửa" row — so N edits = N rows.
 *   - Hovering an "Chỉnh sửa" row shows a tooltip with the change description
 *     (the `detail` field, e.g. "Chỉnh sửa: số mặt hàng: 1 → 2, thưởng thợ: 0 → 10000").
 */
export function InvoiceActivityTable({ invoiceId }: InvoiceActivityTableProps) {
  const { data, isLoading, error } = useQuery<ActivityRow[]>({
    queryKey: ["invoice-activities", invoiceId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("invoice_id", invoiceId);
      params.set("limit", "200");
      const res = await fetch(`/api/supabase/invoice-activities?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to load activities");
      return (json.data as ActivityRow[]) || [];
    },
  });

  // Sort oldest → newest so the history reads top-to-bottom chronologically
  // (Khởi tạo first, then edits, then Thanh toán last).
  const rows = (data ?? []).slice().sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aTime - bTime;
  });

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-gray-900">Lịch sử thao tác</div>
      {/* Table wrapper with max-height + overflow-y-auto so the activity
          history scrolls internally when there are many rows (e.g. a
          multi-customer booking with 10+ checkin/checkout/revert actions).
          The header row is sticky-top so it stays visible during scroll. */}
      <div className="rounded-lg border border-gray-200 max-h-60 overflow-y-auto">
        <table className="w-full caption-bottom text-sm table-fixed">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b">
              <th className="h-9 px-3 text-left text-xs font-semibold text-gray-700 w-[32%]">
                Hành động
              </th>
              <th className="h-9 px-3 text-left text-xs font-semibold text-gray-700 w-[33%]">
                Thời gian
              </th>
              <th className="h-9 px-3 text-left text-xs font-semibold text-gray-700 w-[35%]">
                Người thực hiện
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-sm text-gray-400">
                  Đang tải...
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-sm text-red-500">
                  {(error as Error).message || "Không thể tải lịch sử"}
                </td>
              </tr>
            )}
            {!isLoading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-sm text-gray-400">
                  Chưa có thao tác nào
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const action = row.action as InvoiceActivityActionType;
              const label =
                InvoiceActivityActionLabel[action] ?? row.action;
              const colors =
                ActionBadgeColors[action] ?? { bg: "bg-gray-100", text: "text-gray-700" };
              const time = row.created_at
                ? format(new Date(row.created_at), "dd/MM/yyyy HH:mm:ss", { locale: vi })
                : "—";
              // Executor resolution:
              //   1. Staff name (logged-in account) — normal case
              //   2. Customer name — ONLY for CREATE_* actions placed via the
              //      public /dat-lich kiosk (created_by is null + action is
              //      CREATE_INVOICE/CREATE_INVOICE_FROM_BOOKING). The API only
              //      enriches customer for these actions.
              //   3. "Hệ thống" — fallback for staff actions whose created_by is
              //      null (stale historical data before actor logging existed).
              //      CHECKIN/PAYMENT/CHECKOUT/UPDATE/NO_SHOW/CANCEL are ALWAYS
              //      staff-performed, so they show "Hệ thống" rather than
              //      "Khách hàng" when created_by is null.
              const actor =
                row.created_by_staff?.name ||
                row.created_by_staff?.username ||
                (row.created_by_customer ? `Khách hàng: ${row.created_by_customer.name}` : null) ||
                (row.created_by ? "—" : "Hệ thống");
              const isEdit = row.action === "UPDATE_INVOICE";
              return (
                <tr key={row.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 align-top">
                    {/* Edit rows get a hover tooltip showing the change description. */}
                    {isEdit && row.detail ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            tabIndex={0}
                            className={cn(
                              "inline-flex cursor-help items-center rounded-full px-2 py-0.5 text-xs font-medium underline decoration-dotted underline-offset-2",
                              colors.bg,
                              colors.text
                            )}
                          >
                            {label}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="left"
                          align="center"
                          className="max-w-xs whitespace-pre-wrap break-words text-xs"
                        >
                          {row.detail}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          colors.bg,
                          colors.text
                        )}
                      >
                        {label}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-700 break-words">
                    {time}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-700 break-words">
                    {actor}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

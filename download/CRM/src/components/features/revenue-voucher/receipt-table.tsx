"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePaginatedReceipts, useRevenueVoucherStore } from "@/stores/revenue-voucher-store";
import { formatVND, formatDate } from "@/lib/revenue-voucher-utils";
import { ReceiptRowActions } from "./receipt-row-actions";
import { useAuthStore } from "@/stores/auth-store";

export function ReceiptTable() {
  const { data } = usePaginatedReceipts();
  const { openDetail } = useRevenueVoucherStore();
  // Permission: only staff with "view_all_invoices" can drill from a receipt
  // into its linked invoice detail.
  const { hasPermission } = useAuthStore();
  const canViewAllInvoices = hasPermission("view_all_invoices");

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã phiếu</TableHead>
            <TableHead>Danh mục</TableHead>
            <TableHead>Thời gian</TableHead>
            <TableHead>Người tạo</TableHead>
            <TableHead>Số tiền</TableHead>
            <TableHead>Thanh toán bằng</TableHead>
            <TableHead>Liên kết</TableHead>
            <TableHead>Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                Trống
              </TableCell>
            </TableRow>
          ) : (
            data.map((receipt) => (
              <TableRow key={receipt.id}>
                <TableCell className="font-medium">{receipt.code}</TableCell>
                <TableCell>{receipt.categoryName}</TableCell>
                <TableCell>{formatDate(receipt.datetime, "datetime")}</TableCell>
                <TableCell>{receipt.createdBy}</TableCell>
                <TableCell>{formatVND(receipt.amount)}</TableCell>
                <TableCell>
                  {receipt.paymentMethod === "cash" && "Tiền mặt"}
                  {receipt.paymentMethod === "transfer" && "Chuyển khoản"}
                  {receipt.paymentMethod === "card" && "Thẻ"}
                </TableCell>
                <TableCell>
                  {receipt.invoiceCode && canViewAllInvoices ? (
                    <button
                      onClick={() => openDetail(receipt)}
                      className="text-sky-600 hover:text-sky-700 hover:underline text-sm"
                    >
                      Xem hóa đơn
                    </button>
                  ) : null}
                </TableCell>
                <TableCell>
                  <ReceiptRowActions receipt={receipt} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
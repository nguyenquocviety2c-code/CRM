"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
const PaidInvoiceView = dynamic(
  () => import("@/components/features/booking/paid-invoice-view").then((m) => m.PaidInvoiceView),
  { ssr: false }
);
import { Printer, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceReportData, useReportRevenueStore } from "@/stores/report-revenue-store";
import { formatVND, formatDate, paginationRange } from "@/lib/report-utils";
import { RevenueSummaryCards } from "./revenue-summary-cards";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

const INVOICE_COLUMN_DEFS: ColumnDef[] = [
  { key: "stt", label: "STT" },
  { key: "invoiceCode", label: "Mã hóa đơn" },
  { key: "createdAt", label: "Ngày tạo" },
  { key: "customerName", label: "Khách hàng" },
  { key: "surcharge", label: "Thưởng" },
  { key: "discount", label: "Giảm giá" },
  { key: "promotionName", label: "Khuyến mãi" },
  { key: "voucherName", label: "Voucher" },
  { key: "totalAmount", label: "Tổng tiền" },
];

/** Shape of the invoice row carried into the full-page PaidInvoiceView. */
interface InvoiceViewTarget {
  invoiceId: string;
  customerName?: string;
  code?: string | null;
}

export function RevenueInvoiceView() {
  const { toast } = useToast();
  const { data, summary, page, pageSize, total } = useInvoiceReportData();
  const { setPage, setPageSize } = useReportRevenueStore();
  const router = useRouter();
  // Permission: only staff with "view_all_invoices" can click an invoice code
  // to open its detail. Without it, the code renders as plain text.
  const { hasPermission } = useAuthStore();
  const canViewAllInvoices = hasPermission("view_all_invoices");
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(INVOICE_COLUMN_DEFS)
  );
  // When set, the full-page PaidInvoiceView overlay opens (replaces the old
  // modal InvoiceDetailDialog). Carries just enough context (invoiceId +
  // customer name + invoice code) so the view can render its header before
  // the detail fetch resolves.
  const [detailTarget, setDetailTarget] = useState<InvoiceViewTarget | null>(null);
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  const visibleCols = INVOICE_COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false);

  const cards = [
    { label: "SỐ LƯỢNG HÓA ĐƠN", value: String(summary.count) },
    { label: "DOANH THU HÓA ĐƠN", value: formatVND(summary.totalRevenue) },
    { label: "ĐÃ THANH TOÁN", value: formatVND(summary.totalPaid) },
  ];

  const { from, to } = paginationRange((page - 1) * pageSize, pageSize, total);

  // Format the promotion display: line 1 = promotion name + discount value
  // (percent WITH a "%" suffix, e.g. "Gói 10%"; fixed amount as "−XXđ").
  // Line 2 = the actual money deducted by the promotion. Both lines stack
  // vertically inside the Khuyến mãi cell so the cashier sees both the rule
  // and its effect at a glance.
  //
  // Multi-promotion support: one invoice can apply MULTIPLE promotions. We
  // render each one as its own stacked block (separated by a thin divider) so
  // the cashier can see every promotion that was applied to the order, not
  // just the "primary" one.
  const renderPromotionBlock = (
    p: { name: string; discountValue: number; discountType?: string; discountAmount: number },
    fallbackDiscount: number,
  ): React.ReactNode => {
    if (!p.name) return null;
    const val = p.discountValue || 0;
    const type = p.discountType;
    // Determine whether `val` is a PERCENT (e.g. 10 → 10%) or a fixed money
    // amount. The stored `discountType` values seen in production are
    // "service_category" (a percent applied to a service category) and null;
    // we treat anything that isn't a fixed-amount type as a percent. A percent
    // is shown as "10%" (always with the % suffix). A fixed amount is shown
    // as "−XXđ".
    const isPercent = type !== "amount" && type !== "fixed";
    const valueSuffix = val > 0
      ? isPercent
        ? ` ${val}%`
        : ` −${formatVND(val)}`
      : "";
    // Line 2: the actual deducted money. Prefer the promotion's pre-computed
    // discountAmount; fall back to the invoice-level discount when the
    // promotion only carries a percent (the server computes the money later).
    const deductedMoney = p.discountAmount || (fallbackDiscount && val === 0 ? fallbackDiscount : 0);
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-gray-900">
          {p.name}
          {valueSuffix && <span className="ml-0.5 text-gray-600">{valueSuffix}</span>}
        </span>
        {deductedMoney > 0 && (
          <span className="text-[11px] font-medium text-orange-600">
            −{formatVND(deductedMoney)}
          </span>
        )}
      </div>
    );
  };

  // Render the full Khuyến mãi cell: stacks every applied promotion. When the
  // invoice carries only the legacy single `promotion` field (no `promotions`
  // array), `promotions` is filled from it by the store mapper, so this just
  // works. Falls back to the legacy `promotionName` when no array entries.
  const renderPromotion = (invoice: typeof data[number]): React.ReactNode => {
    const list = (invoice.promotions && invoice.promotions.length > 0)
      ? invoice.promotions
      : (invoice.promotionName
        ? [{ name: invoice.promotionName, discountValue: invoice.promotionDiscountValue, discountType: invoice.promotionDiscountType, discountAmount: invoice.promotionDiscountAmount }]
        : []);
    if (list.length === 0) return <span className="text-gray-400">—</span>;
    return (
      <div className="flex flex-col divide-y divide-gray-100">
        {list.map((p, i) => (
          <div key={i} className={i > 0 ? "pt-1" : ""}>
            {renderPromotionBlock(p, invoice.discount)}
          </div>
        ))}
      </div>
    );
  };

  // Render the Voucher cell — same multi-row layout as the Khuyến mãi cell so
  // a single invoice that applied multiple vouchers shows every one of them.
  const renderVoucher = (invoice: typeof data[number]): React.ReactNode => {
    const list = invoice.vouchers || [];
    if (list.length === 0) return <span className="text-gray-400">—</span>;
    return (
      <div className="flex flex-col divide-y divide-gray-100">
        {list.map((v, i) => (
          <div key={i} className={i > 0 ? "pt-1" : ""}>
            {renderPromotionBlock(v, invoice.discount)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={() => toast({ title: "Tính năng sẽ khả dụng ở giai đoạn lõi" })}
        >
          <Printer className="mr-2 h-4 w-4" />
          In tổng hợp
        </Button>
        <Button
          variant="outline"
          onClick={() => toast({ title: "Tính năng sẽ khả dụng ở giai đoạn lõi" })}
        >
          <Download className="mr-2 h-4 w-4" />
          Xuất excel
        </Button>
        <ColumnToggle
          columnDefs={INVOICE_COLUMN_DEFS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
        />
      </div>

      {/* Summary cards */}
      <RevenueSummaryCards cards={cards} />

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-slate-50">
              {visibleCols.map((col) => (
                <TableHead key={col.key} className="text-xs font-medium uppercase text-slate-600">
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={Math.max(visibleCols.length, 1)} className="py-8 text-center text-gray-500">
                  Trống
                </TableCell>
              </TableRow>
            ) : (
              data.map((invoice) => (
                <TableRow key={invoice.id} className="hover:bg-slate-50">
                  {visibleCols.map((col) => {
                    if (col.key === "stt") return <TableCell key="stt">{invoice.stt}</TableCell>;
                    if (col.key === "invoiceCode") return (
                      <TableCell key="invoiceCode">
                        {canViewAllInvoices ? (
                          <button
                            onClick={() => setDetailTarget({
                              invoiceId: invoice.id,
                              customerName: invoice.customerName,
                              code: invoice.invoiceCode,
                            })}
                            className="text-sky-600 hover:text-sky-700 hover:underline"
                          >
                            {invoice.invoiceCode}
                          </button>
                        ) : (
                          <span className="text-gray-700" title="Bạn không có quyền xem chi tiết hóa đơn">
                            {invoice.invoiceCode}
                          </span>
                        )}
                      </TableCell>
                    );
                    if (col.key === "createdAt") return <TableCell key="createdAt">{formatDate(invoice.createdAt, "datetime")}</TableCell>;
                    if (col.key === "customerName") return (
                      <TableCell key="customerName">
                        {invoice.customerId ? (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/customers/${invoice.customerId}`)
                            }
                            className="text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer text-left"
                            title="Xem lịch sử khách hàng"
                          >
                            {invoice.customerName}
                          </button>
                        ) : (
                          <span>{invoice.customerName}</span>
                        )}
                      </TableCell>
                    );
                    if (col.key === "surcharge") return <TableCell key="surcharge">{formatVND(invoice.surcharge)}</TableCell>;
                    if (col.key === "discount") return <TableCell key="discount">{formatVND(invoice.discount)}</TableCell>;
                    if (col.key === "promotionName") return <TableCell key="promotionName">{renderPromotion(invoice)}</TableCell>;
                    if (col.key === "voucherName") return <TableCell key="voucherName">{renderVoucher(invoice)}</TableCell>;
                    if (col.key === "totalAmount") return <TableCell key="totalAmount">{formatVND(invoice.totalAmount)}</TableCell>;
                    return null;
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Hiển thị từ {from} đến {to} trên tổng số {total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">{page}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={to >= total}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value={20}>20 / trang</option>
            <option value={50}>50 / trang</option>
            <option value={100}>100 / trang</option>
          </select>
        </div>
      </div>

      {/*
        Full-page invoice view — replaces the old modal InvoiceDetailDialog.
        Opens when the user clicks an invoice code (gated by view_all_invoices
        permission). Same component used by Cashier > Lịch sử hóa đơn and
        Booking > checkout, so the experience is consistent across modules.
      */}
      {detailTarget && (
        <PaidInvoiceView
          invoiceId={detailTarget.invoiceId}
          customerName={detailTarget.customerName}
          bookingCode={detailTarget.code}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}

"use client";

import {
  X,
  User,
  Phone,
  Clock,
  Camera,
  Trash,
  UserPlus,
  Star,
  Printer,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useRevenueVoucherStore } from "@/stores/revenue-voucher-store";
import { formatVND, formatDate } from "@/lib/revenue-voucher-utils";
import { useToast } from "@/hooks/use-toast";

/**
 * Receipt detail dialog.
 *
 * NOTE: The mock `ReceiptDetail` (services / customer info / images / payment
 * breakdown) has been removed now that the store is wired to real Supabase
 * data. Until the linked-invoice detail is fetched from
 * `/api/supabase/invoices/[id]`, this dialog shows the voucher's own fields
 * (code, category, datetime, createdBy, amount, payment method, invoice link)
 * plus a placeholder notice for the deeper invoice breakdown — mirroring the
 * "Tính năng sẽ khả dụng ở giai đoạn lõi" notices on the action buttons.
 */
export function ReceiptDetailDialog() {
  const { isDetailOpen, closeDetail, selectedReceipt } = useRevenueVoucherStore();

  const { toast } = useToast();

  const handleAction = () => {
    toast({
      title: "Thông báo",
      description: "Tính năng sẽ khả dụng ở giai đoạn lõi",
    });
  };

  if (!selectedReceipt) return null;

  const paymentMethodLabel =
    selectedReceipt.paymentMethod === "cash"
      ? "Tiền mặt"
      : selectedReceipt.paymentMethod === "transfer"
        ? "Chuyển khoản"
        : selectedReceipt.paymentMethod === "card"
          ? "Thẻ"
          : "—";

  return (
    <Dialog open={isDetailOpen} onOpenChange={closeDetail}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Chi tiết phiếu thu #{selectedReceipt.code}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {/* Info Section — fields sourced directly from the voucher */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">Mã phiếu:</span>
              <span>#{selectedReceipt.code}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Danh mục:</span>
              <span>{selectedReceipt.categoryName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <span>{formatDate(selectedReceipt.datetime, "datetime")}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-500" />
              <span>Người tạo: {selectedReceipt.createdBy}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Số tiền:</span>
              <span className="font-medium">{formatVND(selectedReceipt.amount)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Thanh toán bằng:</span>
              <span>{paymentMethodLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Trạng thái:</span>
              <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">
                Đã ghi nhận
              </Badge>
            </div>
            {selectedReceipt.invoiceCode && (
              <div className="flex items-center gap-2">
                <span className="font-medium">Liên kết hóa đơn:</span>
                <span>{selectedReceipt.invoiceCode}</span>
              </div>
            )}
          </div>

          {/* Placeholder for the linked-invoice breakdown */}
          <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
            <Info className="h-5 w-5 text-gray-400" />
            <p>
              Thông tin dịch vụ, khách hàng và chi tiết thanh toán sẽ khả dụng ở
              giai đoạn lõi.
            </p>
          </div>

          {/* Stub sections — kept for layout parity with the mock version,
              each showing a "coming soon" notice instead of fake data. */}
          <div>
            <h3 className="font-medium mb-2">Dịch vụ</h3>
            <div className="rounded-md border p-4 text-sm text-gray-500">
              <Phone className="h-4 w-4 inline-block mr-2 text-gray-400" />
              Thông tin dịch vụ sẽ khả dụng ở giai đoạn lõi.
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2">Hình ảnh dịch vụ</h3>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="aspect-square bg-gray-100 rounded-md flex items-center justify-center"
                >
                  <Camera className="h-8 w-8 text-gray-300" />
                </div>
              ))}
            </div>
          </div>

          {/* Payment Summary — only the voucher's own amount is known. */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Số tiền phiếu thu:</span>
              <span className="font-medium">{formatVND(selectedReceipt.amount)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Chi tiết thanh toán (tổng, cấn trừ, đã trả):</span>
              <span>sẽ khả dụng ở giai đoạn lõi</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleAction}>
            <Trash className="h-4 w-4 mr-1" />
            Hủy hóa đơn
          </Button>
          <Button variant="outline" onClick={handleAction}>
            <UserPlus className="h-4 w-4 mr-1" />
            Xếp nhân viên
          </Button>
          <Button variant="outline" onClick={handleAction}>
            <Star className="h-4 w-4 mr-1" />
            Xem đánh giá
          </Button>
          <Button variant="outline" onClick={handleAction}>
            <Printer className="h-4 w-4 mr-1" />
            In hóa đơn
          </Button>
          <Button variant="destructive" onClick={handleAction}>
            <X className="h-4 w-4 mr-1" />
            Hủy thanh toán
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

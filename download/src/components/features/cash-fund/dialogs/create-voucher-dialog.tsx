"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCashFundStore,
  useCashFundCategories,
  useAddTransaction,
} from "@/stores/cash-fund-store";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/cash-fund-utils";

interface CreateVoucherDialogProps {
  type?: "revenue" | "expense";
}

export function CreateVoucherDialog({ type: propType }: CreateVoucherDialogProps) {
  const { toast } = useToast();
  const { isVoucherOpen, closeAllDialogs, voucherType } = useCashFundStore();
  const categories = useCashFundCategories();
  const addTransaction = useAddTransaction();

  const type = propType || voucherType;
  const isRevenue = type === "revenue";
  const title = isRevenue ? "Tạo phiếu THU" : "Tạo phiếu CHI";

  const [createdBy, setCreatedBy] = useState("crmlevel1@gmail.com");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "card">("cash");
  const [reason, setReason] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [date, setDate] = useState(formatDate(new Date().toISOString(), "date"));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const category = categories.find((c) => c.id === categoryId);
      await addTransaction({
        type,
        categoryId: categoryId || "cat-0",
        categoryName: category?.name || "Không xác định",
        amount: Number(amount) || 0,
        createdBy,
        paymentMethod,
        reason,
        link: undefined,
        voucherCode: voucherCode || undefined,
      });
      toast({
        title: "Thành công",
        description: `${isRevenue ? "Tạo phiếu THU" : "Tạo phiếu CHI"} thành công`,
      });
      closeAllDialogs();
    } catch (err) {
      toast({
        title: "Lỗi",
        description: err instanceof Error ? err.message : "Tạo phiếu thất bại",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isVoucherOpen}
      onOpenChange={(open) => !open && closeAllDialogs()}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Người lập phiếu */}
          <div className="grid grid-cols-3 items-center gap-4">
            <Label className="text-right">
              <span className="text-red-500 mr-1">*</span>Người lập phiếu:
            </Label>
            <Input
              className="col-span-2"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              readOnly
            />
          </div>

          {/* Số tiền */}
          <div className="grid grid-cols-3 items-center gap-4">
            <Label className="text-right">
              <span className="text-red-500 mr-1">*</span>Số tiền:
            </Label>
            <Input
              className="col-span-2"
              type="number"
              placeholder="Nhập số tiền"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Hình thức */}
          <div className="grid grid-cols-3 items-center gap-4">
            <Label className="text-right">
              <span className="text-red-500 mr-1">*</span>Hình thức:
            </Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as "cash" | "transfer" | "card")}
            >
              <SelectTrigger className="col-span-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Tiền mặt</SelectItem>
                <SelectItem value="transfer">Chuyển khoản</SelectItem>
                <SelectItem value="card">Thẻ</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Lý do */}
          <div className="grid grid-cols-3 items-start gap-4">
            <Label className="text-right pt-2">
              <span className="text-red-500 mr-1">*</span>Lý do tạo phiếu:
            </Label>
            <textarea
              className="col-span-2 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Nhập lý do tạo phiếu"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {/* Danh mục */}
          <div className="grid grid-cols-3 items-center gap-4">
            <Label className="text-right">Danh mục:</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="col-span-2">
                <SelectValue placeholder="Chọn" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div />
            <div className="col-span-2 flex items-center gap-1 text-xs text-red-500">
              Vui lòng chọn đúng danh mục mặc định của hệ thống nếu cần sử dụng tính năng số kế toán
              <Info className="h-3 w-3" />
            </div>
          </div>

          {/* Mã phiếu */}
          <div className="grid grid-cols-3 items-center gap-4">
            <Label className="text-right">Mã phiếu:</Label>
            <Input
              className="col-span-2"
              placeholder="Nhập mã hoặc để trống"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
            />
          </div>

          {/* Ngày tháng */}
          <div className="grid grid-cols-3 items-center gap-4">
            <Label className="text-right">
              <span className="text-red-500 mr-1">*</span>Ngày tháng:
            </Label>
            <Input
              className="col-span-2"
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={closeAllDialogs} disabled={submitting}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Đang lưu..." : "OK"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
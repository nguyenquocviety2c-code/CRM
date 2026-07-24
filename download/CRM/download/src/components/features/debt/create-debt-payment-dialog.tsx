"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDebtStore,
  useDebtInvoicesByDebt,
  useCreateDebtPayment,
} from "@/stores/debt-store";
import { formatVND, validateCreateDebtPayment } from "@/lib/debt-utils";
import { CreateDebtPaymentInput } from "@/types/debt";

const paymentMethodOptions = [
  { value: "cash", label: "Tiền mặt" },
  { value: "transfer", label: "Chuyển khoản" },
  { value: "card", label: "Thẻ" },
];

function getTodayString(): string {
  return new Date().toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getInitialFormData(debtId: string, totalAmount: number): CreateDebtPaymentInput {
  return {
    debtId,
    amount: totalAmount,
    paymentMethod: "cash",
    invoiceId: "",
    paymentDate: getTodayString(),
    receiptCode: null,
    note: "",
    printReceipt: false,
  };
}

export function CreateDebtPaymentDialog() {
  const { isCreatePaymentOpen, closeCreatePaymentDialog, selectedDebt } =
    useDebtStore();

  // Always call hook, even if selectedDebt is null
  const invoices = useDebtInvoicesByDebt(selectedDebt?.id || "");
  const createDebtPayment = useCreateDebtPayment();

  const [formData, setFormData] = useState<CreateDebtPaymentInput>(
    getInitialFormData(selectedDebt?.id || "", selectedDebt?.totalAmount || 0)
  );

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (
    field: keyof CreateDebtPaymentInput,
    value: string | number | boolean | null
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field as string];
      return newErrors;
    });
  };

  const handleInvoiceChange = (invoiceId: string) => {
    const selectedInvoice = invoices.find((inv) => inv.id === invoiceId);
    setFormData((prev) => ({
      ...prev,
      invoiceId,
      amount:
        selectedInvoice && selectedInvoice.amount <= (selectedDebt?.totalAmount || 0)
          ? selectedInvoice.amount
          : prev.amount,
    }));
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors.invoiceId;
      delete newErrors.amount;
      return newErrors;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebt) return;

    const result = validateCreateDebtPayment(formData, selectedDebt);
    if (!result.valid) {
      setErrors(result.errors || {});
      return;
    }

    // The receipt code is auto-generated inside `createDebtPayment` when
    // left blank — see `useCreateDebtPayment` in the debt store.
    createDebtPayment(formData);
    setErrors({});
  };

  const handleClose = () => {
    setErrors({});
    closeCreatePaymentDialog();
  };

  // Reset form when dialog opens with new debt
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleClose();
    } else if (selectedDebt) {
      setFormData(getInitialFormData(selectedDebt.id, selectedDebt.totalAmount));
      setErrors({});
    }
  };

  if (!selectedDebt) return null;

  return (
    <Dialog open={isCreatePaymentOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo thu nợ</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Tổng nợ (readonly) */}
          <div className="space-y-2">
            <Label>Tổng nợ</Label>
            <Input
              value={formatVND(selectedDebt.totalAmount)}
              readOnly
              disabled
              className="bg-gray-50 text-gray-700"
            />
          </div>

          {/* 2. Phương thức + 3. Số tiền thu */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Phương thức</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(value) =>
                  handleChange("paymentMethod", value)
                }
              >
                <SelectTrigger id="paymentMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethodOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Số tiền thu</Label>
              <Input
                id="amount"
                type="number"
                value={formData.amount || ""}
                onChange={(e) =>
                  handleChange("amount", Number(e.target.value))
                }
              />
              {errors.amount && (
                <p className="text-sm text-red-500">{errors.amount}</p>
              )}
            </div>
          </div>

          {/* 4. Hóa đơn nợ (required) */}
          <div className="space-y-2">
            <Label htmlFor="invoiceId">
              <span className="text-red-500">*</span> Hóa đơn nợ
            </Label>
            <Select
              value={formData.invoiceId}
              onValueChange={handleInvoiceChange}
            >
              <SelectTrigger id="invoiceId">
                <SelectValue placeholder="Chọn hóa đơn nợ" />
              </SelectTrigger>
              <SelectContent>
                {invoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.invoiceCode} - {formatVND(inv.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.invoiceId && (
              <p className="text-sm text-red-500">{errors.invoiceId}</p>
            )}
          </div>

          {/* 5. Ngày thu */}
          <div className="space-y-2">
            <Label htmlFor="paymentDate">Ngày thu</Label>
            <Input
              id="paymentDate"
              placeholder="DD/MM/YYYY"
              value={formData.paymentDate}
              onChange={(e) => handleChange("paymentDate", e.target.value)}
            />
            {errors.paymentDate && (
              <p className="text-sm text-red-500">{errors.paymentDate}</p>
            )}
          </div>

          {/* 6. Mã phiếu thu */}
          <div className="space-y-2">
            <Label htmlFor="receiptCode">Mã phiếu thu</Label>
            <Input
              id="receiptCode"
              placeholder="Nhập mã phiếu thu hoặc để trống"
              value={formData.receiptCode || ""}
              onChange={(e) =>
                handleChange("receiptCode", e.target.value || null)
              }
            />
          </div>

          {/* 7. Ghi chú */}
          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea
              id="note"
              placeholder="Nhập ghi chú"
              value={formData.note}
              onChange={(e) => handleChange("note", e.target.value)}
            />
          </div>

          {/* 8. In phiếu thu */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="printReceipt"
              checked={formData.printReceipt}
              onCheckedChange={(checked) =>
                handleChange("printReceipt", checked as boolean)
              }
            />
            <Label htmlFor="printReceipt" className="cursor-pointer">
              In phiếu thu
            </Label>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose}>
              Hủy
            </Button>
            <Button type="submit">OK</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
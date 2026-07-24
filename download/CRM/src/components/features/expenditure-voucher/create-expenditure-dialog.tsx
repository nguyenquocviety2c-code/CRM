"use client";

import { useState } from "react";
import { Info } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useExpenditureVoucherStore,
  useAddExpenditure,
  useExpenditureVoucherCategories,
} from "@/stores/expenditure-voucher-store";
import { validateCreateExpenditure } from "@/lib/expenditure-voucher-utils";
import { CreateExpenditureInput } from "@/types/expenditure-voucher";
import { useToast } from "@/hooks/use-toast";

export function CreateExpenditureDialog() {
  const {
    isCreateExpenditureOpen,
    closeCreateExpenditureDialog,
  } = useExpenditureVoucherStore();
  const addExpenditure = useAddExpenditure();
  const { data: categories } = useExpenditureVoucherCategories();
  const { toast } = useToast();

  const [formData, setFormData] = useState<CreateExpenditureInput>({
    createdBy: "crmlevel1@gmail.com",
    amount: 0,
    paymentMethod: "cash",
    reason: "",
    categoryId: null,
    code: null,
    date: new Date().toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).replace(/\//g, "/"),
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof CreateExpenditureInput, value: string | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field as string];
      return newErrors;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateCreateExpenditure(formData);
    if (!result.valid) {
      setErrors(result.errors || {});
      return;
    }
    setSubmitting(true);
    try {
      await addExpenditure(formData);
      setErrors({});
      closeCreateExpenditureDialog();
      toast({
        title: "Đã tạo",
        description: "Phiếu chi đã được tạo thành công",
      });
    } catch (err) {
      toast({
        title: "Lỗi",
        description:
          err instanceof Error ? err.message : "Tạo phiếu chi thất bại",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setErrors({});
    closeCreateExpenditureDialog();
  };

  return (
    <Dialog open={isCreateExpenditureOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo phiếu chi</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Required fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="createdBy">
                Người lập phiếu <span className="text-red-500">*</span>
              </Label>
              <Input
                id="createdBy"
                value={formData.createdBy}
                readOnly
                disabled
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">
                Số tiền <span className="text-red-500">*</span>
              </Label>
              <Input
                id="amount"
                type="number"
                placeholder="Nhập số tiền"
                value={formData.amount || ""}
                disabled={submitting}
                onChange={(e) => handleChange("amount", Number(e.target.value))}
              />
              {errors.amount && (
                <p className="text-sm text-red-500">{errors.amount}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">
                Hình thức <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(value) => handleChange("paymentMethod", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn hình thức" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Tiền mặt</SelectItem>
                  <SelectItem value="transfer">Chuyển khoản</SelectItem>
                  <SelectItem value="card">Thẻ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">
                Lý do tạo phiếu <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="reason"
                placeholder="Nhập lý do tạo phiếu"
                value={formData.reason}
                disabled={submitting}
                onChange={(e) => handleChange("reason", e.target.value)}
              />
              {errors.reason && (
                <p className="text-sm text-red-500">{errors.reason}</p>
              )}
            </div>
          </div>

          {/* Optional fields */}
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="categoryId">Danh mục</Label>
              <Select
                value={formData.categoryId || ""}
                onValueChange={(value) => handleChange("categoryId", value || null)}
              >
                <SelectTrigger>
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
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Info className="h-3 w-3" />
                Vui lòng chọn đúng danh mục mặc định của hệ thống nếu cần sử dụng tính năng số kế toán
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Mã phiếu</Label>
              <Input
                id="code"
                placeholder="Để trống để tự sinh (PCxxxxxx)"
                value={formData.code || ""}
                disabled={submitting}
                onChange={(e) => handleChange("code", e.target.value || null)}
              />
              <p className="text-xs text-gray-500">
                Mã phiếu sẽ được tự động sinh bởi hệ thống nếu để trống.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">
                Ngày tháng <span className="text-red-500">*</span>
              </Label>
              <Input
                id="date"
                placeholder="DD/MM/YYYY"
                value={formData.date}
                disabled={submitting}
                onChange={(e) => handleChange("date", e.target.value)}
              />
              {errors.date && (
                <p className="text-sm text-red-500">{errors.date}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Đang lưu..." : "OK"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

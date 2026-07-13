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
import {
  useExpenditureVoucherStore,
  useAddCategory,
  useExpenditureVoucherCategories,
} from "@/stores/expenditure-voucher-store";
import { validateCategoryName } from "@/lib/expenditure-voucher-utils";
import { useToast } from "@/hooks/use-toast";

export function CategoryFormDialog() {
  const {
    isCategoryFormOpen,
    closeCategoryFormDialog,
  } = useExpenditureVoucherStore();
  const addCategory = useAddCategory();
  const { data: categories } = useExpenditureVoucherCategories();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateCategoryName(name, categories);
    if (!result.valid) {
      setError(result.error || "Lỗi không xác định");
      return;
    }
    setSubmitting(true);
    try {
      await addCategory(name);
      setName("");
      setError(null);
      closeCategoryFormDialog();
      toast({
        title: "Đã thêm",
        description: `Loại phiếu chi "${name.trim()}" đã được tạo`,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Tạo loại phiếu chi thất bại"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setName("");
    setError(null);
    closeCategoryFormDialog();
  };

  return (
    <Dialog open={isCategoryFormOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm loại phiếu chi</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">
              Tên loại <span className="text-red-500">*</span>
            </Label>
            <Input
              id="category-name"
              placeholder="Nhập tên loại"
              value={name}
              disabled={submitting}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
          <div className="flex justify-end gap-2">
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

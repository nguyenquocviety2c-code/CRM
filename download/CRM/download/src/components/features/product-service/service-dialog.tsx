"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { serviceSchema } from "@/lib/validations";
import { ServiceCostTypeLabel } from "@/lib/constants";

type ServiceFormData = z.infer<typeof serviceSchema>;

interface ServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ServiceFormData) => void;
  onDelete?: (id: string) => void;
  categories: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  products: { id: string; name: string }[];
  editService?: { id: string; name: string; price: number; cost: number; duration: number; categoryId?: string; category?: { name: string } | null; subPrices?: { label: string; price: number }[]; allowBooking?: boolean; showOnApp?: boolean } | null;
}

export function ServiceDialog({
  open,
  onOpenChange,
  onSubmit,
  onDelete,
  categories,
  branches,
  products,
  editService,
}: ServiceDialogProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: "",
      categoryId: "",
      price: 0,
      cost: 0,
      costType: "VND" as const,
      subPrices: [] as { label: string; price: number }[],
      duration: 60,
      branchId: "",
      attachedProducts: [] as { productId: string }[],
      allowBooking: true,
      showOnApp: true,
    },
  });

  const [subPrices, setSubPrices] = useState<{ label: string; price: number }[]>([]);
  const [attachedProducts, setAttachedProducts] = useState<{ productId: string }[]>([]);

  // Fill form when editing
  useEffect(() => {
    if (open && editService) {
      reset({
        name: editService.name,
        categoryId: editService.categoryId || "",
        price: editService.price,
        cost: editService.cost,
        costType: "VND" as const,
        subPrices: editService.subPrices || [],
        duration: editService.duration || 60,
        branchId: (editService as { branchId?: string | null })?.branchId || "",
        attachedProducts: [],
        allowBooking: editService.allowBooking ?? true,
        showOnApp: editService.showOnApp ?? true,
      });
      setSubPrices(editService.subPrices || []);
      setAttachedProducts([]);
    } else if (open && !editService) {
      reset({
        name: "",
        categoryId: "",
        price: 0,
        cost: 0,
        costType: "VND" as const,
        subPrices: [],
        duration: 60,
        branchId: "",
        attachedProducts: [],
        allowBooking: true,
        showOnApp: true,
      });
      setSubPrices([]);
      setAttachedProducts([]);
    }
  }, [open, editService, reset]);

  const handleAddSubPrice = () => {
    setSubPrices([...subPrices, { label: "", price: 0 }]);
  };

  const handleRemoveSubPrice = (index: number) => {
    const newSubPrices = subPrices.filter((_, i) => i !== index);
    setSubPrices(newSubPrices);
    setValue("subPrices", newSubPrices);
  };

  const handleSubPriceChange = (
    index: number,
    field: "label" | "price",
    value: string | number
  ) => {
    const newSubPrices = [...subPrices];
    newSubPrices[index] = { ...newSubPrices[index], [field]: value };
    setSubPrices(newSubPrices);
    setValue("subPrices", newSubPrices);
  };

  const handleAddAttachedProduct = () => {
    setAttachedProducts([...attachedProducts, { productId: "" }]);
  };

  const handleRemoveAttachedProduct = (index: number) => {
    const newAttachedProducts = attachedProducts.filter((_, i) => i !== index);
    setAttachedProducts(newAttachedProducts);
    setValue("attachedProducts", newAttachedProducts);
  };

  const handleAttachedProductChange = (index: number, productId: string) => {
    const newAttachedProducts = [...attachedProducts];
    newAttachedProducts[index] = { productId };
    setAttachedProducts(newAttachedProducts);
    setValue("attachedProducts", newAttachedProducts);
  };

  const onFormSubmit = (data: ServiceFormData) => {
    onSubmit(data);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-lg max-h-[80vh] bg-white rounded-lg shadow-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-lg">
          <h2 className="text-lg font-semibold">Thông tin dịch vụ</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 hover:bg-gray-100 rounded-full"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {/* 1. Tên dịch vụ */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Tên dịch vụ <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              placeholder="VD: Sunsilk-01"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* 2. Nhóm dịch vụ + Cửa hàng (cùng dòng) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="categoryId">
                Nhóm dịch vụ <span className="text-red-500">*</span>
              </Label>
              <Select value={watch("categoryId") || ""} onValueChange={(value) => setValue("categoryId", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoryId && (
                <p className="text-sm text-red-500">{errors.categoryId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Cửa hàng</Label>
              <div className="flex flex-wrap gap-2">
                {branches.map((branch) => {
                  const checked = (watch("branchId") || "").split(",").includes(branch.id);
                  return (
                    <label
                      key={branch.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors",
                        checked
                          ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          const current = (watch("branchId") || "").split(",").filter(Boolean);
                          const next = current.includes(branch.id)
                            ? current.filter((id) => id !== branch.id)
                            : [...current, branch.id];
                          setValue("branchId", next.join(","));
                        }}
                        className="h-3.5 w-3.5"
                      />
                      {branch.name}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Đơn giá */}
          <div className="space-y-2">
            <Label htmlFor="price">
              Đơn giá <span className="text-red-500">*</span>
            </Label>
            <Input
              id="price"
              type="number"
              placeholder="Nhập đơn giá"
              {...register("price", { valueAsNumber: true })}
            />
            {errors.price && (
              <p className="text-sm text-red-500">{errors.price.message}</p>
            )}
          </div>

          {/* 3b. Thời gian thực hiện (phút) */}
          <div className="space-y-2">
            <Label htmlFor="duration">Thời gian thực hiện (phút)</Label>
            <Input
              id="duration"
              type="number"
              placeholder="Nhập số phút"
              {...register("duration", { valueAsNumber: true })}
            />
          </div>

          {/* 9. Cho phép đặt lịch */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="allowBooking"
              defaultChecked
              onCheckedChange={(checked) =>
                setValue("allowBooking", checked as boolean)
              }
            />
            <Label htmlFor="allowBooking">Cho phép đặt lịch</Label>
          </div>

          {/* 10. Hiển thị trên app khách hàng */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="showOnApp"
              defaultChecked
              onCheckedChange={(checked) =>
                setValue("showOnApp", checked as boolean)
              }
            />
            <Label htmlFor="showOnApp">Hiển thị trên app khách hàng</Label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 px-6 py-4 border-t sticky bottom-0 bg-white rounded-b-lg">
          {/* Delete button — only when editing */}
          {editService && onDelete ? (
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm(`Bạn có chắc muốn xóa dịch vụ "${editService.name}"?`)) {
                  onDelete(editService.id);
                }
              }}
            >
              Xóa dịch vụ
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button onClick={handleSubmit(onFormSubmit)}>OK</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
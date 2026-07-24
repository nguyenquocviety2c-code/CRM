"use client";

import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { CustomerSet } from "@/stores/customer-care-store";
import { queryKeys } from "@/lib/query-keys";
import { customerSetSchema } from "@/lib/validations";

type CustomerSetFormValues = z.infer<typeof customerSetSchema>;

interface CustomerSetDialogProps {
  open: boolean;
  onClose: () => void;
  customerSet: CustomerSet | null;
}

const conditionOptions = [
  { value: "lastVisitDays", label: "Số ngày từ lần cuối ghé" },
  { value: "totalSpent", label: "Tổng chi tiêu" },
  { value: "serviceCount", label: "Số lần sử dụng dịch vụ" },
  { value: "birthdayMonth", label: "Tháng sinh nhật" },
  { value: "customerGroup", label: "Nhóm khách hàng" },
];

export function CustomerSetDialog({ open, onClose, customerSet }: CustomerSetDialogProps) {
  const queryClient = useQueryClient();
  const isEditMode = !!customerSet;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<CustomerSetFormValues>({
    resolver: zodResolver(customerSetSchema),
    defaultValues: {
      name: "",
      note: "",
      autoUpdate: false,
      conditions: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "conditions",
  });

  useEffect(() => {
    if (customerSet) {
      reset({
        name: customerSet.name,
        note: customerSet.note || "",
        autoUpdate: customerSet.autoUpdate,
        conditions: customerSet.conditions.map((c) => ({
          conditionType: c.conditionType,
          conditionValue: c.conditionValue || "",
        })),
      });
    } else {
      reset({
        name: "",
        note: "",
        autoUpdate: false,
        conditions: [],
      });
    }
  }, [customerSet, reset]);

  const createMutation = useMutation({
    mutationFn: async (data: CustomerSetFormValues) => {
      const res = await fetch("/api/supabase/customer-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerCare.customerSets.all });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CustomerSetFormValues) => {
      if (!customerSet) return;
      const res = await fetch(`/api/supabase/customer-sets/${customerSet.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerCare.customerSets.all });
      onClose();
    },
  });

  const onSubmit = (data: CustomerSetFormValues) => {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleAddCondition = () => {
    append({ conditionType: "", conditionValue: "" });
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        {/* Sticky Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>
            {isEditMode ? "Sửa tập khách hàng" : "Tạo mới tập khách hàng"}
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable Body */}
        <div
          className="px-6 py-4 overflow-y-auto"
          style={{
            maxHeight: "calc(80vh - 120px)",
            scrollbarWidth: "thin",
          }}
        >
          <form id="customer-set-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Field 1: Tên */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                <span className="text-red-500">*</span> Tên
              </Label>
              <div className="flex-1">
                <Input
                  {...register("name")}
                  placeholder="Nhập tên"
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name && (
                  <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>
                )}
              </div>
            </div>

            {/* Field 2: Mô tả hoặc ghi chú */}
            <div className="flex items-start gap-4">
              <Label className="w-[140px] pt-2 text-right shrink-0">
                Mô tả hoặc ghi chú
              </Label>
              <div className="flex-1">
                <Textarea
                  {...register("note")}
                  placeholder="Nhập mô tả hoặc ghi chú"
                  rows={3}
                />
              </div>
            </div>

            {/* Field 3: Tự động cập nhật */}
            <div className="flex items-start gap-4">
              <div className="w-[140px]" />
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  {...register("autoUpdate")}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600"
                />
                <span className="text-sm">Tự động cập nhật danh sách khách hàng</span>
              </div>
            </div>

            {/* Field 4: Điều kiện áp dụng */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Điều kiện áp dụng:</Label>
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Select
                    onValueChange={(value) =>
                      setValue(`conditions.${index}.conditionType`, value)
                    }
                    value={watch(`conditions.${index}.conditionType`) || ""}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Chọn điều kiện" />
                    </SelectTrigger>
                    <SelectContent>
                      {conditionOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(index)}
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCondition}
                className="text-emerald-600 border-emerald-600 hover:bg-emerald-50"
              >
                <Plus className="mr-1 h-4 w-4" />
                Thêm điều kiện
              </Button>
            </div>
          </form>
        </div>

        {/* Sticky Footer */}
        <div className="px-6 py-4 border-t bg-white flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="submit"
            form="customer-set-form"
            disabled={createMutation.isPending || updateMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {createMutation.isPending || updateMutation.isPending
              ? "Đang lưu..."
              : "Lưu"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
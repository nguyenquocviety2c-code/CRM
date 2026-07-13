"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { exportSlipSchema } from "@/lib/validations";
import { ExportType } from "@/lib/constants";
import { queryKeys } from "@/lib/query-keys";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ExportSlipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportSlipDialog({ open, onOpenChange }: ExportSlipDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: productsData } = useQuery({
    queryKey: queryKeys.products.list({ active: true }),
    queryFn: async () => {
      const res = await fetch("/api/supabase/products?active=true&limit=100");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return Array.isArray(json.data) ? json.data : [];
    },
  });

  const { data: branchesData } = useQuery({
    queryKey: queryKeys.productCategories.list({ scope: "branches" }),
    queryFn: async () => {
      const res = await fetch("/api/supabase/branches");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return Array.isArray(json.data) ? json.data : [];
    },
  });

  const products: Array<{ id: string; name: string; code: string | null }> =
    productsData || [];
  const branches: Array<{ id: string; name: string }> = branchesData || [];

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(exportSlipSchema),
    defaultValues: {
      createdByEmail: "crmlevel1@gmail.com",
      code: "",
      exportDate: new Date().toISOString().split("T")[0],
      note: "",
      exportType: ExportType.USE,
      receiverId: "",
      products: [{ productId: "", quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "products",
  });

  const onSubmit = async (data: unknown) => {
    setIsSubmitting(true);
    try {
      const formData = data as {
        note?: string;
        exportType?: string;
        receiverId?: string;
        products: Array<{ productId: string; quantity: number }>;
      };
      const payload = {
        type: "export" as const,
        branch_id: formData.receiverId || branches[0]?.id || "",
        slip_type: formData.exportType ?? "use",
        note: formData.note ?? "",
        created_by: (data as { createdByEmail?: string }).createdByEmail,
        items: formData.products.map((p) => ({
          product_id: p.productId,
          quantity: p.quantity,
          cost_price: 0,
        })),
      };
      const res = await fetch("/api/supabase/warehouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      reset();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating export slip:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo phiếu xuất</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="createdByEmail">
                <span className="text-red-500">*</span> Tên người xuất kho:
              </Label>
              <Input
                id="createdByEmail"
                {...register("createdByEmail")}
                placeholder="crmlevel1@gmail.com"
              />
              {errors.createdByEmail && (
                <p className="text-sm text-red-500">{errors.createdByEmail.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Mã phiếu:</Label>
              <Input
                id="code"
                {...register("code")}
                placeholder="Nhập mã phiếu"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="exportDate">
                <span className="text-red-500">*</span> Ngày xuất:
              </Label>
              <Input
                id="exportDate"
                type="date"
                {...register("exportDate")}
              />
              {errors.exportDate && (
                <p className="text-sm text-red-500">{errors.exportDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Ghi chú:</Label>
              <Input
                id="note"
                {...register("note")}
                placeholder="Nhập ghi chú"
              />
            </div>

            <div className="space-y-2">
              <Label>Phân loại:</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={ExportType.USE}
                    {...register("exportType")}
                    defaultChecked
                  />
                  <span>Xuất sử dụng</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={ExportType.RETURN}
                    {...register("exportType")}
                  />
                  <span>Trả hàng nhập</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={ExportType.DESTROY}
                    {...register("exportType")}
                  />
                  <span>Xuất hủy</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="receiverId">Tên người nhận:</Label>
              <Select
                onValueChange={(value) => setValue("receiverId", value)}
                value={watch("receiverId")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn chi nhánh" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              <span className="text-red-500">*</span> Sản phẩm:
            </Label>
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="flex items-center gap-2 p-3 bg-emerald-50 rounded-md"
              >
                <div className="flex-1 space-y-2">
                  <Select
                    onValueChange={(value) =>
                      setValue(`products.${index}.productId`, value)
                    }
                    value={watch(`products.${index}.productId`)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn sản phẩm" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-sm text-gray-500">Tồn kho: 0</div>
                  <Input
                    type="number"
                    {...register(`products.${index}.quantity` as const)}
                    placeholder="Nhập số lượng"
                    min={1}
                  />
                </div>
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => append({ productId: "", quantity: 1 })}
            >
              Thêm sản phẩm
            </Button>
            {errors.products && (
              <p className="text-sm text-red-500">{errors.products.message}</p>
            )}
          </div>

          <p className="text-sm text-amber-600 italic">
            Giá xuất/chuyển sản phẩm sẽ có sự thay đổi nếu thực hiện trong quá khứ.
          </p>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang xử lý..." : "OK"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
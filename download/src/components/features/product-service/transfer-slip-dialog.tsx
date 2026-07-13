"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { transferSlipSchema } from "@/lib/validations";
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

interface TransferSlipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransferSlipDialog({ open, onOpenChange }: TransferSlipDialogProps) {
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
    resolver: zodResolver(transferSlipSchema),
    defaultValues: {
      createdByEmail: "crmlevel1@gmail.com",
      code: "",
      transferDate: new Date().toISOString().split("T")[0],
      fromBranchId: "",
      toBranchId: "",
      note: "",
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
        transferDate?: string;
        fromBranchId?: string;
        toBranchId?: string;
        note?: string;
        products: Array<{ productId: string; quantity: number }>;
      };
      const payload = {
        type: "transfer" as const,
        from_branch_id: formData.fromBranchId || "",
        to_branch_id: formData.toBranchId || "",
        transfer_date: formData.transferDate ?? "",
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
      console.error("Error creating transfer slip:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo phiếu chuyển</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="createdByEmail">
                <span className="text-red-500">*</span> Tên người tạo phiếu:
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
              <Label htmlFor="transferDate">
                <span className="text-red-500">*</span> Ngày chuyển kho:
              </Label>
              <Input
                id="transferDate"
                type="date"
                {...register("transferDate")}
              />
              {errors.transferDate && (
                <p className="text-sm text-red-500">{errors.transferDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fromBranchId">
                <span className="text-red-500">*</span> Chuyển từ:
              </Label>
              <Select
                onValueChange={(value) => setValue("fromBranchId", value)}
                value={watch("fromBranchId")}
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
              {errors.fromBranchId && (
                <p className="text-sm text-red-500">{errors.fromBranchId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="toBranchId">
                <span className="text-red-500">*</span> Chuyển tới:
              </Label>
              <Select
                onValueChange={(value) => setValue("toBranchId", value)}
                value={watch("toBranchId")}
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
              {errors.toBranchId && (
                <p className="text-sm text-red-500">{errors.toBranchId.message}</p>
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
          </div>

          <div className="space-y-2">
            <Label>
              <span className="text-red-500">*</span> Sản phẩm:
            </Label>
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="flex items-center gap-2 p-3 bg-gray-50 rounded-md"
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
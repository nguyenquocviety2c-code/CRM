"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { productCategorySchema } from "@/lib/validations";
import { queryKeys } from "@/lib/query-keys";
import { z } from "zod";

type ProductCategoryFormData = z.infer<typeof productCategorySchema>;

interface ProductCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: {
    id: string;
    name: string;
  } | null;
}

export function ProductCategoryDialog({
  open,
  onOpenChange,
  category,
}: ProductCategoryDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!category;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProductCategoryFormData>({
    resolver: zodResolver(productCategorySchema),
    defaultValues: {
      name: "",
    },
  });

  useEffect(() => {
    if (category) {
      reset({ name: category.name });
    } else {
      reset({ name: "" });
    }
  }, [category, reset]);

  const mutation = useMutation({
    mutationFn: async (data: ProductCategoryFormData) => {
      // Create uses the Supabase API. Update still uses the Prisma API
      // because there is no `/api/supabase/product-categories/[id]` route yet.
      const url = isEdit
        ? `/api/product-categories/${category!.id}`
        : "/api/supabase/product-categories";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productCategories.all });
      onOpenChange(false);
    },
  });

  const onSubmit = (data: ProductCategoryFormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {isEdit ? "Sửa nhóm sản phẩm" : "Thêm nhóm sản phẩm"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="name">
              Tên loại <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              placeholder="Nhập tên loại"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Đang lưu..." : "OK"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
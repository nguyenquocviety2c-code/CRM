"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectValue, SelectTrigger } from "@/components/ui/select";
import { productSchema } from "@/lib/validations";
import { ProductUnit, ProductVolumeUnit } from "@/lib/constants";
import { queryKeys } from "@/lib/query-keys";
import { z } from "zod";

type ProductFormData = z.infer<typeof productSchema>;

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: {
    id: string;
    code: string;
    name: string;
    price: number;
    categoryId?: string | null;
    initialStock?: number | null;
    unit?: string | null;
    volume?: number | null;
    volumeUnit?: string | null;
    origin?: string | null;
    branchId?: string | null;
    detail?: string | null;
    showOnApp?: boolean | null;
    productType?: string | null;
  } | null;
}

export function ProductDialog({ open, onOpenChange, product }: ProductDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!product;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      code: "",
      name: "",
      categoryId: "",
      price: 0,
      initialStock: 0,
      unit: "",
      volume: undefined,
      volumeUnit: "",
      origin: "",
      branchId: "",
      detail: "",
      showOnApp: false,
      productType: "trading",
    },
  });

  useEffect(() => {
    if (product) {
      reset({
        code: product.code,
        name: product.name,
        categoryId: product.categoryId || "",
        price: product.price,
        initialStock: product.initialStock || 0,
        unit: product.unit || "",
        volume: product.volume || undefined,
        volumeUnit: product.volumeUnit || "",
        origin: product.origin || "",
        branchId: product.branchId || "",
        detail: product.detail || "",
        showOnApp: product.showOnApp || false,
        productType: (product.productType as "trading" | "consumption") || "trading",
      });
    } else {
      reset({
        code: "",
        name: "",
        categoryId: "",
        price: 0,
        initialStock: 0,
        unit: "",
        volume: undefined,
        volumeUnit: "",
        origin: "",
        branchId: "",
        detail: "",
        showOnApp: false,
        productType: "trading",
      });
    }
  }, [product, reset]);

  const { data: categoriesData } = useQuery({
    queryKey: queryKeys.productCategories.all,
    queryFn: async () => {
      const res = await fetch("/api/supabase/product-categories");
      const json = await res.json();
      // Supabase API returns { ok, data: [...] }
      return json.data;
    },
  });

  const { data: branchesData } = useQuery({
    queryKey: ["product-dialog-branches"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/branches");
      const json = await res.json();
      return json.data || [];
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const url = isEdit
        ? `/api/supabase/products/${product!.id}`
        : "/api/supabase/products";
      const method = isEdit ? "PUT" : "POST";
      // Convert camelCase form fields to snake_case for the Supabase API.
      const payload = {
        code: data.code,
        name: data.name,
        category_id: data.categoryId || null,
        price: data.price,
        initial_stock: data.initialStock ?? 0,
        unit: data.unit || null,
        volume: data.volume,
        volume_unit: data.volumeUnit || null,
        origin: data.origin || null,
        branch_id: data.branchId || null,
        detail: data.detail || null,
        show_on_app: data.showOnApp ?? false,
        product_type: data.productType || "trading",
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      onOpenChange(false);
    },
  });

  const onSubmit = (data: ProductFormData) => {
    console.log("[product-dialog] onSubmit called", JSON.stringify(data));
    mutation.mutate(data);
  };

  const categories = categoriesData || [];
  const branches = branchesData || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b sticky top-0 bg-white z-10">
          <DialogTitle className="text-lg font-semibold">
            {isEdit ? "Sửa sản phẩm" : "Thêm sản phẩm"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(onSubmit, (errors) => {
            console.log("[product-dialog] validation errors", JSON.stringify(errors));
          })();
        }}>
          <div
            className="px-6 py-4 overflow-y-auto"
            style={{
              maxHeight: "calc(80vh - 120px)",
              scrollbarWidth: "thin",
              scrollbarColor: "#d1d5db #f3f4f6",
            }}
          >
            <div className="space-y-4">
              {/* 1. Mã sản phẩm */}
              <div>
                <Label htmlFor="code">Mã sản phẩm</Label>
                <Input
                  id="code"
                  placeholder="Nhập mã sản phẩm"
                  {...register("code")}
                />
                {errors.code && (
                  <p className="text-red-500 text-xs mt-1">{errors.code.message}</p>
                )}
              </div>

              {/* 2. Tên sản phẩm (required) */}
              <div>
                <Label htmlFor="name">
                  Tên sản phẩm <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="VD: Sunsilk-01"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
                )}
              </div>

              {/* 3. Nhóm sản phẩm (required) + Loại sản phẩm */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="categoryId">
                    Nhóm sản phẩm <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={watch("categoryId") || ""}
                    onValueChange={(value) => setValue("categoryId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat: { id: string; name: string }) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.categoryId && (
                    <p className="text-red-500 text-xs mt-1">{errors.categoryId.message}</p>
                  )}
                </div>
                <div>
                  <Label>Loại sản phẩm</Label>
                  <Select
                    value={watch("productType") || "trading"}
                    onValueChange={(value) => setValue("productType", value as "trading" | "consumption")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trading">Sản phẩm kinh doanh</SelectItem>
                      <SelectItem value="consumption">Sản phẩm tiêu thụ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 4. Giá bán (required) */}
              <div>
                <Label htmlFor="price">
                  Giá bán <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="price"
                  type="number"
                  placeholder="Nhập giá bán"
                  {...register("price", { valueAsNumber: true })}
                />
                {errors.price && (
                  <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>
                )}
              </div>

              {/* 5. Tồn kho ban đầu */}
              <div>
                <Label htmlFor="initialStock">Tồn kho ban đầu</Label>
                <Input
                  id="initialStock"
                  type="number"
                  placeholder="Nhập số lượng"
                  {...register("initialStock", { valueAsNumber: true })}
                />
              </div>

              {/* 6. Đơn vị */}
              <div>
                <Label htmlFor="unit">Đơn vị</Label>
                <Select
                  value={watch("unit") || ""}
                  onValueChange={(value) => setValue("unit", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ProductUnit).map(([key, value]) => (
                      <SelectItem key={key} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 7. Dung tích */}
              <div>
                <Label htmlFor="volume">Dung tích</Label>
                <div className="flex gap-2">
                  <Input
                    id="volume"
                    type="number"
                    placeholder="Nhập dung tích"
                    className="flex-1"
                    {...register("volume", { valueAsNumber: true })}
                  />
                  <Select
                    value={watch("volumeUnit") || ""}
                    onValueChange={(value) => setValue("volumeUnit", value)}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue placeholder="ml" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ProductVolumeUnit).map(([key, value]) => (
                        <SelectItem key={key} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 8. Xuất xứ */}
              <div>
                <Label htmlFor="origin">Xuất xứ</Label>
                <Input
                  id="origin"
                  placeholder="VD: Level Up - VN"
                  {...register("origin")}
                />
              </div>

              {/* 9. Chi nhánh (required) */}
              <div>
                <Label htmlFor="branchId">
                  Chi nhánh <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={watch("branchId") || ""}
                  onValueChange={(value) => setValue("branchId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn chi nhánh" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch: { id: string; name: string }) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.branchId && (
                  <p className="text-red-500 text-xs mt-1">{errors.branchId.message}</p>
                )}
              </div>

              {/* 10. Thông tin chi tiết */}
              <div>
                <Label htmlFor="detail">Thông tin chi tiết</Label>
                <textarea
                  id="detail"
                  placeholder="Nhập thông tin chi tiết"
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  {...register("detail")}
                />
              </div>

              {/* 11. Hiển thị trên app khách hàng */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="showOnApp"
                  checked={watch("showOnApp") || false}
                  onCheckedChange={(checked: boolean) => setValue("showOnApp", checked)}
                />
                <Label htmlFor="showOnApp" className="cursor-pointer">
                  Hiển thị trên app khách hàng
                </Label>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t sticky bottom-0 bg-white flex justify-end gap-2">
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
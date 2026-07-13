"use client";

import { useState, forwardRef, useImperativeHandle } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { queryKeys } from "@/lib/query-keys";
import { ProductDialog } from "./product-dialog";

interface Product {
  id: string;
  code: string;
  name: string;
  price: number;
  categoryId?: string | null;
  category?: { id?: string; name: string } | null;
  volume?: number | null;
  volumeUnit?: string | null;
  origin?: string | null;
  active: boolean;
  branchId?: string | null;
  detail?: string | null;
  showOnApp?: boolean | null;
  initialStock?: number | null;
  unit?: string | null;
  productType?: string | null;
}

// Supabase returns rows with snake_case fields and joined tables under their
// table names (`product_categories`, `branches`). Map to the camelCase shape
// the frontend expects. Be defensive: also accept `category` / `branch` if
// the API ever aliases them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProduct(row: any): Product {
  const category = row.category ?? row.product_categories;
  const branch = row.branch ?? row.branches;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    price: Number(row.price ?? 0),
    categoryId: (row.category_id as string | null) ?? (category?.id as string | null) ?? null,
    category: category ? { id: category.id, name: category.name } : null,
    volume: row.volume ?? null,
    volumeUnit: row.volume_unit ?? null,
    origin: row.origin ?? null,
    active: Boolean(row.active),
    branchId: (row.branch_id as string | null) ?? (branch?.id as string | null) ?? null,
    detail: row.detail ?? null,
    showOnApp: row.show_on_app ?? null,
    initialStock: row.initial_stock ?? null,
    unit: row.unit ?? null,
    productType: row.product_type ?? "trading",
  };
}

export interface ProductListRef {
  openCreateDialog: () => void;
}

interface ProductListProps {
  search: string;
  categoryId: string;
  availability: string;
  visibleColumns?: Record<string, boolean>;
  onEditCategory?: (categoryId: string) => void;
}

export const ProductList = forwardRef<ProductListRef, ProductListProps>(
  ({ search, categoryId, availability, visibleColumns, onEditCategory }, ref) => {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  useImperativeHandle(ref, () => ({
    openCreateDialog: () => {
      setEditingProduct(null);
      setDialogOpen(true);
    },
  }));

  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.products.list({ search, categoryId, availability }), "page", page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      if (search) params.set("search", search);
      if (categoryId) params.set("category_id", categoryId);
      if (availability === "available") params.set("active", "true");
      else if (availability === "unavailable") params.set("active", "false");
      const res = await fetch(`/api/supabase/products?${params.toString()}`);
      const json = await res.json();
      return {
        data: (json.data as Product[]) || [],
        total: json.pagination?.total ?? 0,
        totalPages: json.pagination?.totalPages ?? 1,
      };
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, currentActive }: { id: string; currentActive: boolean }) => {
      const res = await fetch(`/api/supabase/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !currentActive }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });

  const products: Product[] = (data?.data || []).map(mapProduct);
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  // Column visibility (all visible by default if not provided).
  const isColVisible = (key: string) => visibleColumns?.[key] !== false;
  // No more action column — all columns are data columns now.
  const visibleColCount = ["stt", "code", "name", "price", "category", "volume", "origin", "active"].filter(
    (k) => isColVisible(k)
  ).length;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price);
  };

  const formatVolume = (volume?: number | null, unit?: string | null) => {
    if (!volume) return "-";
    return `${volume} ${unit || ""}`;
  };

  if (isLoading) {
    return <div className="p-4 text-center">Đang tải...</div>;
  }

  return (
    <div className="bg-white rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              {isColVisible("stt") && <th className="px-4 py-3 text-left font-medium text-gray-700 w-12">STT</th>}
              {isColVisible("code") && <th className="px-4 py-3 text-left font-medium text-gray-700">Mã sản phẩm</th>}
              {isColVisible("name") && <th className="px-4 py-3 text-left font-medium text-gray-700">Tên sản phẩm</th>}
              {isColVisible("price") && <th className="px-4 py-3 text-left font-medium text-gray-700">Giá bán</th>}
              {isColVisible("category") && <th className="px-4 py-3 text-left font-medium text-gray-700">Nhóm sản phẩm</th>}
              {isColVisible("volume") && <th className="px-4 py-3 text-left font-medium text-gray-700">Dung tích</th>}
              {isColVisible("origin") && <th className="px-4 py-3 text-left font-medium text-gray-700">Xuất xứ</th>}
              {isColVisible("active") && <th className="px-4 py-3 text-left font-medium text-gray-700">Sẵn sàng bán</th>}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={Math.max(visibleColCount, 1)} className="px-4 py-8 text-center text-gray-500">
                  Không có sản phẩm nào
                </td>
              </tr>
            ) : (
              products.map((product, index) => (
                <tr key={product.id} className="border-b hover:bg-gray-50">
                  {isColVisible("stt") && <td className="px-4 py-3 text-gray-500">{(page - 1) * pageSize + index + 1}</td>}
                  {isColVisible("code") && <td className="px-4 py-3 font-mono text-gray-900">{product.code}</td>}
                  {isColVisible("name") && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          setEditingProduct(product);
                          setDialogOpen(true);
                        }}
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline text-left"
                      >
                        {product.name}
                      </button>
                    </td>
                  )}
                  {isColVisible("price") && (
                    <td className="px-4 py-3 text-gray-900">
                      {formatPrice(product.price)} VND
                    </td>
                  )}
                  {isColVisible("category") && (
                    <td className="px-4 py-3">
                      {product.categoryId && product.category?.name && onEditCategory ? (
                        <button
                          onClick={() => onEditCategory(product.categoryId!)}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline text-left"
                        >
                          {product.category.name}
                        </button>
                      ) : (
                        <span className="text-gray-700">{product.category?.name || "-"}</span>
                      )}
                    </td>
                  )}
                  {isColVisible("volume") && (
                    <td className="px-4 py-3 text-gray-700">
                      {formatVolume(product.volume, product.volumeUnit)}
                    </td>
                  )}
                  {isColVisible("origin") && (
                    <td className="px-4 py-3 text-gray-700">
                      {product.origin || "-"}
                    </td>
                  )}
                  {isColVisible("active") && (
                    <td className="px-4 py-3">
                      <Switch
                        checked={product.active}
                        onCheckedChange={() =>
                          toggleMutation.mutate({
                            id: product.id,
                            currentActive: product.active,
                          })
                        }
                      />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination — 25 products per page */}
      {total > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-sm text-gray-500">
            Hiển thị {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} trên tổng số {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-700">
              Trang {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {dialogOpen && (
        <ProductDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          product={editingProduct}
        />
      )}
    </div>
  );
});

ProductList.displayName = "ProductList";

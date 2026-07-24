"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { queryKeys } from "@/lib/query-keys";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

// Column definitions for the visibility toggle.
// The Actions column (MoreHorizontal) is always visible and not listed here.
const AVAILABLE_COLUMN_DEFS: ColumnDef[] = [
  { key: "code", label: "Mã sản phẩm" },
  { key: "name", label: "Tên sản phẩm" },
  { key: "price", label: "Giá bán" },
  { key: "stock", label: "Số lượng" },
  { key: "volume", label: "Dung tích" },
];

interface Product {
  id: string;
  code: string | null;
  name: string;
  price: number;
  stock: number;
  unit: string | null;
  volume: number | null;
  volumeUnit: string | null;
  detail: string | null;
  category: { name: string } | null;
}

interface WarehouseAvailableTabProps {
  search: string;
  categoryId: string;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
}

export function WarehouseAvailableTab({
  search,
  categoryId,
  onSearchChange,
  onCategoryChange,
}: WarehouseAvailableTabProps) {
  const [localSearch, setLocalSearch] = useState(search);
  const [page, setPage] = useState(1);
  const limit = 20;
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(AVAILABLE_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.warehouse.list({
      tab: "available",
      search,
      categoryId,
      page,
      limit,
    }),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryId) params.set("category_id", categoryId);
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await fetch(`/api/supabase/products?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const rows = Array.isArray(json.data) ? json.data : [];
      const items: Product[] = rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        code: (row.code as string | null) ?? null,
        name: String(row.name ?? ""),
        price: Number(row.price ?? 0),
        stock: Number(row.stock ?? 0),
        unit: (row.unit as string | null) ?? null,
        volume: (row.volume as number | null) ?? null,
        volumeUnit: (row.volume_unit as string | null) ?? null,
        detail: (row.detail as string | null) ?? null,
        category: (row.product_categories as { name?: string } | null) ?? null,
      }));
      const total = Number(json.pagination?.total ?? items.length);
      return { items, total, page, limit };
    },
  });

  const { data: categoriesData } = useQuery({
    queryKey: queryKeys.productCategories.list(),
    queryFn: async () => {
      const res = await fetch("/api/supabase/product-categories");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return Array.isArray(json.data) ? json.data : [];
    },
  });

  const categories: Array<{ id: string; name: string }> = categoriesData || [];

  const items: Product[] = data?.items || [];
  const total = data?.total || 0;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price);
  };

  const formatVolume = (volume: number | null, volumeUnit: string | null) => {
    if (!volume || !volumeUnit) return "-";
    return `${new Intl.NumberFormat("vi-VN").format(volume)} ${volumeUnit}`;
  };

  const handleSearch = () => {
    onSearchChange(localSearch);
    setPage(1);
  };

  const isColVisible = (key: string) => visibleColumns[key] !== false;
  const visibleColCount =
    1 + // actions column always visible
    ["code", "name", "price", "stock", "volume"].filter((k) => isColVisible(k)).length;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex gap-2">
        <Input
          placeholder="Tìm kiếm..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="max-w-xs"
        />
        <Select value={categoryId} onValueChange={onCategoryChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Lọc theo nhóm" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ColumnToggle
          columnDefs={AVAILABLE_COLUMN_DEFS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {isColVisible("code") && <TableHead>Mã sản phẩm</TableHead>}
              {isColVisible("name") && <TableHead>Tên sản phẩm</TableHead>}
              {isColVisible("price") && <TableHead>Giá bán</TableHead>}
              {isColVisible("stock") && <TableHead>Số lượng</TableHead>}
              {isColVisible("volume") && <TableHead>Dung tích</TableHead>}
              <TableHead className="w-16">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={visibleColCount} className="text-center py-8">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColCount} className="text-center py-8">
                  Không có dữ liệu
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  {isColVisible("code") && (
                    <TableCell className="font-medium">
                      {item.code || "-"}
                    </TableCell>
                  )}
                  {isColVisible("name") && (
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      {item.detail && (
                        <div className="text-sm text-gray-500">{item.detail}</div>
                      )}
                    </TableCell>
                  )}
                  {isColVisible("price") && <TableCell>{formatPrice(item.price)}</TableCell>}
                  {isColVisible("stock") && (
                    <TableCell>
                      {item.stock} {item.unit || "Gói"}
                    </TableCell>
                  )}
                  {isColVisible("volume") && (
                    <TableCell>
                      {formatVolume(item.volume, item.volumeUnit)}
                    </TableCell>
                  )}
                  <TableCell>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <div>
            Hiển thị từ {(page - 1) * limit + 1} đến{" "}
            {Math.min(page * limit, total)} trên tổng số {total}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              {"<"}
            </Button>
            <span>{page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * limit >= total}
            >
              {">"}
            </Button>
            <Select
              value={String(limit)}
              onValueChange={() => {}}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
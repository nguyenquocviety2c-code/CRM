"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { queryKeys } from "@/lib/query-keys";
import { WarehouseTab } from "@/lib/constants";
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

interface WarehouseListProps {
  tab: WarehouseTab;
  search: string;
  categoryId: string;
}

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

export function WarehouseList({ tab, search, categoryId }: WarehouseListProps) {
  const [localSearch, setLocalSearch] = useState(search);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.warehouse.list({ tab, search, categoryId }),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryId) params.set("category_id", categoryId);
      params.set("limit", "50");

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
      return { items, total, page: 1, limit: 50 };
    },
  });

  const items: Product[] = data?.items || [];
  const total = data?.total || 0;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price);
  };

  const formatVolume = (volume: number | null, volumeUnit: string | null) => {
    if (!volume || !volumeUnit) return "0 ml";
    return `${new Intl.NumberFormat("vi-VN").format(volume)} ${volumeUnit}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Tìm kiếm..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={categoryId} onValueChange={() => {}}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Lọc theo nhóm" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã sản phẩm</TableHead>
              <TableHead>Tên sản phẩm</TableHead>
              <TableHead>Giá bán</TableHead>
              <TableHead>Số lượng</TableHead>
              <TableHead>Dung tích</TableHead>
              <TableHead className="w-16">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Không có dữ liệu
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.code || "-"}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    {item.detail && (
                      <div className="text-sm text-gray-500">{item.detail}</div>
                    )}
                  </TableCell>
                  <TableCell>{formatPrice(item.price)}</TableCell>
                  <TableCell>
                    {item.stock} {item.unit || "Gói"}
                  </TableCell>
                  <TableCell>
                    {formatVolume(item.volume, item.volumeUnit)}
                  </TableCell>
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

      {total > 0 && (
        <div className="text-sm text-gray-500">
          Hiển thị {items.length} / {total} sản phẩm
        </div>
      )}
    </div>
  );
}
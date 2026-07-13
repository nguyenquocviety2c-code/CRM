"use client";

import { useMemo, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PackageList } from "@/components/features/product-service/package-list";
import { usePackageStore } from "@/stores/package-store";
import { BranchSelector } from "@/components/layout/branch-selector";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

// Column definitions for the visibility toggle.
// Package list has no separate Actions column, so all columns are toggleable.
const PACKAGE_COLUMN_DEFS: ColumnDef[] = [
  { key: "name", label: "Tên gói dịch vụ" },
  { key: "code", label: "Mã gói" },
  { key: "discountPrice", label: "Giá khuyến mãi" },
  { key: "totalPrice", label: "Giá gói" },
  { key: "active", label: "Sẵn sàng bán" },
];

export default function PackagePage() {
  const {
    items,
    search,
    categoryFilter,
    page,
    pageSize,
    setSearch,
    setCategoryFilter,
    setPage,
    setPageSize,
    toggleActive,
    fetchItems,
  } = usePackageStore();

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(PACKAGE_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  // Fetch package categories for the filter dropdown.
  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/supabase/package-categories");
        const result = await response.json();
        if (result.ok) {
          const rows = Array.isArray(result.data) ? result.data : [];
          setCategories(
            rows.map((c: Record<string, unknown>) => ({
              id: String(c.id),
              name: String(c.name),
            }))
          );
        }
      } catch (error) {
        console.error("Error fetching package categories:", error);
      }
    })();
  }, []);

  // Fetch packages whenever search or category filter changes.
  useEffect(() => {
    fetchItems();
  }, [fetchItems, search, categoryFilter]);

  const filteredItems = useMemo(() => {
    let result = [...items];

    if (search) {
      const term = search.toLowerCase();
      result = result.filter((item) =>
        item.name.toLowerCase().includes(term)
      );
    }

    if (categoryFilter !== "all") {
      result = result.filter((item) => item.categoryId === categoryFilter);
    }

    return result;
  }, [items, search, categoryFilter]);

  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const paginatedItems = filteredItems.slice(start, start + pageSize);

  const from = total === 0 ? 0 : start + 1;
  const to = Math.min(start + pageSize, total);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">
          Danh sách gói dịch vụ
        </h1>
        <BranchSelector />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Tìm kiếm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Lọc theo nhóm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả nhóm</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ColumnToggle
            columnDefs={PACKAGE_COLUMN_DEFS}
            visibleColumns={visibleColumns}
            onToggleColumn={toggleColumn}
          />
        </div>
      </div>

      {/* Table */}
      <PackageList items={paginatedItems} onToggleActive={toggleActive} visibleColumns={visibleColumns} />

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between bg-white p-3 rounded-lg border">
          <div className="text-sm text-gray-600">
            Hiển thị từ {from} đến {to} trên tổng số {total}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              Trước
            </Button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  variant={p === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPage(p)}
                  className={
                    p === page
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : ""
                  }
                >
                  {p}
                </Button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
            >
              Sau
            </Button>
          </div>

          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v))}
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
      )}
    </div>
  );
}
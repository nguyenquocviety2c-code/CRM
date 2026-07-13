"use client";

import { useMemo, useEffect } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PackageCategoryList } from "@/components/features/product-service/package-category-list";
import { PackageCategoryDialog } from "@/components/features/product-service/package-category-dialog";
import { PackageCategoryDeleteDialog } from "@/components/features/product-service/package-category-delete-dialog";
import { usePackageCategoryStore } from "@/stores/package-category-store";
import { BranchSelector } from "@/components/layout/branch-selector";

export default function PackageCategoriesPage() {
  const {
    items,
    search,
    page,
    pageSize,
    setSearch,
    setPage,
    setPageSize,
    openDialog,
    openDeleteConfirm,
    fetchItems,
  } = usePackageCategoryStore();

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const term = search.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(term));
  }, [items, search]);

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
          Nhóm gói dịch vụ
        </h1>
        <div className="flex items-center gap-2">
          <BranchSelector />
          <Button
            onClick={() => openDialog("create")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Tạo mới
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Tìm kiếm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <PackageCategoryList
        items={paginatedItems}
        onEdit={(id) => openDialog("edit", id)}
        onDelete={(id, name) => openDeleteConfirm(id, name)}
      />

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

      {/* Dialogs */}
      <PackageCategoryDialog />
      <PackageCategoryDeleteDialog />
    </div>
  );
}

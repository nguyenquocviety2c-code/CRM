"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, FileSpreadsheet, ChevronDown, Package, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectValue, SelectTrigger } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProductServiceSidebar } from "@/components/features/product-service/product-service-sidebar";
import { ProductList } from "@/components/features/product-service/product-list";
import type { ProductListRef } from "@/components/features/product-service/product-list";
import { ProductCategoryDialog } from "@/components/features/product-service/product-category-dialog";
import { BranchSelector } from "@/components/layout/branch-selector";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

// Column definitions for the visibility toggle.
// No separate Actions column — the Tên sản phẩm + Nhóm cells are clickable
// (blue text) to open their respective edit dialogs.
const PRODUCT_COLUMN_DEFS: ColumnDef[] = [
  { key: "stt", label: "STT" },
  { key: "code", label: "Mã sản phẩm" },
  { key: "name", label: "Tên sản phẩm" },
  { key: "price", label: "Giá bán" },
  { key: "category", label: "Nhóm sản phẩm" },
  { key: "volume", label: "Dung tích" },
  { key: "origin", label: "Xuất xứ" },
  { key: "active", label: "Sẵn sàng bán" },
];

export default function ProductPage() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [availability, setAvailability] = useState("");
  const productListRef = useRef<ProductListRef>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(PRODUCT_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  // Product category dialog state (create + edit).
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(null);

  // Fetch real product categories for the "Lọc theo nhóm" dropdown.
  const { data: categories } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["product-categories-for-filter"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/product-categories");
      const json = await res.json();
      if (!json.ok) return [];
      return (json.data as Array<{ id: string; name: string }>) || [];
    },
  });

  const handleEditCategory = (catId: string) => {
    const cat = (categories || []).find((c) => c.id === catId);
    if (cat) {
      setEditingCategory(cat);
      setCategoryDialogOpen(true);
    }
  };

  const handleCreateCategory = () => {
    setEditingCategory(null);
    setCategoryDialogOpen(true);
  };

  const handleCreateProduct = () => {
    productListRef.current?.openCreateDialog();
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6 bg-gray-50 min-h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">QUẢN LÝ SẢN PHẨM</p>
              <h1 className="text-2xl font-bold text-gray-900">Danh sách sản phẩm</h1>
            </div>
            <div className="flex items-center gap-2">
              <BranchSelector />
              <Button variant="outline" size="sm">
                <FileSpreadsheet className="h-4 w-4 mr-1" />
                Xuất excel
              </Button>
              {/* Tạo mới dropdown — 2 options: Nhóm sản phẩm / Sản phẩm */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Tạo mới
                    <ChevronDown className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleCreateCategory}>
                    <Tag className="h-4 w-4 mr-2" />
                    Nhóm sản phẩm
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCreateProduct}>
                    <Package className="h-4 w-4 mr-2" />
                    Sản phẩm
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Tìm kiếm..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Lọc theo nhóm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả nhóm</SelectItem>
              {(categories || []).map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={availability} onValueChange={setAvailability}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="available">Sẵn sàng</SelectItem>
              <SelectItem value="unavailable">Không sẵn sàng</SelectItem>
            </SelectContent>
          </Select>
          <ColumnToggle
            columnDefs={PRODUCT_COLUMN_DEFS}
            visibleColumns={visibleColumns}
            onToggleColumn={toggleColumn}
          />
        </div>

        {/* Product List */}
        <ProductList
          ref={productListRef}
          search={search}
          categoryId={categoryId === "all" ? "" : categoryId}
          availability={availability}
          visibleColumns={visibleColumns}
          onEditCategory={handleEditCategory}
        />
      </div>

      {/* Product Category Dialog (create / edit category) */}
      <ProductCategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        category={editingCategory}
      />
    </div>
  );
}

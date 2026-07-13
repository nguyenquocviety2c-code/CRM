"use client";

import { useCashFundStore, useCashFundCategories } from "@/stores/cash-fund-store";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FilterBar() {
  const {
    search,
    setSearch,
    filterType,
    setFilterType,
    filterCategoryId,
    setFilterCategoryId,
  } = useCashFundStore();
  const categories = useCashFundCategories();

  const tabs: { label: string; value: "all" | "revenue" | "expense" }[] = [
    { label: "TẤT CẢ", value: "all" },
    { label: "THU", value: "revenue" },
    { label: "CHI", value: "expense" },
  ];

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <Input
        placeholder="Tìm kiếm..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-64"
      />

      <div className="flex items-center gap-1 border rounded-md p-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilterType(tab.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              filterType === tab.value
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Select
        value={filterCategoryId}
        onValueChange={(value) => setFilterCategoryId(value)}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="Chọn danh mục" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả danh mục</SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat.id} value={cat.id}>
              {cat.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
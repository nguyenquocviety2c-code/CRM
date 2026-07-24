"use client";

import { useState, useEffect } from "react";
import { Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/query-keys";
import { useCustomerCareStore } from "@/stores/customer-care-store";
import { CustomerSetList } from "@/components/features/customer-care/customer-set-list";
import { CustomerSetDialog } from "@/components/features/customer-care/customer-set-dialog";
import { CustomerSetDeleteDialog } from "@/components/features/customer-care/customer-set-delete-dialog";
import { BranchSelector } from "@/components/layout/branch-selector";

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export default function CustomerCarePage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const debouncedSearch = useDebounce(search, 300);

  const {
    dialogOpen,
    selectedCustomerSet,
    deleteDialogOpen,
    deletingCustomerSet,
    openCreateDialog,
    openEditDialog,
    closeDialog,
    openDeleteDialog,
    closeDeleteDialog,
  } = useCustomerCareStore();

  const { data, isLoading } = useQuery<{
    customerSets: Array<{
      id: string;
      name: string;
      note: string | null;
      autoUpdate: boolean;
      createdAt: string;
      updatedAt: string;
      conditions: Array<{
        id: string;
        customerSetId: string;
        conditionType: string;
        conditionValue: string | null;
      }>;
    }>;
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: queryKeys.customerCare.customerSets.list({
      search: debouncedSearch,
      page,
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        search: debouncedSearch,
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/supabase/customer-sets?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to fetch customer sets");
      }
      return json.data || { customerSets: [], total: 0, page, limit };
    },
    placeholderData: {
      customerSets: [],
      total: 0,
      page: 1,
      limit: 20,
    },
  });

  const customerSets = data?.customerSets || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">Tập khách hàng</h1>
        <div className="flex items-center gap-2">
          <BranchSelector />
          <Button
            onClick={openCreateDialog}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Tạo mới
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 pb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6">
        <div className="rounded-lg border bg-white">
          <CustomerSetList
            data={customerSets}
            isLoading={isLoading}
            onEdit={openEditDialog}
            onDelete={openDeleteDialog}
          />
        </div>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-4 flex items-center justify-between px-6 py-4">
          <p className="text-sm text-gray-500">
            Hiển thị {(page - 1) * limit + 1}-
            {Math.min(page * limit, total)} trên tổng {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Sau
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CustomerSetDialog
        open={dialogOpen}
        onClose={closeDialog}
        customerSet={selectedCustomerSet}
      />
      <CustomerSetDeleteDialog
        open={deleteDialogOpen}
        onClose={closeDeleteDialog}
        customerSet={deletingCustomerSet}
      />
    </div>
  );
}
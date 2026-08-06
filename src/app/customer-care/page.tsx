"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Search, ListChecks, ChevronDown, ChevronLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/query-keys";
import { useCustomerCareStore } from "@/stores/customer-care-store";
import { CustomerSetList } from "@/components/features/customer-care/customer-set-list";
import { CustomerSetDialog } from "@/components/features/customer-care/customer-set-dialog";
import { CustomerSetDeleteDialog } from "@/components/features/customer-care/customer-set-delete-dialog";
import { CustomerSetMembersView } from "@/components/features/customer-care/customer-set-members-view";
import { renderLogo } from "@/lib/customer-set-logos";
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
  // The customer set currently being viewed in the members area (null =
  // show the customer-sets list table). Set when the cashier clicks a set
  // name or picks one from the dropdown next to the search box.
  const [viewSet, setViewSet] = useState<import("@/stores/customer-care-store").CustomerSet | null>(null);
  // Dropdown (popover) showing the list of customer sets — toggled by the
  // button to the right of the search box.
  const [setDropdownOpen, setSetDropdownOpen] = useState(false);
  const setDropdownRef = useRef<HTMLDivElement>(null);

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

  // Fetch ALL customer sets (no search/pagination) for the dropdown button —
  // so the cashier can pick any set regardless of the current search filter.
  const { data: allSetsData } = useQuery<{
    customerSets: Array<import("@/stores/customer-care-store").CustomerSet>;
  }>({
    queryKey: ["customer-care-all-sets"],
    queryFn: async () => {
      const res = await fetch(`/api/supabase/customer-sets?limit=500`);
      const json = await res.json();
      if (!json.ok) return { customerSets: [] };
      return { customerSets: json.data?.customerSets || [] };
    },
  });
  const allSets = allSetsData?.customerSets || [];

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    if (!setDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (setDropdownRef.current && !setDropdownRef.current.contains(e.target as Node)) {
        setSetDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [setDropdownOpen]);

  return (
    <div className="flex h-full flex-col">
      {/* Header — kept tight (py-1.5) so it sits as close to the "CSKH" label
          in the left sub-sidebar as possible. */}
      <div className="flex items-center justify-between px-6 py-1.5">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-gray-900">Tập khách hàng</h1>
          {/* Back button — only visible after a customer set is selected.
              Clicking it clears the selection and re-shows the customer-sets
              list table. */}
          {viewSet && (
            <button
              type="button"
              onClick={() => setViewSet(null)}
              className="inline-flex w-fit items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              title="Quay lại danh sách tập khách hàng"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Quay lại
            </button>
          )}
        </div>
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

      {/* Body — swaps between the customer-sets list and the members view of
          the selected set, WITHOUT leaving the page (no overlay). */}
      {viewSet ? (
        <CustomerSetMembersView customerSet={viewSet} />
      ) : (
        <>
          {/* Search + set-picker dropdown button */}
          <div className="px-6 pb-4 pt-2">
            <div className="flex max-w-md items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm kiếm..."
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              {/* Set-picker dropdown button — to the RIGHT of the search box.
                  Clicking opens a list of all customer sets; clicking a set opens
                  that set's members view. */}
              <div className="relative" ref={setDropdownRef}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSetDropdownOpen((v) => !v)}
                  className="gap-1.5"
                  title="Chọn tập khách hàng"
                >
                  <ListChecks className="h-4 w-4" />
                  <ChevronDown className="h-3 w-3" />
                </Button>
                {setDropdownOpen && (
                  <div className="absolute right-0 z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border bg-white shadow-lg">
                    {allSets.length === 0 ? (
                      <div className="px-3 py-3 text-center text-xs text-gray-400">
                        Chưa có tập khách hàng nào
                      </div>
                    ) : (
                      allSets.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setViewSet(s);
                            setSetDropdownOpen(false);
                          }}
                          className="flex w-full items-center gap-1.5 border-b px-3 py-2 text-left text-xs hover:bg-emerald-50 last:border-b-0"
                        >
                          {s.logo && renderLogo(s.logo, "h-4 w-4 shrink-0")}
                          <span
                            className="truncate font-semibold uppercase"
                            style={{ color: s.color || undefined }}
                          >
                            {s.name}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
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
                onView={setViewSet}
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
        </>
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

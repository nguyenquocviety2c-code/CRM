"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Download,
  Search,
  Filter,
  Bell,
  Columns3,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/shared/page-header";
import { queryKeys } from "@/lib/query-keys";
import { useCustomerStore, Customer } from "@/stores/customer-store";
import { getCustomerColumns } from "@/components/features/customers/customer-columns";
import { CustomerDialog } from "@/components/features/customers/customer-dialog";
import { CustomerDeleteDialog } from "@/components/features/customers/customer-delete-dialog";
import { CustomerHistoryDialog } from "@/components/features/customers/customer-history-dialog";
import { useAuthStore } from "@/stores/auth-store";
import { useBranchStore } from "@/stores/branch-store";

// Debounce hook — uses useEffect (NOT useMemo) so the cleanup actually runs
// and clears the timeout. The old useMemo version leaked timers on every keystroke.
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface Option {
  id: string;
  name: string;
}

// Column visibility keys — must match the column `key` in customer-columns.tsx.
const COLUMN_KEYS = [
  "code",
  "name",
  "phone",
  "group",
  "source",
  "channel",
  "actions",
] as const;

const COLUMN_LABELS: Record<string, string> = {
  code: "Mã",
  name: "Họ tên",
  phone: "Điện thoại",
  group: "Nhóm",
  source: "Nguồn KH",
  channel: "Kênh liên lạc",
  actions: "Thao tác",
};


export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(COLUMN_KEYS.map((k) => [k, true])) as Record<
        string,
        boolean
      >
  );
  const limit = 20;

  const debouncedSearch = useDebounce(search, 300);
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);

  const {
    dialogOpen,
    selectedCustomer,
    deleteDialogOpen,
    deletingCustomer,
    filterSource,
    filterGroup,
    openCreateDialog,
    openEditDialog,
    closeDialog,
    openDeleteDialog,
    closeDeleteDialog,
    setFilterSource,
    setFilterGroup,
  } = useCustomerStore();

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Fetch sources for dropdown
  const { data: sourcesData } = useQuery({
    queryKey: queryKeys.settings.section("sources"),
    queryFn: async () => {
      const res = await fetch("/api/supabase/customer-sources");
      const json = await res.json();
      return json.data || [];
    },
  });

  // Fetch groups for dropdown
  const { data: groupsData } = useQuery({
    queryKey: queryKeys.settings.section("groups"),
    queryFn: async () => {
      const res = await fetch("/api/supabase/customer-groups");
      const json = await res.json();
      return json.data || [];
    },
  });

  const sources: Option[] = sourcesData || [];
  const groups: Option[] = groupsData || [];

  const { data, isLoading } = useQuery<{
    customers: Customer[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: queryKeys.customers.list({
      search: debouncedSearch,
      page,
      sourceId: filterSource,
      groupId: filterGroup,
      branchId: selectedBranchId || undefined,
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        search: debouncedSearch,
        page: String(page),
        limit: String(limit),
        // Show ALL customers (both "khách cũ" with paid invoices AND "khách mới"
        // who only registered name+phone but haven't paid yet). Walk-in guests
        // (no phone) are already filtered out by the API's default behavior.
      });
      if (filterSource) params.set("sourceId", filterSource);
      if (filterGroup) params.set("groupId", filterGroup);
      if (selectedBranchId) params.set("branch_id", selectedBranchId);
      const res = await fetch(`/api/supabase/customers?${params.toString()}`);
      const json = await res.json();
      return json;
    },
    // Keep previous page's data visible while the next page loads — no blank
    // table during pagination.
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const customers = data?.data || [];
  const total = data?.pagination?.total || 0;
  const totalPages = data?.pagination?.totalPages || Math.ceil(total / limit);

  const columns = getCustomerColumns({
    onEdit: openEditDialog,
    onDelete: openDeleteDialog,
    onViewHistory: (c) => setHistoryCustomer(c),
  });

  // Filter columns by visibility state.
  const visibleCols = columns.filter((c) => visibleColumns[c.key] !== false);

  const handleExport = () => {
    const params = new URLSearchParams({
      search: debouncedSearch,
    });
    if (filterSource) params.set("sourceId", filterSource);
    if (filterGroup) params.set("groupId", filterGroup);
    window.open(`/api/customers/export?${params.toString()}`, "_blank");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <PageHeader title="Khách hàng">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="text-sm">
            <Bell className="mr-2 h-4 w-4" />
            Nhận
          </Button>
          <Button variant="outline" className="text-sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Xuất excel
          </Button>
          <Button
            onClick={openCreateDialog}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Thêm khách hàng
          </Button>
        </div>
      </PageHeader>

      {/* Search & Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
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
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-gray-500" />
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Nhóm</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Nguồn</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>

          {/* Column visibility toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9"
              >
                <Columns3 className="h-4 w-4" />
                Cột
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <div className="px-2 py-1.5 text-xs font-medium text-gray-500">
                Hiển thị cột
              </div>
              {columns.map((col) => (
                <DropdownMenuItem
                  key={col.key}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleColumn(col.key);
                  }}
                  className="cursor-pointer"
                >
                  <Checkbox
                    checked={visibleColumns[col.key] !== false}
                    onCheckedChange={() => toggleColumn(col.key)}
                    className="mr-2 h-4 w-4"
                  />
                  <span className="text-sm">
                    {COLUMN_LABELS[col.key] || col.header}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              {visibleCols.map((col) => (
                <TableHead
                  key={col.key}
                  className={col.className || "text-left font-medium text-gray-500"}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={visibleCols.length}
                  className="py-8 text-center text-gray-500"
                >
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleCols.length}
                  className="py-8 text-center text-gray-500"
                >
                  Không có khách hàng nào
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="border-b hover:bg-gray-50"
                >
                  {visibleCols.map((col) => (
                    <TableCell
                      key={col.key}
                      className={col.className || "text-left"}
                    >
                      {col.render(customer)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-4 flex items-center justify-between">
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
      <CustomerDialog
        open={dialogOpen}
        onClose={closeDialog}
        customer={selectedCustomer}
      />
      <CustomerDeleteDialog
        open={deleteDialogOpen}
        onClose={closeDeleteDialog}
        customer={deletingCustomer}
      />
      <CustomerHistoryDialog
        customer={historyCustomer}
        open={!!historyCustomer}
        onClose={() => setHistoryCustomer(null)}
      />
    </div>
  );
}

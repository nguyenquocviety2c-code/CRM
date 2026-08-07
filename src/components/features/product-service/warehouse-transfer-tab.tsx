"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Trash2, PackageOpen } from "lucide-react";
import { queryKeys } from "@/lib/query-keys";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

// Column definitions for the visibility toggle.
// The Actions column (pencil/trash) is always visible and not listed here.
const TRANSFER_COLUMN_DEFS: ColumnDef[] = [
  { key: "transferDate", label: "Thời gian" },
  { key: "product", label: "Sản phẩm" },
  { key: "createdByEmail", label: "Người tạo" },
  { key: "quantity", label: "Số lượng" },
  { key: "fromBranch", label: "Kho xuất" },
  { key: "toBranch", label: "Kho nhận" },
  { key: "note", label: "Ghi chú" },
  { key: "status", label: "Trạng thái" },
];

interface TransferSlipItem {
  quantity: number;
  product: { name: string };
}

interface TransferSlip {
  id: string;
  transferDate: string;
  createdByEmail: string;
  note: string | null;
  status: string;
  fromBranch: { name: string } | null;
  toBranch: { name: string } | null;
  items: TransferSlipItem[];
}

const TransferStatusLabel: Record<string, string> = {
  in_transit: "Đang chuyển",
  received: "Đã nhận",
  cancelled: "Đã hủy",
};

const TransferStatusBadgeColors: Record<string, { bg: string; text: string }> = {
  in_transit: { bg: "bg-blue-100", text: "text-blue-700" },
  received: { bg: "bg-emerald-100", text: "text-emerald-700" },
  cancelled: { bg: "bg-red-100", text: "text-red-700" },
};

export function WarehouseTransferTab() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(TRANSFER_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.warehouse.transfer.list({
      search,
      categoryId,
      page,
      limit,
    }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("type", "transfer");
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await fetch(`/api/supabase/warehouse?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const rows = Array.isArray(json.data) ? json.data : [];
      const items: TransferSlip[] = rows.map((row: Record<string, unknown>) => {
        const slipItems = Array.isArray(row.slip_items) ? row.slip_items : [];
        const fromBranch = row.from_branch as { name?: string } | null;
        const toBranch = row.to_branch as { name?: string } | null;
        return {
          id: String(row.id),
          transferDate: (row.transfer_date as string) ?? (row.created_at as string) ?? "",
          createdByEmail: (row.created_by as string) ?? "-",
          note: (row.note as string | null) ?? null,
          status: (row.status as string) ?? "in_transit",
          fromBranch: fromBranch ? { name: String(fromBranch.name ?? "-") } : null,
          toBranch: toBranch ? { name: String(toBranch.name ?? "-") } : null,
          items: slipItems.map((it: Record<string, unknown>) => ({
            quantity: Number(it.quantity ?? 0),
            product: { name: String((it.products as { name?: string } | null)?.name ?? "-") },
          })),
        };
      });
      const total = Number(json.pagination?.total ?? items.length);
      return { items, total, page, limit };
    },
  });

  const items: TransferSlip[] = data?.items || [];
  const total = data?.total || 0;

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${hours}:${minutes} ${day}/${month}/${year}`;
  };

  const getTotalQuantity = (slip: TransferSlip) => {
    return slip.items.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getProductNames = (slip: TransferSlip) => {
    return slip.items.map((item) => item.product.name).join(", ");
  };

  const getBadgeStyle = (status: string) => {
    return TransferStatusBadgeColors[status] || TransferStatusBadgeColors.in_transit;
  };

  const isColVisible = (key: string) => visibleColumns[key] !== false;
  const visibleColCount =
    1 + // actions column always visible
    ["transferDate", "product", "createdByEmail", "quantity", "fromBranch", "toBranch", "note", "status"].filter(
      (k) => isColVisible(k)
    ).length;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex gap-2">
        <Input
          placeholder="Tìm kiếm..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Lọc theo nhóm" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
            <SelectItem value="category1">Nhóm 1</SelectItem>
          </SelectContent>
        </Select>
        <ColumnToggle
          columnDefs={TRANSFER_COLUMN_DEFS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {isColVisible("transferDate") && <TableHead>Thời gian</TableHead>}
              <TableHead className="w-24">Hành động</TableHead>
              {isColVisible("product") && <TableHead>Sản phẩm</TableHead>}
              {isColVisible("createdByEmail") && <TableHead>Người tạo</TableHead>}
              {isColVisible("quantity") && <TableHead>Số lượng</TableHead>}
              {isColVisible("fromBranch") && <TableHead>Kho xuất</TableHead>}
              {isColVisible("toBranch") && <TableHead>Kho nhận</TableHead>}
              {isColVisible("note") && <TableHead>Ghi chú</TableHead>}
              {isColVisible("status") && <TableHead>Trạng thái</TableHead>}
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
                <TableCell colSpan={visibleColCount} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <PackageOpen className="h-12 w-12" />
                    <span className="text-lg">Trống</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const badgeStyle = getBadgeStyle(item.status);
                return (
                  <TableRow key={item.id}>
                    {isColVisible("transferDate") && (
                      <TableCell className="max-w-[160px] truncate" title={formatDateTime(item.transferDate)}>
                        {formatDateTime(item.transferDate)}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                    {isColVisible("product") && (
                      <TableCell className="max-w-xs truncate" title={getProductNames(item)}>
                        {getProductNames(item)}
                      </TableCell>
                    )}
                    {isColVisible("createdByEmail") && (
                      <TableCell className="max-w-[180px] truncate" title={item.createdByEmail}>
                        {item.createdByEmail}
                      </TableCell>
                    )}
                    {isColVisible("quantity") && (
                      <TableCell className="max-w-[80px] truncate" title={String(getTotalQuantity(item))}>
                        {getTotalQuantity(item)}
                      </TableCell>
                    )}
                    {isColVisible("fromBranch") && (
                      <TableCell className="max-w-[160px] truncate" title={item.fromBranch?.name || "-"}>
                        {item.fromBranch?.name || "-"}
                      </TableCell>
                    )}
                    {isColVisible("toBranch") && (
                      <TableCell className="max-w-[160px] truncate" title={item.toBranch?.name || "-"}>
                        {item.toBranch?.name || "-"}
                      </TableCell>
                    )}
                    {isColVisible("note") && (
                      <TableCell className="max-w-[200px] truncate" title={item.note || ""}>
                        {item.note || ""}
                      </TableCell>
                    )}
                    {isColVisible("status") && (
                      <TableCell className="max-w-[120px] truncate">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeStyle.bg} ${badgeStyle.text}`}
                        >
                          {TransferStatusLabel[item.status] || item.status}
                        </span>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
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
            <Select value={String(limit)} onValueChange={() => {}}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
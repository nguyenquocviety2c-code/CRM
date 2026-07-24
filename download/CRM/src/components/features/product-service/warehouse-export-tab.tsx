"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
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
const EXPORT_COLUMN_DEFS: ColumnDef[] = [
  { key: "exportDate", label: "Thời gian" },
  { key: "code", label: "Mã phiếu" },
  { key: "exportType", label: "Loại xuất" },
  { key: "quantity", label: "Số lượng" },
  { key: "createdByEmail", label: "Người tạo" },
  { key: "note", label: "Ghi chú" },
];

interface ExportSlipItem {
  quantity: number;
  product: { name: string };
}

interface ExportSlip {
  id: string;
  code: string | null;
  exportDate: string;
  createdByEmail: string;
  note: string | null;
  exportType: string;
  items: ExportSlipItem[];
}

const ExportTypeLabel: Record<string, string> = {
  use: "Xuất sử dụng",
  return: "Trả hàng nhập",
  destroy: "Xuất hủy",
};

const ExportTypeBadgeColors: Record<string, { bg: string; text: string }> = {
  use: { bg: "bg-red-100", text: "text-red-700" },
  return: { bg: "bg-amber-100", text: "text-amber-700" },
  destroy: { bg: "bg-gray-100", text: "text-gray-700" },
};

export function WarehouseExportTab() {
  const [search, setSearch] = useState("");
  const [exportTypeFilter, setExportTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(EXPORT_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.warehouse.export.list({
      search,
      exportType: exportTypeFilter,
      from: fromDate,
      to: toDate,
      page,
      limit,
    }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("type", "export");
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await fetch(`/api/supabase/warehouse?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const rows = Array.isArray(json.data) ? json.data : [];
      const items: ExportSlip[] = rows.map((row: Record<string, unknown>) => {
        const slipItems = Array.isArray(row.slip_items) ? row.slip_items : [];
        return {
          id: String(row.id),
          code: (row.code as string | null) ?? null,
          exportDate: (row.created_at as string) ?? (row.export_date as string) ?? "",
          createdByEmail: (row.created_by as string) ?? "-",
          note: (row.note as string | null) ?? null,
          exportType: (row.type as string) ?? "use",
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

  const items: ExportSlip[] = data?.items || [];
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

  const getTotalQuantity = (slip: ExportSlip) => {
    return slip.items.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getBadgeStyle = (type: string) => {
    return ExportTypeBadgeColors[type] || ExportTypeBadgeColors.use;
  };

  const isColVisible = (key: string) => visibleColumns[key] !== false;
  const visibleColCount =
    1 + // actions column always visible
    ["exportDate", "code", "exportType", "quantity", "createdByEmail", "note"].filter(
      (k) => isColVisible(k)
    ).length;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={exportTypeFilter} onValueChange={setExportTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tìm theo loại xuất kho" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
            <SelectItem value="use">Xuất sử dụng</SelectItem>
            <SelectItem value="return">Trả hàng nhập</SelectItem>
            <SelectItem value="destroy">Xuất hủy</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Tìm theo mã phiếu"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-40"
          />
          <span className="text-gray-500">~</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-40"
          />
        </div>
        <ColumnToggle
          columnDefs={EXPORT_COLUMN_DEFS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {isColVisible("exportDate") && <TableHead>Thời gian</TableHead>}
              {isColVisible("code") && <TableHead>Mã phiếu</TableHead>}
              {isColVisible("exportType") && <TableHead>Loại xuất</TableHead>}
              {isColVisible("quantity") && <TableHead>Số lượng</TableHead>}
              {isColVisible("createdByEmail") && <TableHead>Người tạo</TableHead>}
              {isColVisible("note") && <TableHead>Ghi chú</TableHead>}
              <TableHead className="w-24">Hành động</TableHead>
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
              items.map((item) => {
                const badgeStyle = getBadgeStyle(item.exportType);
                return (
                  <TableRow key={item.id}>
                    {isColVisible("exportDate") && <TableCell>{formatDateTime(item.exportDate)}</TableCell>}
                    {isColVisible("code") && (
                      <TableCell className="font-medium">
                        {item.code || "-"}
                      </TableCell>
                    )}
                    {isColVisible("exportType") && (
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeStyle.bg} ${badgeStyle.text}`}
                        >
                          {ExportTypeLabel[item.exportType] || item.exportType}
                        </span>
                      </TableCell>
                    )}
                    {isColVisible("quantity") && <TableCell>{getTotalQuantity(item)}</TableCell>}
                    {isColVisible("createdByEmail") && <TableCell>{item.createdByEmail}</TableCell>}
                    {isColVisible("note") && <TableCell>{item.note || ""}</TableCell>}
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
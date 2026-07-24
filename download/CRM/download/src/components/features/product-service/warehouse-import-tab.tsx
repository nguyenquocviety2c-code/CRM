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
const IMPORT_COLUMN_DEFS: ColumnDef[] = [
  { key: "importDate", label: "Thời gian" },
  { key: "code", label: "Mã phiếu" },
  { key: "quantity", label: "Số lượng" },
  { key: "createdByEmail", label: "Người tạo" },
  { key: "supplier", label: "Nhà cung cấp" },
  { key: "note", label: "Ghi chú" },
];

interface ImportSlipItem {
  quantity: number;
  product: { name: string };
}

interface ImportSlip {
  id: string;
  code: string | null;
  importDate: string;
  createdByEmail: string;
  note: string | null;
  supplier: { name: string } | null;
  items: ImportSlipItem[];
  totalCost: number;
}

interface WarehouseImportTabProps {
  onOpenPayDebt: () => void;
}

export function WarehouseImportTab({ onOpenPayDebt }: WarehouseImportTabProps) {
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(IMPORT_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.warehouse.import.list({
      search,
      from: fromDate,
      to: toDate,
      page,
      limit,
    }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("type", "import");
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await fetch(`/api/supabase/warehouse?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const rows = Array.isArray(json.data) ? json.data : [];
      const items: ImportSlip[] = rows.map((row: Record<string, unknown>) => {
        const slipItems = Array.isArray(row.slip_items) ? row.slip_items : [];
        return {
          id: String(row.id),
          code: (row.code as string | null) ?? null,
          importDate: (row.created_at as string) ?? (row.import_date as string) ?? "",
          createdByEmail: (row.created_by as string) ?? "-",
          note: (row.note as string | null) ?? null,
          supplier: null,
          items: slipItems.map((it: Record<string, unknown>) => ({
            quantity: Number(it.quantity ?? 0),
            product: { name: String((it.products as { name?: string } | null)?.name ?? "-") },
          })),
          totalCost: Number(row.total_cost ?? 0),
        };
      });
      const total = Number(json.pagination?.total ?? items.length);
      return { items, total, page, limit };
    },
  });

  const items: ImportSlip[] = data?.items || [];
  const total = data?.total || 0;
  const totalDebt = 0;

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${hours}:${minutes} ${day}/${month}/${year}`;
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("vi-VN").format(amount);
  };

  const getTotalQuantity = (slip: ImportSlip) => {
    return slip.items.reduce((sum, item) => sum + item.quantity, 0);
  };

  const isColVisible = (key: string) => visibleColumns[key] !== false;
  const visibleColCount =
    1 + // actions column always visible
    ["importDate", "code", "quantity", "createdByEmail", "supplier", "note"].filter(
      (k) => isColVisible(k)
    ).length;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
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
          columnDefs={IMPORT_COLUMN_DEFS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
        />
        <div className="flex items-center gap-4 ml-auto">
          <span className="text-sm text-gray-500">
            Tổng nợ nhập hàng cần trả:{" "}
            <span className="font-medium">{formatMoney(totalDebt)}đ</span>
          </span>
          <Button onClick={onOpenPayDebt} className="bg-emerald-600 hover:bg-emerald-700">
            Thanh toán nợ
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {isColVisible("importDate") && <TableHead>Thời gian</TableHead>}
              {isColVisible("code") && <TableHead>Mã phiếu</TableHead>}
              {isColVisible("quantity") && <TableHead>Số lượng</TableHead>}
              {isColVisible("createdByEmail") && <TableHead>Người tạo</TableHead>}
              {isColVisible("supplier") && <TableHead>Nhà cung cấp</TableHead>}
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
              items.map((item) => (
                <TableRow key={item.id}>
                  {isColVisible("importDate") && <TableCell>{formatDateTime(item.importDate)}</TableCell>}
                  {isColVisible("code") && (
                    <TableCell className="font-medium">
                      {item.code || "-"}
                    </TableCell>
                  )}
                  {isColVisible("quantity") && <TableCell>{getTotalQuantity(item)}</TableCell>}
                  {isColVisible("createdByEmail") && <TableCell>{item.createdByEmail}</TableCell>}
                  {isColVisible("supplier") && <TableCell>{item.supplier?.name || "-"}</TableCell>}
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
              ))
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
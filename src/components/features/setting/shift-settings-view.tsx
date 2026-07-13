"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  HelpCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useSettingStore,
  ShiftSortField,
  SortDirection,
} from "@/stores/setting-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

// Data columns for the shift table. The sortable fields map 1:1 to the first
// three columns; note the Ghi chú/Mặc định/Trạng thái columns are also listed
// so they can be toggled. The "Hành động" column is always-visible.
const SHIFT_COLUMN_DEFS: ColumnDef[] = [
  { key: "name", label: "Tên ca làm việc" },
  { key: "workTime", label: "Thời gian ca làm việc" },
  { key: "checkTime", label: "Thời gian chấm công" },
  { key: "note", label: "Ghi chú" },
  { key: "isDefault", label: "Mặc định" },
  { key: "status", label: "Trạng thái" },
];

const sortableFields: { field: ShiftSortField; label: string }[] = [
  { field: "name", label: "Tên ca làm việc" },
  { field: "workTime", label: "Thời gian ca làm việc" },
  { field: "checkTime", label: "Thời gian chấm công" },
];

function compareTime(a: string, b: string): number {
  // HH:mm -> minutes
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return toMin(a) - toMin(b);
}

export function ShiftSettingsView() {
  const {
    shiftSearch,
    setShiftSearch,
    shiftSortField,
    shiftSortDir,
    setShiftSort,
    shiftPage,
    shiftPageSize,
    setShiftPage,
    setShiftPageSize,
    openShiftDialog,
    shifts,
    fetchShifts,
    deleteShift,
  } = useSettingStore();
  const { toast } = useToast();
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(SHIFT_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));
  const visibleCols = SHIFT_COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const filteredSorted = useMemo(() => {
    const kw = shiftSearch.trim().toLowerCase();
    const list = shifts.filter((s) => {
      if (!kw) return true;
      return (
        s.name.toLowerCase().includes(kw) ||
        s.note.toLowerCase().includes(kw) ||
        `${s.workStart} - ${s.workEnd}`.includes(kw) ||
        `${s.checkInStart} - ${s.checkInEnd}`.includes(kw)
      );
    });

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (shiftSortField === "name") cmp = a.name.localeCompare(b.name, "vi");
      else if (shiftSortField === "workTime") {
        cmp = compareTime(a.workStart, b.workStart);
        if (cmp === 0) cmp = compareTime(a.workEnd, b.workEnd);
      } else if (shiftSortField === "checkTime") {
        cmp = compareTime(a.checkInStart, b.checkInStart);
        if (cmp === 0) cmp = compareTime(a.checkInEnd, b.checkInEnd);
      }
      return shiftSortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [shifts, shiftSearch, shiftSortField, shiftSortDir]);

  const total = filteredSorted.length;
  const totalPages = Math.max(1, Math.ceil(total / shiftPageSize));
  const currentPage = Math.min(shiftPage, totalPages);
  const startIdx = (currentPage - 1) * shiftPageSize;
  const pageData = filteredSorted.slice(startIdx, startIdx + shiftPageSize);
  const from = total === 0 ? 0 : startIdx + 1;
  const to = Math.min(startIdx + shiftPageSize, total);

  const handleSort = (field: ShiftSortField) => {
    if (shiftSortField === field) {
      const nextDir: SortDirection = shiftSortDir === "asc" ? "desc" : "asc";
      setShiftSort(field, nextDir);
    } else {
      setShiftSort(field, "asc");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const res = await deleteShift(id);
    if (!res.ok) {
      toast({
        title: "Không thể xóa ca làm việc",
        description: res.error || name,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Đã xóa ca làm việc",
      description: name,
      variant: "destructive",
    });
  };

  const SortIcon = ({ field }: { field: ShiftSortField }) => {
    if (shiftSortField !== field)
      return <ChevronsUpDown className="h-3 w-3 text-gray-400" />;
    return shiftSortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-sky-600" />
    ) : (
      <ArrowDown className="h-3 w-3 text-sky-600" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Ca làm việc</h1>
        </div>
        <Button
          className="gap-2 bg-sky-500 text-white hover:bg-sky-600"
          onClick={() => openShiftDialog("create")}
        >
          <Plus className="h-4 w-4" />
          Thêm mới
        </Button>
      </div>

      {/* Search + Cột filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex h-9 w-64 items-center">
          <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-gray-400" />
          <Input
            value={shiftSearch}
            onChange={(e) => setShiftSearch(e.target.value)}
            placeholder="Tìm kiếm..."
            className="h-9 pl-8"
          />
        </div>
        <ColumnToggle
          columnDefs={SHIFT_COLUMN_DEFS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
        />
      </div>

      {/* Shift table */}
      <div className="overflow-hidden rounded-none border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              {visibleCols.map((col) => {
                // The three sortable columns keep their sort affordance.
                const sortable = sortableFields.find((f) => f.field === col.key);
                return (
                  <TableHead
                    key={col.key}
                    className={cn(
                      "h-10 px-4 text-sm font-semibold text-gray-700",
                      sortable && "cursor-pointer select-none"
                    )}
                    onClick={() => sortable && handleSort(sortable.field)}
                  >
                    {sortable ? (
                      <span className="inline-flex items-center gap-1.5">
                        {col.label}
                        <SortIcon field={sortable.field} />
                      </span>
                    ) : col.key === "isDefault" ? (
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <HelpCircle className="h-3 w-3 text-gray-400" />
                      </span>
                    ) : (
                      col.label
                    )}
                  </TableHead>
                );
              })}
              <TableHead className="h-10 px-4 text-right text-sm font-semibold text-gray-700">
                Hành động
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={Math.max(visibleCols.length, 1) + 1}
                  className="py-12 text-center text-sm text-gray-400"
                >
                  Không tìm thấy ca làm việc
                </TableCell>
              </TableRow>
            )}
            {pageData.map((s, idx) => (
              <TableRow
                key={s.id}
                className={cn(
                  "border-b border-gray-100 last:border-0 hover:bg-sky-50/40",
                  idx % 2 === 1 && "bg-gray-50/40"
                )}
              >
                {visibleCols.map((col) => {
                  if (col.key === "name") return (
                    <TableCell key="name" className="px-4 py-3 text-sm font-medium text-gray-800">
                      {s.name}
                    </TableCell>
                  );
                  if (col.key === "workTime") return (
                    <TableCell key="workTime" className="px-4 py-3 text-sm text-gray-700">
                      {s.workStart} - {s.workEnd}
                    </TableCell>
                  );
                  if (col.key === "checkTime") return (
                    <TableCell key="checkTime" className="px-4 py-3 text-sm text-gray-700">
                      {s.checkInStart} - {s.checkInEnd}
                    </TableCell>
                  );
                  if (col.key === "note") return (
                    <TableCell key="note" className="px-4 py-3 text-sm text-gray-500">
                      {s.note || "—"}
                    </TableCell>
                  );
                  if (col.key === "isDefault") return (
                    <TableCell key="isDefault" className="px-4 py-3">
                      <Checkbox checked={s.isDefault} disabled />
                    </TableCell>
                  );
                  if (col.key === "status") return (
                    <TableCell key="status" className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-none px-2 py-0.5 text-xs font-medium",
                          s.status === "active"
                            ? "bg-sky-500 text-white"
                            : "border border-gray-300 bg-gray-50 text-gray-500"
                        )}
                      >
                        {s.status === "active" ? "Đang hoạt động" : "Ngừng hoạt động"}
                      </span>
                    </TableCell>
                  );
                  return null;
                })}
                <TableCell className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openShiftDialog("edit", s.id)}
                      className="flex h-7 items-center gap-1 rounded-none border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      title="Sửa"
                    >
                      <Pencil className="h-3 w-3" />
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id, s.name)}
                      className="flex h-7 items-center gap-1 rounded-none bg-red-500 px-2 text-xs font-medium text-white hover:bg-red-600"
                      title="Xóa"
                    >
                      <Trash2 className="h-3 w-3" />
                      Xóa
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
          <span>
            Hiển thị từ {from} đến {to} trên tổng số {total}
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShiftPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-none border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                title="Trang trước"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-none bg-sky-500 px-2 text-xs font-semibold text-white">
                {currentPage}
              </span>
              <button
                type="button"
                onClick={() => setShiftPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="flex h-7 w-7 items-center justify-center rounded-none border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                title="Trang sau"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <Select
              value={String(shiftPageSize)}
              onValueChange={(v) => setShiftPageSize(Number(v))}
            >
              <SelectTrigger className="h-7 w-[90px] gap-1 text-xs">
                <SelectValue />
                <ChevronDown className="h-3 w-3" />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} / trang
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}

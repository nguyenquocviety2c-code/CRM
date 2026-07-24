"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  StaffStatusOptions,
} from "@/stores/setting-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/stores/branch-store";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

// Data columns for the staff table. The "Hành động" column is always-visible
// (not listed here) — it holds the edit/delete buttons.
const STAFF_COLUMN_DEFS: ColumnDef[] = [
  { key: "name", label: "Tên nhân viên" },
  { key: "phone", label: "Điện thoại" },
  { key: "group", label: "Chức danh" },
  { key: "status", label: "Trạng thái" },
];

export function StaffSettingsView() {
  const {
    searchKeyword,
    setSearchKeyword,
    groupFilter,
    setGroupFilter,
    setStaffView,
    openStaffDialog,
    staff,
    staffGroups,
    fetchStaff,
    fetchStaffGroups,
    deleteStaff,
  } = useSettingStore();
  const { toast } = useToast();
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(STAFF_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));
  const visibleCols = STAFF_COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false);

  useEffect(() => {
    fetchStaff(selectedBranchId ? { branchId: selectedBranchId } : undefined);
    fetchStaffGroups();
  }, [fetchStaff, fetchStaffGroups, selectedBranchId]);

  const filteredStaff = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    return staff.filter((s) => {
      const matchKw = !kw || s.name.toLowerCase().includes(kw) || s.phone.includes(kw);
      const matchGroup = groupFilter === "all" || s.group === groupFilter;
      return matchKw && matchGroup;
    });
  }, [staff, searchKeyword, groupFilter]);

  const handleDelete = async (id: string, name: string) => {
    const res = await deleteStaff(id);
    if (!res.ok) {
      toast({
        title: "Không thể xóa nhân viên",
        description: res.error || name,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Đã xóa nhân viên",
      description: name,
      variant: "destructive",
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Quản lý nhân viên</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setStaffView("groups")}
          >
            <Users className="h-4 w-4" />
            Chức danh
          </Button>
          <Button
            className="gap-2 bg-sky-500 text-white hover:bg-sky-600"
            onClick={() => openStaffDialog("create")}
          >
            <Plus className="h-4 w-4" />
            Tạo mới
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex h-9 w-64 items-center">
          <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-gray-400" />
          <Input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="Tìm kiếm..."
            className="h-9 pl-8"
          />
        </div>
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Tất cả chức danh" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả chức danh</SelectItem>
            {staffGroups.map((g) => (
              <SelectItem key={g.id} value={g.name}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ColumnToggle
          columnDefs={STAFF_COLUMN_DEFS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
        />
      </div>

      {/* Staff table */}
      <div className="overflow-hidden rounded-none border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              {visibleCols.map((col) => (
                <TableHead key={col.key} className="h-10 px-4 text-sm font-semibold text-gray-700">
                  {col.label}
                </TableHead>
              ))}
              <TableHead className="h-10 px-4 text-right text-sm font-semibold text-gray-700">
                Hành động
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStaff.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={Math.max(visibleCols.length, 1) + 1}
                  className="py-12 text-center text-sm text-gray-400"
                >
                  Không tìm thấy nhân viên phù hợp
                </TableCell>
              </TableRow>
            )}
            {filteredStaff.map((s, idx) => {
              const status = StaffStatusOptions.find((o) => o.value === s.status);
              return (
                <TableRow
                  key={s.id}
                  className={cn(
                    "border-b border-gray-100 last:border-0 hover:bg-sky-50/40",
                    idx % 2 === 1 && "bg-gray-50/40"
                  )}
                >
                  {visibleCols.map((col) => {
                    if (col.key === "name") return (
                      <TableCell key="name" className="px-4 py-3">
                        <span className="text-sm font-medium text-sky-600 hover:underline">
                          {s.name}
                        </span>
                      </TableCell>
                    );
                    if (col.key === "phone") return (
                      <TableCell key="phone" className="px-4 py-3 text-sm text-gray-700">
                        {s.phone}
                      </TableCell>
                    );
                    if (col.key === "group") return (
                      <TableCell key="group" className="px-4 py-3 text-sm text-gray-700">
                        {s.group}
                      </TableCell>
                    );
                    if (col.key === "status") return (
                      <TableCell key="status" className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-none border px-2 py-0.5 text-xs font-medium",
                            s.status === "active"
                              ? "border-cyan-400 bg-cyan-50 text-cyan-600"
                              : "border-gray-300 bg-gray-50 text-gray-500"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              s.status === "active" ? "bg-cyan-500" : "bg-gray-400"
                            )}
                          />
                          {status?.label ?? s.status}
                        </span>
                      </TableCell>
                    );
                    return null;
                  })}
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openStaffDialog("edit", s.id)}
                        className="flex h-7 items-center gap-1 rounded-none border border-gray-300 px-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
                        title="Cập nhật"
                      >
                        <Pencil className="h-3 w-3" />
                        Cập nhật
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id, s.name)}
                        className="flex h-7 items-center justify-center rounded-none bg-red-500 px-2 text-white hover:bg-red-600"
                        title="Xóa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSettingStore } from "@/stores/setting-store";
import { cn } from "@/lib/utils";

export function StaffGroupsView() {
  const {
    setStaffView,
    openStaffGroupDialog,
    staffGroups,
    fetchStaffGroups,
  } = useSettingStore();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchStaffGroups();
  }, [fetchStaffGroups]);

  const filtered = staffGroups.filter((g) =>
    g.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setStaffView("list")}
            className="flex h-8 w-8 items-center justify-center rounded-none border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Quay lại"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Chức danh</h1>
        </div>
        <Button
          className="gap-2 bg-sky-500 text-white hover:bg-sky-600"
          onClick={() => openStaffGroupDialog("create")}
        >
          <Plus className="h-4 w-4" />
          Tạo mới
        </Button>
      </div>

      {/* Search */}
      <div className="relative flex h-9 w-64 items-center">
        <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm nhóm..."
          className="h-9 pl-8"
        />
      </div>

      {/* Groups table */}
      <div className="overflow-hidden rounded-none border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead className="h-10 px-4 text-sm font-semibold text-gray-700">
                Tên nhóm
              </TableHead>
              <TableHead className="h-10 px-4 text-right text-sm font-semibold text-gray-700">
                Hành động
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={2}
                  className="py-12 text-center text-sm text-gray-400"
                >
                  Không tìm thấy chức danh
                </TableCell>
              </TableRow>
            )}
            {filtered.map((g) => (
              <TableRow
                key={g.id}
                onClick={() => setSelectedId(g.id)}
                className={cn(
                  "cursor-pointer border-b border-gray-100 last:border-0 hover:bg-sky-50/40",
                  selectedId === g.id && "bg-sky-50"
                )}
              >
                <TableCell className="px-4 py-3 text-sm font-medium text-gray-800">
                  {g.name}
                  {g.isOfficeStaff && (
                    <span className="ml-2 rounded-none bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                      Khối văn phòng
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openStaffGroupDialog("edit", g.id);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-none border border-gray-300 text-gray-600 hover:bg-gray-100 hover:text-gray-800"
                    title="Chỉnh sửa"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CustomerSource {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export function CustomerSourcesView() {
  const { sourceSearch, setSourceSearch, openSourceDialog } = useSettingStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: sources = [], isLoading } = useQuery<CustomerSource[]>({
    queryKey: ["customer-sources"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/customer-sources");
      const json = await res.json();
      if (!json.ok) return [];
      return json.data as CustomerSource[];
    },
  });

  const filtered = useMemo(() => {
    const kw = sourceSearch.trim().toLowerCase();
    if (!kw) return sources;
    return sources.filter((s) => s.name.toLowerCase().includes(kw));
  }, [sources, sourceSearch]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/supabase/customer-sources/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Không thể xóa");
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-sources"] });
      setDeletingId(null);
      toast({ title: "Đã xóa nguồn khách hàng" });
    },
    onError: (error: Error) => {
      setDeletingId(null);
      toast({
        title: "Không thể xóa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (s: CustomerSource) => {
      const res = await fetch(`/api/supabase/customer-sources/${s.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !s.active }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Không thể cập nhật");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-sources"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Nguồn khách hàng</h1>
        <Button
          className="gap-2 bg-sky-500 text-white hover:bg-sky-600"
          onClick={() => openSourceDialog("create")}
        >
          <Plus className="h-4 w-4" />
          Thêm mới
        </Button>
      </div>

      {/* Search */}
      <div className="relative flex h-9 w-64 items-center">
        <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-gray-400" />
        <Input
          value={sourceSearch}
          onChange={(e) => setSourceSearch(e.target.value)}
          placeholder="Tìm kiếm..."
          className="h-9 pl-8"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-none border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead className="h-10 px-4 text-sm font-semibold text-gray-700">
                Tên
              </TableHead>
              <TableHead className="h-10 px-4 text-center text-sm font-semibold text-gray-700">
                Trạng thái
              </TableHead>
              <TableHead className="h-10 px-4 text-right text-sm font-semibold text-gray-700">
                Hành động
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="py-12 text-center text-sm text-gray-400">
                  Đang tải...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-12 text-center text-sm text-gray-400">
                  Không tìm thấy nguồn khách hàng
                </TableCell>
              </TableRow>
            )}
            {filtered.map((s, idx) => (
              <TableRow
                key={s.id}
                className={cn(
                  "border-b border-gray-100 last:border-0 hover:bg-sky-50/40",
                  idx % 2 === 1 && "bg-gray-50/40"
                )}
              >
                <TableCell className="px-4 py-3 text-sm font-medium text-gray-800">
                  {s.name}
                </TableCell>
                <TableCell className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => toggleActive.mutate(s)}
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                      s.active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-500"
                    )}
                  >
                    {s.active ? "Đang hoạt động" : "Ngừng hoạt động"}
                  </button>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openSourceDialog("edit", s.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-none border border-gray-300 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      title="Chỉnh sửa"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(s.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-none border border-gray-300 bg-white text-red-500 hover:bg-red-50 hover:text-red-600"
                      title="Xóa"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation */}
      {deletingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setDeletingId(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900">Xác nhận xóa</h3>
            <p className="mt-2 text-sm text-gray-600">
              Bạn có chắc muốn xóa nguồn khách hàng này? Hành động không thể hoàn tác.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeletingId(null)}>
                Hủy
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deletingId)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Đang xóa..." : "Xóa"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

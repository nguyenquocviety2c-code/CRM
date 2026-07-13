"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ColumnToggle,
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";

interface BookingChannel {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sort_order: number;
}

// Data columns for the booking-channels table. The "Hành động" column is
// always-visible (not listed here).
const CHANNEL_COLUMN_DEFS: ColumnDef[] = [
  { key: "stt", label: "STT" },
  { key: "name", label: "Tên" },
  { key: "description", label: "Mô tả" },
  { key: "status", label: "Trạng thái" },
];

export function BookingChannelsView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogMode, setDialogMode] = useState<null | "create" | "edit">(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(CHANNEL_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));
  const visibleCols = CHANNEL_COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false);

  const { data: channels = [], isLoading } = useQuery<BookingChannel[]>({
    queryKey: ["booking-channels"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/booking-channels");
      const json = await res.json();
      if (!json.ok) return [];
      return json.data as BookingChannel[];
    },
  });

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return channels;
    return channels.filter(
      (c) =>
        c.name.toLowerCase().includes(kw) ||
        (c.description || "").toLowerCase().includes(kw)
    );
  }, [channels, search]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/supabase/booking-channels/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Không thể xóa");
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-channels"] });
      setDeletingId(null);
      toast({ title: "Đã xóa kênh đặt lịch" });
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
    mutationFn: async (c: BookingChannel) => {
      const res = await fetch(`/api/supabase/booking-channels/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !c.active }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Không thể cập nhật");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-channels"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const openCreate = () => {
    setEditId(null);
    setDialogMode("create");
  };
  const openEdit = (id: string) => {
    setEditId(id);
    setDialogMode("edit");
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Kênh đặt lịch</h1>
        <Button
          className="gap-2 bg-sky-500 text-white hover:bg-sky-600"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" />
          Thêm mới
        </Button>
      </div>

      {/* Search + Cột */}
      <div className="flex items-center gap-3">
        <div className="relative flex h-9 w-64 items-center">
          <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm..."
            className="h-9 pl-8"
          />
        </div>
        <ColumnToggle
          columnDefs={CHANNEL_COLUMN_DEFS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-none border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              {visibleCols.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    "h-10 px-4 text-sm font-semibold text-gray-700",
                    col.key === "stt" && "w-16",
                    col.key === "status" && "text-center"
                  )}
                >
                  {col.label}
                </TableHead>
              ))}
              <TableHead className="h-10 px-4 text-right text-sm font-semibold text-gray-700">
                Hành động
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={Math.max(visibleCols.length, 1) + 1} className="py-12 text-center text-sm text-gray-400">
                  Đang tải...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={Math.max(visibleCols.length, 1) + 1} className="py-12 text-center text-sm text-gray-400">
                  Không tìm thấy kênh đặt lịch
                </TableCell>
              </TableRow>
            )}
            {filtered.map((c, idx) => (
              <TableRow
                key={c.id}
                className={cn(
                  "border-b border-gray-100 last:border-0 hover:bg-sky-50/40",
                  idx % 2 === 1 && "bg-gray-50/40"
                )}
              >
                {visibleCols.map((col) => {
                  if (col.key === "stt") return (
                    <TableCell key="stt" className="px-4 py-3 text-sm text-gray-500">
                      {c.sort_order ?? idx + 1}
                    </TableCell>
                  );
                  if (col.key === "name") return (
                    <TableCell key="name" className="px-4 py-3 text-sm font-medium text-gray-800">
                      {c.name}
                    </TableCell>
                  );
                  if (col.key === "description") return (
                    <TableCell key="description" className="px-4 py-3 text-sm text-gray-600">
                      {c.description || "—"}
                    </TableCell>
                  );
                  if (col.key === "status") return (
                    <TableCell key="status" className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleActive.mutate(c)}
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          c.active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500"
                        )}
                      >
                        {c.active ? "Đang hoạt động" : "Ngừng hoạt động"}
                      </button>
                    </TableCell>
                  );
                  return null;
                })}
                <TableCell className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(c.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-none border border-gray-300 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      title="Chỉnh sửa"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(c.id)}
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
              Bạn có chắc muốn xóa kênh đặt lịch này? Hành động không thể hoàn tác.
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

      {/* Create/Edit dialog */}
      {dialogMode && (
        <BookingChannelDialog
          mode={dialogMode}
          editId={editId}
          channels={channels}
          onClose={() => {
            setDialogMode(null);
            setEditId(null);
          }}
        />
      )}
    </div>
  );
}

interface DialogProps {
  mode: "create" | "edit";
  editId: string | null;
  channels: BookingChannel[];
  onClose: () => void;
}

function BookingChannelDialog({ mode, editId, channels, onClose }: DialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = mode === "edit";
  const existing = isEdit ? channels.find((c) => c.id === editId) : undefined;

  // Initialize from existing synchronously (existing comes from parent props).
  const [name, setName] = useState(() => existing?.name ?? "");
  const [description, setDescription] = useState(() => existing?.description ?? "");
  const [sortOrder, setSortOrder] = useState(() => String(existing?.sort_order ?? 0));
  const [active, setActive] = useState(() => existing?.active ?? true);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Vui lòng nhập tên kênh đặt lịch");
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        sort_order: Number(sortOrder) || 0,
        active,
      };
      if (isEdit && editId) {
        const res = await fetch(`/api/supabase/booking-channels/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Không thể cập nhật");
        return json.data;
      }
      const res = await fetch("/api/supabase/booking-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Không thể tạo");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-channels"] });
      toast({
        title: isEdit ? "Đã cập nhật kênh đặt lịch" : "Đã thêm kênh đặt lịch mới",
        description: name.trim(),
      });
      onClose();
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
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-gray-900">
            {isEdit ? "Cập nhật kênh đặt lịch" : "Thêm kênh đặt lịch mới"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">
              <span className="text-red-500">*</span> Tên:
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhập tên kênh"
              className="h-9"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">Mô tả:</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nhập mô tả"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">Thứ tự hiển thị:</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="0"
              className="h-9"
            />
          </div>

          <label className="flex items-center gap-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Đang hoạt động</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="bg-sky-500 text-white hover:bg-sky-600"
          >
            {saveMutation.isPending ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

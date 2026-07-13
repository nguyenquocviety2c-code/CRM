"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useSettingStore } from "@/stores/setting-store";
import { useToast } from "@/hooks/use-toast";

interface CustomerSource {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
}

interface SourceFormState {
  name: string;
  sort_order: string;
  active: boolean;
}

function SourceFormBody({
  onClose,
  existing,
}: {
  onClose: () => void;
  existing: CustomerSource | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Lazy init from existing (parent guarantees existing is loaded for edit).
  const [form, setForm] = useState<SourceFormState>(() => ({
    name: existing?.name ?? "",
    sort_order: String(existing?.sort_order ?? 0),
    active: existing?.active ?? true,
  }));

  const update = <K extends keyof SourceFormState>(
    key: K,
    value: SourceFormState[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Vui lòng nhập tên nguồn khách hàng");
      const payload = {
        name: form.name.trim(),
        sort_order: Number(form.sort_order) || 0,
        active: form.active,
      };
      if (existing) {
        const res = await fetch(`/api/supabase/customer-sources/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Không thể cập nhật");
        return json.data;
      }
      const res = await fetch("/api/supabase/customer-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Không thể tạo");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-sources"] });
      toast({
        title: existing ? "Đã cập nhật nguồn khách hàng" : "Đã thêm nguồn khách hàng mới",
        description: form.name.trim(),
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
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle className="text-lg font-semibold text-gray-900">
          {existing ? "Cập nhật nguồn khách hàng" : "Thêm nguồn khách hàng mới"}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">
            <span className="text-red-500">*</span> Tên:
          </Label>
          <Input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Nhập tên"
            className="h-9"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">Thứ tự hiển thị:</Label>
          <Input
            type="number"
            value={form.sort_order}
            onChange={(e) => update("sort_order", e.target.value)}
            placeholder="0"
            className="h-9"
          />
        </div>

        <label className="flex items-center gap-2 pt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => update("active", e.target.checked)}
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
  );
}

export function CustomerSourceCreateDialog() {
  const { sourceDialog, closeSourceDialog, selectedSourceId } = useSettingStore();
  const open = sourceDialog !== null;
  const isEdit = sourceDialog === "edit";

  // Fetch all sources; the edit target is looked up from the cached list.
  const { data: existing, isLoading } = useQuery<CustomerSource | null>({
    queryKey: ["customer-source", selectedSourceId],
    queryFn: async () => {
      if (!isEdit || !selectedSourceId) return null;
      const res = await fetch("/api/supabase/customer-sources");
      const json = await res.json();
      if (!json.ok) return null;
      return (
        (json.data as CustomerSource[]).find((s) => s.id === selectedSourceId) ?? null
      );
    },
    enabled: open && isEdit && !!selectedSourceId,
  });

  // For create mode, mount immediately with existing=null.
  // For edit mode, wait until the existing record is fetched.
  const showBody = !isEdit || existing !== undefined;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeSourceDialog()}>
      {open && showBody ? (
        <SourceFormBody
          key={`${sourceDialog}-${selectedSourceId ?? "new"}`}
          onClose={closeSourceDialog}
          existing={isEdit ? (existing ?? null) : null}
        />
      ) : open && isLoading ? (
        <DialogContent className="sm:max-w-[480px]">
          <div className="py-8 text-center text-sm text-gray-400">Đang tải...</div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, Check, Plus, Trash2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/stores/branch-store";
import { useToast } from "@/hooks/use-toast";

interface Branch {
  id: string;
  name: string;
  active: boolean;
}

export function BranchSelector({ className }: { className?: string }) {
  const { branches, selectedBranchId, setBranches, setSelectedBranchId } =
    useBranchStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);

  // Fetch branches
  const { data } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const res = await fetch("/api/supabase/branches");
      const json = await res.json();
      if (!json.ok) return [];
      return json.data as Branch[];
    },
  });

  useEffect(() => {
    if (data && data.length > 0) {
      // setBranches is now safe — it preserves the current selection if it
      // still exists in the new list (handles branch list refreshes without
      // resetting the user's choice). No need for a separate fallback here.
      setBranches(data);
    }
  }, [data, setBranches]);

  // Create branch mutation
  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; address?: string; phone?: string; email?: string }) => {
      const res = await fetch("/api/supabase/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to create branch");
      return json.data as Branch;
    },
    onSuccess: (newBranch) => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      setSelectedBranchId(newBranch.id);
      setAddDialogOpen(false);
      toast({
        title: "Thành công",
        description: `Đã tạo chi nhánh "${newBranch.name}"`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể tạo chi nhánh",
        variant: "destructive",
      });
    },
  });

  // Delete branch mutation
  const deleteMutation = useMutation({
    mutationFn: async (branchId: string) => {
      const res = await fetch(`/api/supabase/branches/${branchId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to delete branch");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      setDeleteTarget(null);
      toast({
        title: "Đã xóa",
        description: "Chi nhánh đã được xóa",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Không thể xóa",
        description: error.message || "Có lỗi xảy ra",
        variant: "destructive",
      });
    },
  });

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-2 bg-white", className)}
          >
            <Building2 className="h-4 w-4 text-emerald-600" />
            <span className="font-medium max-w-[160px] truncate">
              {selectedBranchId === "all" ? "Tất cả chi nhánh" : (selectedBranch?.name || "Chọn chi nhánh")}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
            Chi nhánh
          </div>
          <div className="max-h-60 overflow-y-auto">
            {branches.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">
                Chưa có chi nhánh
              </div>
            ) : (
              <>
                {/* "Tất cả chi nhánh" option */}
                <div
                  className={cn(
                    "group flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    selectedBranchId === "all"
                      ? "bg-emerald-50 text-emerald-700 font-medium"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <button
                    onClick={() => {
                      setSelectedBranchId("all");
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  >
                    <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="truncate">Tất cả chi nhánh</span>
                    {selectedBranchId === "all" && (
                      <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    )}
                  </button>
                </div>
                {/* Individual branches */}
                {branches.map((branch) => (
                <div
                  key={branch.id}
                  className={cn(
                    "group flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    selectedBranchId === branch.id
                      ? "bg-emerald-50 text-emerald-700 font-medium"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <button
                    onClick={() => {
                      setSelectedBranchId(branch.id);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  >
                    <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="truncate">{branch.name}</span>
                    {selectedBranchId === branch.id && (
                      <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(branch);
                    }}
                    className="shrink-0 rounded p-1 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    title="Xóa chi nhánh"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                ))}
              </>
            )}
          </div>
          {/* Add new branch button */}
          <div className="border-t p-2">
            <button
              onClick={() => {
                setOpen(false);
                setAddDialogOpen(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Thêm cửa hàng
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Add Branch Dialog */}
      <AddBranchDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa chi nhánh</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Bạn có chắc muốn xóa chi nhánh{" "}
            <span className="font-semibold text-gray-900">
              {deleteTarget?.name}
            </span>{" "}
            không? Hành động này không thể hoàn tác.
          </p>
          {deleteMutation.isError && (
            <p className="text-sm text-red-500">
              {deleteMutation.error?.message ||
                "Không thể xóa chi nhánh này vì đang có dữ liệu liên quan."}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Đang xóa..." : "Xóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface AddBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; address?: string; phone?: string; email?: string }) => void;
  isPending: boolean;
}

function AddBranchDialog({ open, onOpenChange, onSubmit, isPending }: AddBranchDialogProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      address: address.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
    });
    // Reset form
    setName("");
    setAddress("");
    setPhone("");
    setEmail("");
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      // Reset on close
      setName("");
      setAddress("");
      setPhone("");
      setEmail("");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm cửa hàng mới</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="branch-name">
              <span className="text-red-500">*</span> Tên chi nhánh
            </Label>
            <Input
              id="branch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Level 2 Quang Trung"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch-address">Địa chỉ</Label>
            <Input
              id="branch-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Nhập địa chỉ"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="branch-phone">Số điện thoại</Label>
              <Input
                id="branch-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Số điện thoại"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-email">Email</Label>
              <Input
                id="branch-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isPending || !name.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isPending ? "Đang lưu..." : "Thêm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

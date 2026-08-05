"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useServiceCategoryStore } from "@/stores/service-category-store";
import { useBranchStore } from "@/stores/branch-store";
import { cn } from "@/lib/utils";

export function ServiceCategoryDialog() {
  const {
    dialogOpen,
    dialogMode,
    editingId,
    items,
    closeDialog,
    addItem,
    updateItem,
  } = useServiceCategoryStore();
  const { branches } = useBranchStore();

  const [name, setName] = useState("");
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [requiresContact, setRequiresContact] = useState(false);
  const [error, setError] = useState("");

  const editingItem = useMemo(
    () => items.find((item) => item.id === editingId),
    [items, editingId]
  );

  // Reset/load form when dialog opens
  useEffect(() => {
    if (dialogOpen) {
      setName(editingItem?.name || "");
      // Load existing branches from API response (branches array)
      const existingBranches = (editingItem as { branches?: string[] })?.branches;
      const existingBranchId = (editingItem as { branchId?: string | null })?.branchId;
      if (existingBranches && existingBranches.length > 0) {
        setSelectedBranches(existingBranches);
      } else if (existingBranchId) {
        setSelectedBranches([existingBranchId]);
      } else {
        setSelectedBranches([]);
      }
      setRequiresContact((editingItem as { requires_contact?: boolean })?.requires_contact || false);
      setError("");
    }
  }, [dialogOpen, editingItem]);

  const toggleBranch = (branchId: string) => {
    setSelectedBranches((prev) =>
      prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setError("Tên loại không được để trống");
      return;
    }

    const isDuplicate = items.some(
      (item) =>
        item.name.toLowerCase() === trimmed.toLowerCase() &&
        item.id !== editingId
    );

    if (isDuplicate) {
      setError("Tên loại đã tồn tại");
      return;
    }

    // Send all selected branches as array + requires_contact flag
    if (dialogMode === "edit" && editingId) {
      await updateItem(editingId, trimmed, selectedBranches, requiresContact);
    } else {
      await addItem(trimmed, selectedBranches, requiresContact);
    }

    closeDialog();
    setName("");
    setSelectedBranches([]);
    setRequiresContact(false);
    setError("");
  };

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDialog();
          setName("");
          setSelectedBranches([]);
          setError("");
        }
      }}
    >
      <DialogContent className="max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {dialogMode === "edit" ? "Sửa nhóm dịch vụ" : "Thêm nhóm dịch vụ"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="category-name">
              Tên loại <span className="text-red-500">*</span>
            </Label>
            <Input
              id="category-name"
              placeholder="Nhập tên loại"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              className="mt-1"
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>

          {/* Chi nhánh (multi-select) */}
          <div>
            <Label>Chi nhánh</Label>
            <div className="mt-1 flex flex-wrap gap-2 rounded-md border border-gray-200 p-2 min-h-9">
              {branches.length === 0 ? (
                <span className="text-sm text-gray-400 py-1">Chưa có chi nhánh</span>
              ) : (
                branches.map((b) => (
                  <label
                    key={b.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors",
                      selectedBranches.includes(b.id)
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <Checkbox
                      checked={selectedBranches.includes(b.id)}
                      onCheckedChange={() => toggleBranch(b.id)}
                      className="h-3.5 w-3.5"
                    />
                    {b.name}
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Liên hệ trực tiếp */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="requires-contact"
              checked={requiresContact}
              onCheckedChange={(v) => setRequiresContact(v === true)}
              className="h-3.5 w-3.5"
            />
            <label htmlFor="requires-contact" className="text-sm text-gray-700 cursor-pointer">
              Liên hệ trực tiếp (không đặt lịch online)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                closeDialog();
                setName("");
                setSelectedBranches([]);
                setRequiresContact(false);
                setError("");
              }}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              OK
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

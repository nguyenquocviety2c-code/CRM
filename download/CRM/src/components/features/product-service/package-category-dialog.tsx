"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { usePackageCategoryStore } from "@/stores/package-category-store";

export function PackageCategoryDialog() {
  const {
    dialogOpen,
    dialogMode,
    editingId,
    items,
    closeDialog,
    addItem,
    updateItem,
  } = usePackageCategoryStore();

  const editingItem = useMemo(
    () => items.find((item) => item.id === editingId),
    [items, editingId]
  );

  const initialName = dialogMode === "edit" && editingItem ? editingItem.name : "";
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setError("Tên nhóm không được để trống");
      return;
    }

    const isDuplicate = items.some(
      (item) =>
        item.name.toLowerCase() === trimmed.toLowerCase() &&
        item.id !== editingId
    );

    if (isDuplicate) {
      setError("Tên nhóm đã tồn tại");
      return;
    }

    if (dialogMode === "edit" && editingId) {
      await updateItem(editingId, trimmed);
    } else {
      await addItem(trimmed);
    }

    closeDialog();
    setName("");
    setError("");
  };

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDialog();
          setName("");
          setError("");
        }
      }}
    >
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {dialogMode === "edit" ? "Sửa nhóm gói" : "Thêm nhóm gói"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="category-name">
              Tên nhóm <span className="text-red-500">*</span>
            </Label>
            <Input
              id="category-name"
              placeholder="Nhập tên nhóm"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              className="mt-1"
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                closeDialog();
                setName("");
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
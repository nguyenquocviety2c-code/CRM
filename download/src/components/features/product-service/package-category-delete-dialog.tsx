"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePackageCategoryStore } from "@/stores/package-category-store";

export function PackageCategoryDeleteDialog() {
  const {
    deleteTargetId,
    deleteTargetName,
    closeDeleteConfirm,
    deleteItem,
  } = usePackageCategoryStore();

  const open = !!deleteTargetId;

  const handleDelete = async () => {
    if (deleteTargetId) {
      await deleteItem(deleteTargetId);
    }
    closeDeleteConfirm();
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeDeleteConfirm();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xóa nhóm gói dịch vụ</AlertDialogTitle>
          <AlertDialogDescription>
            {`Bạn có chắc muốn xóa nhóm gói dịch vụ "${deleteTargetName || ""}"?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={closeDeleteConfirm}>
            Hủy
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Xóa
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
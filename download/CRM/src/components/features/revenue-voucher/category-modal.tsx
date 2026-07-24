"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useRevenueVoucherStore,
  usePaginatedCategories,
  useDeleteCategory,
} from "@/stores/revenue-voucher-store";
import { useToast } from "@/hooks/use-toast";

export function CategoryModal() {
  const {
    isCategoryModalOpen,
    closeCategoryModal,
    openCategoryFormDialog,
  } = useRevenueVoucherStore();

  const { data, total } = usePaginatedCategories();
  const deleteCategory = useDeleteCategory();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string, code: string) => {
    setDeletingId(id);
    try {
      await deleteCategory(id);
      toast({
        title: "Đã xóa",
        description: `Loại phiếu thu ${code || id} đã được xóa`,
      });
    } catch (err) {
      toast({
        title: "Lỗi",
        description:
          err instanceof Error ? err.message : "Xóa loại phiếu thu thất bại",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={isCategoryModalOpen} onOpenChange={closeCategoryModal}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex items-center justify-between">
          <DialogTitle>Danh sách loại phiếu thu</DialogTitle>
        </DialogHeader>

        <div className="flex justify-end mb-2">
          <Button onClick={openCategoryFormDialog} className="gap-1">
            <Plus className="h-4 w-4" />
            Thêm loại phiếu thu
          </Button>
        </div>

        <div className="rounded-md border flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên loại</TableHead>
                <TableHead>Mã</TableHead>
                <TableHead>Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-gray-500">
                    Trống
                  </TableCell>
                </TableRow>
              ) : (
                data.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell>{cat.name}</TableCell>
                    <TableCell className="text-gray-500">{cat.code || "-"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deletingId === cat.id}
                        onClick={() => handleDelete(cat.id, cat.code || cat.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-sm text-gray-500">
          Hiển thị từ 1 đến {Math.min(data.length, total)} trên tổng số {total}
        </div>
      </DialogContent>
    </Dialog>
  );
}
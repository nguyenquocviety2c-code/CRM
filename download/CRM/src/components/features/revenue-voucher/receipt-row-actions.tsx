"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeleteReceipt } from "@/stores/revenue-voucher-store";
import { Receipt } from "@/types/revenue-voucher";
import { useToast } from "@/hooks/use-toast";

interface ReceiptRowActionsProps {
  receipt: Receipt;
}

export function ReceiptRowActions({ receipt }: ReceiptRowActionsProps) {
  const deleteReceipt = useDeleteReceipt();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleEdit = () => {
    toast({
      title: "Thông báo",
      description: "Tính năng sẽ khả dụng ở giai đoạn lõi",
    });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteReceipt(receipt.id);
      toast({
        title: "Đã xóa",
        description: `Phiếu thu ${receipt.code} đã được xóa`,
      });
    } catch (err) {
      toast({
        title: "Lỗi",
        description:
          err instanceof Error ? err.message : "Xóa phiếu thu thất bại",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={handleEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" disabled={deleting}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa phiếu thu {receipt.code}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
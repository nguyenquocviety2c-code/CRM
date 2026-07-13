"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CustomerSet } from "@/stores/customer-care-store";
import { queryKeys } from "@/lib/query-keys";

interface CustomerSetDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  customerSet: CustomerSet | null;
}

export function CustomerSetDeleteDialog({
  open,
  onClose,
  customerSet,
}: CustomerSetDeleteDialogProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!customerSet) return;
      const res = await fetch(`/api/supabase/customer-sets/${customerSet.id}`, {
        method: "DELETE",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerCare.customerSets.all });
      onClose();
    },
  });

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Xác nhận xóa</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-gray-600">
            Bạn có chắc chắn muốn xóa tập khách hàng{" "}
            <span className="font-medium text-gray-900">
              {customerSet?.name || ""}
            </span>
            ?
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleteMutation.isPending ? "Đang xóa..." : "Xóa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
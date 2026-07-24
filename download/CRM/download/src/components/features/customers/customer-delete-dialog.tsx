"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Customer } from "@/stores/customer-store";
import { queryKeys } from "@/lib/query-keys";

interface CustomerDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
}

export function CustomerDeleteDialog({
  open,
  onClose,
  customer,
}: CustomerDeleteDialogProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!customer) return;
      const res = await fetch(`/api/supabase/customers/${customer.id}`, {
        method: "DELETE",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      onClose();
    },
  });

  const handleConfirm = () => {
    deleteMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Xóa khách hàng</DialogTitle>
          <DialogDescription>
            Bạn có chắc chắn muốn xóa khách hàng{" "}
            <span className="font-semibold text-gray-900">
              {customer?.name || ""}
            </span>
            ? Hành động này không thể hoàn tác.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Đang xóa..." : "Xóa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
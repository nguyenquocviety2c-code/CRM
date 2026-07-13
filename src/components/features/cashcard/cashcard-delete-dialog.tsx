"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/query-keys";
import { CashCard } from "@/stores/cashcard-store";

interface CashCardDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  card: CashCard | null;
}

export function CashCardDeleteDialog({ open, onClose, card }: CashCardDeleteDialogProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!card) throw new Error("No card selected");
      const res = await fetch(`/api/supabase/cashcards/${card.id}`, {
        method: "DELETE",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cashcards.all });
      onClose();
    },
  });

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Xác nhận xóa</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          Bạn có chắc chắn muốn xóa thẻ <strong>{card?.code}</strong> không? Hành động này không thể hoàn tác.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Đang xóa..." : "Xóa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
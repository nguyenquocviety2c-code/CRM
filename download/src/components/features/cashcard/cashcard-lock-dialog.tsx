"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { queryKeys } from "@/lib/query-keys";
import { cashcardLockSchema } from "@/lib/validations";
import { CashCard } from "@/stores/cashcard-store";

type CashCardLockFormValues = z.infer<typeof cashcardLockSchema>;

interface CashCardLockDialogProps {
  open: boolean;
  onClose: () => void;
  card: CashCard | null;
}

export function CashCardLockDialog({ open, onClose, card }: CashCardLockDialogProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CashCardLockFormValues>({
    resolver: zodResolver(cashcardLockSchema),
    defaultValues: {
      lockedUntil: "",
      note: "",
    },
  });

  useEffect(() => {
    if (open && card) {
      reset({
        lockedUntil: "",
        note: "",
      });
    }
  }, [open, card, reset]);

  const lockMutation = useMutation({
    mutationFn: async (data: CashCardLockFormValues) => {
      if (!card) throw new Error("No card selected");
      const res = await fetch(`/api/supabase/cashcards/${card.id}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cashcards.all });
      onClose();
    },
  });

  const onSubmit = (data: CashCardLockFormValues) => {
    lockMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Khóa thẻ tiền mặt</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Thẻ tiền mặt (static) */}
          <div className="space-y-2">
            <Label>Thẻ tiền mặt</Label>
            <div className="rounded-md border border-input bg-muted px-3 py-2 text-sm">
              {card?.code || ""}
            </div>
          </div>

          {/* Khóa thẻ đến ngày */}
          <div className="space-y-2">
            <Label htmlFor="lockedUntil">Khóa thẻ đến ngày</Label>
            <Input
              id="lockedUntil"
              type="date"
              placeholder="Chọn ngày"
              {...register("lockedUntil")}
            />
            {errors.lockedUntil && (
              <p className="text-sm text-red-500">{errors.lockedUntil.message}</p>
            )}
          </div>

          {/* Ghi chú */}
          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea
              id="note"
              placeholder="Lý do khóa thẻ..."
              {...register("note")}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={lockMutation.isPending}>
              {lockMutation.isPending ? "Đang khóa..." : "OK"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
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
import { cashcardExtendSchema } from "@/lib/validations";
import { CashCard } from "@/stores/cashcard-store";

type CashCardExtendFormValues = z.infer<typeof cashcardExtendSchema>;

interface CashCardExtendDialogProps {
  open: boolean;
  onClose: () => void;
  card: CashCard | null;
}

export function CashCardExtendDialog({ open, onClose, card }: CashCardExtendDialogProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CashCardExtendFormValues>({
    resolver: zodResolver(cashcardExtendSchema),
    defaultValues: {
      newExpiryDate: "",
      note: "",
    },
  });

  useEffect(() => {
    if (open && card) {
      reset({
        newExpiryDate: card.expiryDate ? card.expiryDate.split("T")[0] : "",
        note: "",
      });
    }
  }, [open, card, reset]);

  const extendMutation = useMutation({
    mutationFn: async (data: CashCardExtendFormValues) => {
      if (!card) throw new Error("No card selected");
      const res = await fetch(`/api/supabase/cashcards/${card.id}/extend`, {
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

  const onSubmit = (data: CashCardExtendFormValues) => {
    extendMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Gia hạn thẻ tiền mặt</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Thẻ tiền mặt (static) */}
          <div className="space-y-2">
            <Label>Thẻ tiền mặt</Label>
            <div className="rounded-md border border-input bg-muted px-3 py-2 text-sm">
              {card?.code || ""}
            </div>
          </div>

          {/* Gia hạn tới */}
          <div className="space-y-2">
            <Label htmlFor="newExpiryDate">
              Gia hạn tới <span className="text-red-500">*</span>
            </Label>
            <Input
              id="newExpiryDate"
              type="date"
              {...register("newExpiryDate")}
            />
            {errors.newExpiryDate && (
              <p className="text-sm text-red-500">{errors.newExpiryDate.message}</p>
            )}
          </div>

          {/* Ghi chú */}
          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea
              id="note"
              placeholder="Lý do gia hạn..."
              {...register("note")}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={extendMutation.isPending}>
              {extendMutation.isPending ? "Đang gia hạn..." : "OK"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
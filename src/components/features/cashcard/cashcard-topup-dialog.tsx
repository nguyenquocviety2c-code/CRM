"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys } from "@/lib/query-keys";
import { cashcardTopupSchema } from "@/lib/validations";
import { CashCard } from "@/stores/cashcard-store";

type CashCardTopupFormValues = z.infer<typeof cashcardTopupSchema>;

interface CashCardTopupDialogProps {
  open: boolean;
  onClose: () => void;
  card: CashCard | null;
}

interface StaffOption {
  id: string;
  name: string;
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Tiền mặt" },
  { value: "transfer", label: "Chuyển khoản" },
  { value: "card", label: "Thẻ" },
];

export function CashCardTopupDialog({ open, onClose, card }: CashCardTopupDialogProps) {
  const queryClient = useQueryClient();
  const [total, setTotal] = useState(0);

  const { data: staffData } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      const json = await res.json();
      return json.data || [];
    },
    enabled: open,
  });

  const staff: StaffOption[] = staffData || [];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CashCardTopupFormValues>({
    resolver: zodResolver(cashcardTopupSchema),
    defaultValues: {
      method: "cash",
      amount: 10000,
      bonus: 0,
      topupDate: "",
      topupCode: "",
      recordedById: "",
      note: "",
    },
  });

  const amount = watch("amount") || 0;
  const bonus = watch("bonus") || 0;

  useEffect(() => {
    setTotal(Number(amount) + Number(bonus));
  }, [amount, bonus]);

  useEffect(() => {
    if (open) {
      const today = new Date().toISOString().split("T")[0];
      reset({
        method: "cash",
        amount: 10000,
        bonus: 0,
        topupDate: today,
        topupCode: "",
        recordedById: "",
        note: "",
      });
    }
  }, [open, reset]);

  const topupMutation = useMutation({
    mutationFn: async (data: CashCardTopupFormValues) => {
      if (!card) throw new Error("No card selected");
      const res = await fetch(`/api/supabase/cashcards/${card.id}/topup`, {
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

  const onSubmit = (data: CashCardTopupFormValues) => {
    topupMutation.mutate(data);
  };

  const formatNumber = (value: number) => {
    return value.toLocaleString("vi-VN");
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nạp tiền</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="  -y-4">
          {/* Phương thức */}
          <div className="space-y-2">
            <Label htmlFor="method">Phương thức</Label>
            <Select
              onValueChange={(value) => setValue("method", value as "cash" | "transfer" | "card")}
              value={watch("method") || "cash"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn phương thức" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Số tiền */}
          <div className="space-y-2">
            <Label htmlFor="amount">Số tiền</Label>
            <div className="flex items-center gap-2">
              <Input
                id="amount"
                type="number"
                {...register("amount", { valueAsNumber: true })}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setValue("amount", (watch("amount") || 0) + 10000)}
              >
                +
              </Button>
            </div>
            {errors.amount && (
              <p className="text-sm text-red-500">{errors.amount.message}</p>
            )}
          </div>

          {/* Tiền thưởng */}
          <div className="space-y-2">
            <Label htmlFor="bonus">Tiền thưởng</Label>
            <Input
              id="bonus"
              type="number"
              {...register("bonus", { valueAsNumber: true })}
            />
            {errors.bonus && (
              <p className="text-sm text-red-500">{errors.bonus.message}</p>
            )}
          </div>

          {/* Tổng nhận (auto-calc) */}
          <div className="space-y-2">
            <Label htmlFor="total">Tổng nhận</Label>
            <Input
              id="total"
              type="text"
              value={formatNumber(total)}
              readOnly
              className="bg-muted"
            />
          </div>

          {/* Ngày nạp */}
          <div className="space-y-2">
            <Label htmlFor="topupDate">Ngày nạp</Label>
            <Input
              id="topupDate"
              type="date"
              {...register("topupDate")}
            />
            {errors.topupDate && (
              <p className="text-sm text-red-500">{errors.topupDate.message}</p>
            )}
          </div>

          {/* Mã nạp tiền */}
          <div className="space-y-2">
            <Label htmlFor="topupCode">Mã nạp tiền</Label>
            <Input
              id="topupCode"
              placeholder="Nhập mã hoặc để trống"
              {...register("topupCode")}
            />
          </div>

          {/* Ghi nhận cho */}
          <div className="space-y-2">
            <Label htmlFor="recordedById">Ghi nhận cho</Label>
            <Select
              onValueChange={(value) => setValue("recordedById", value)}
              value={watch("recordedById") || ""}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn nhân viên" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ghi chú */}
          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea
              id="note"
              placeholder="Nhập ghi chú"
              {...register("note")}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={topupMutation.isPending} className="bg-green-600 hover:bg-green-700">
              {topupMutation.isPending ? "Đang nạp..." : "Nạp tiền"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
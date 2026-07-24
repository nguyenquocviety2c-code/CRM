"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { payDebtSchema } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PayDebtDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PayDebtDialog({ open, onOpenChange }: PayDebtDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [totalDebt, setTotalDebt] = useState(0);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(payDebtSchema),
    defaultValues: {
      createdByEmail: "crmlevel1@gmail.com",
      supplierId: "",
      paymentMethod: "cash",
      paymentType: "auto",
      amount: 0,
      code: "",
      paymentDate: new Date().toISOString().split("T")[0],
      note: "",
      importSlipId: "",
    },
  });

  const paymentType = watch("paymentType");

  // Fetch total debt on open
  useEffect(() => {
    if (open) {
      fetch("/api/supabase/warehouse/total-debt")
        .then((res) => res.json())
        .then((json) => {
          if (json.ok && json.data) {
            setTotalDebt(json.data.totalDebt);
            setValue("amount", json.data.totalDebt);
          }
        })
        .catch(() => {});
    }
  }, [open, setValue]);

  const onSubmit = async (data: unknown) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/supabase/warehouse/pay-debt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      reset();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating pay debt slip:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("vi-VN").format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Phiếu thanh toán nợ NCC</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Field 1: Tên người tạo phiếu */}
          <div className="space-y-2">
            <Label htmlFor="createdByEmail">Tên người tạo phiếu:</Label>
            <Input
              id="createdByEmail"
              {...register("createdByEmail")}
              readOnly
            />
            {errors.createdByEmail && (
              <p className="text-sm text-red-500">{errors.createdByEmail.message}</p>
            )}
          </div>

          {/* Field 2 & 3: Nhà cung cấp + Phương thức */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplierId">Nhà cung cấp:</Label>
              <Select
                onValueChange={(value) => setValue("supplierId", value)}
                value={watch("supplierId")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tên nhà cung cấp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier1">Nhà cung cấp 1</SelectItem>
                </SelectContent>
              </Select>
              {errors.supplierId && (
                <p className="text-sm text-red-500">{errors.supplierId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Phương thức:</Label>
              <Select
                onValueChange={(value) => setValue("paymentMethod", value as "cash" | "transfer" | "card")}
                value={watch("paymentMethod")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Tiền mặt</SelectItem>
                  <SelectItem value="transfer">Chuyển khoản</SelectItem>
                  <SelectItem value="card">Thẻ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Field 4: Phương thức thanh toán (radio) */}
          <div className="space-y-2">
            <Label>Phương thức thanh toán:</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="auto"
                  {...register("paymentType")}
                  defaultChecked
                />
                <span>Trả tự động</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="manual"
                  {...register("paymentType")}
                />
                <span>Trả cho phiếu nhập</span>
              </label>
            </div>
          </div>

          {/* Field 5: Info text (only for auto) */}
          {paymentType === "auto" && (
            <p className="text-sm text-gray-500 italic">
              Hệ thống thanh toán theo thứ tự phiếu nhập cũ xa nhất đến gần nhất.
            </p>
          )}

          {/* Field 6: Số tiền */}
          <div className="space-y-2">
            <Label htmlFor="amount">Số tiền nạp vào tối thiểu:</Label>
            <Input
              id="amount"
              type="number"
              {...register("amount", { valueAsNumber: true })}
              defaultValue={totalDebt}
            />
            {errors.amount && (
              <p className="text-sm text-red-500">{errors.amount.message}</p>
            )}
          </div>

          {/* Field 7 & 8: Mã phiếu + Ngày tạo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Mã phiếu:</Label>
              <Input
                id="code"
                {...register("code")}
                placeholder="Mã tự động"
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentDate">Ngày tạo:</Label>
              <Input
                id="paymentDate"
                type="date"
                {...register("paymentDate")}
              />
              {errors.paymentDate && (
                <p className="text-sm text-red-500">{errors.paymentDate.message}</p>
              )}
            </div>
          </div>

          {/* Field 9: Ghi chú */}
          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú:</Label>
            <textarea
              id="note"
              {...register("note")}
              placeholder="Nhập ghi chú"
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang xử lý..." : "OK"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
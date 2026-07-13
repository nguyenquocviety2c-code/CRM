"use client";

import { useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys } from "@/lib/query-keys";
import { cashcardCreateSchema } from "@/lib/validations";

type CashCardFormValues = z.infer<typeof cashcardCreateSchema>;

interface CashCardCreateDialogProps {
  open: boolean;
  onClose: () => void;
}

interface CustomerOption {
  id: string;
  name: string;
  phone: string;
}

export function CashCardCreateDialog({ open, onClose }: CashCardCreateDialogProps) {
  const queryClient = useQueryClient();

  const { data: customersData } = useQuery({
    queryKey: queryKeys.customers.all,
    queryFn: async () => {
      const res = await fetch("/api/supabase/customers?limit=500");
      const json = await res.json();
      return json.data || [];
    },
    enabled: open,
  });

  const customers: CustomerOption[] = customersData || [];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CashCardFormValues>({
    resolver: zodResolver(cashcardCreateSchema),
    defaultValues: {
      code: "",
      customerId: "",
      coOwnerId: "",
      expiryDate: "",
    },
  });

  useEffect(() => {
    if (open) {
      // Default expiry date = +30 days
      const date = new Date();
      date.setDate(date.getDate() + 30);
      reset({
        code: "",
        customerId: "",
        coOwnerId: "",
        expiryDate: date.toISOString().split("T")[0],
      });
    }
  }, [open, reset]);

  const createMutation = useMutation({
    mutationFn: async (data: CashCardFormValues) => {
      const res = await fetch("/api/supabase/cashcards", {
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

  const onSubmit = (data: CashCardFormValues) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Tạo mới</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Mã thẻ */}
          <div className="space-y-2">
            <Label htmlFor="code">
              Mã thẻ <span className="text-red-500">*</span>
            </Label>
            <Input
              id="code"
              placeholder="Nhập mã thẻ"
              {...register("code")}
            />
            {errors.code && (
              <p className="text-sm text-red-500">{errors.code.message}</p>
            )}
          </div>

          {/* Chủ sở hữu */}
          <div className="space-y-2">
            <Label htmlFor="customerId">
              Chủ sở hữu <span className="text-red-500">*</span>
            </Label>
            <Select
              onValueChange={(value) => setValue("customerId", value)}
              value={watch("customerId") || ""}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tên khách hàng" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name} ({customer.phone})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.customerId && (
              <p className="text-sm text-red-500">{errors.customerId.message}</p>
            )}
          </div>

          {/* Đồng sở hữu */}
          <div className="space-y-2">
            <Label htmlFor="coOwnerId">Đồng sở hữu</Label>
            <Input
              id="coOwnerId"
              placeholder="Tìm khách hàng"
              {...register("coOwnerId")}
            />
          </div>

          {/* Hạn dùng */}
          <div className="space-y-2">
            <Label htmlFor="expiryDate">
              Hạn dùng <span className="text-red-500">*</span>
            </Label>
            <Input
              id="expiryDate"
              type="date"
              {...register("expiryDate")}
            />
            {errors.expiryDate && (
              <p className="text-sm text-red-500">{errors.expiryDate.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Đang tạo..." : "OK"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
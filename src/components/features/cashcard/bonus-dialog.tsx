"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryKeys } from "@/lib/query-keys";
import { BonusTypeLabel } from "@/lib/constants";

interface BonusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BonusDialog({ open, onOpenChange }: BonusDialogProps) {
  const [minTopupAmount, setMinTopupAmount] = useState("");
  const [bonusValue, setBonusValue] = useState("");
  const [bonusType, setBonusType] = useState<"VND" | "PERCENT">("VND");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: { minTopupAmount: number; bonusValue: number; bonusType: "VND" | "PERCENT" }) => {
      const res = await fetch("/api/supabase/cashcard-settings/bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cashcardSettings.bonus.all });
      handleClose();
    },
  });

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!minTopupAmount || parseFloat(minTopupAmount) < 0) {
      newErrors.minTopupAmount = "Số tiền nạp vào tối thiểu phải >= 0";
    }
    if (!bonusValue || parseFloat(bonusValue) < 0) {
      newErrors.bonusValue = "Bonus phải >= 0";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    createMutation.mutate({
      minTopupAmount: parseFloat(minTopupAmount),
      bonusValue: parseFloat(bonusValue),
      bonusType,
    });
  };

  const handleClose = () => {
    setMinTopupAmount("");
    setBonusValue("");
    setBonusType("VND");
    setErrors({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm khoản bonus</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="minTopupAmount">
              Số tiền nạp vào tối thiểu <span className="text-red-500">*</span>
            </Label>
            <Input
              id="minTopupAmount"
              type="number"
              placeholder="Nhập số tiền"
              value={minTopupAmount}
              onChange={(e) => setMinTopupAmount(e.target.value)}
              className={errors.minTopupAmount ? "border-red-500" : ""}
            />
            {errors.minTopupAmount && (
              <p className="text-sm text-red-500">{errors.minTopupAmount}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bonusValue">
              Bonus <span className="text-red-500">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="bonusValue"
                type="number"
                placeholder="Nhập số tiền hoặc %"
                value={bonusValue}
                onChange={(e) => setBonusValue(e.target.value)}
                className={errors.bonusValue ? "border-red-500" : ""}
              />
              <Select value={bonusType} onValueChange={(value) => setBonusType(value as "VND" | "PERCENT")}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Chọn..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VND">{BonusTypeLabel.VND}</SelectItem>
                  <SelectItem value="PERCENT">{BonusTypeLabel.PERCENT}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {errors.bonusValue && (
              <p className="text-sm text-red-500">{errors.bonusValue}</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
            {createMutation.isPending ? "Đang lưu..." : "OK"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
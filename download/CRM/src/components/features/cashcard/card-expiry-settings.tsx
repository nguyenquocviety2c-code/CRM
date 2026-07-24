"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { queryKeys } from "@/lib/query-keys";
import { ExpiryTypeLabel, ExpiryUnitLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function CardExpirySettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: queryKeys.cashcardSettings.expiry.all,
    queryFn: async () => {
      const res = await fetch("/api/supabase/cashcard-settings/expiry");
      const json = await res.json();
      return json.ok ? json.data : null;
    },
  });

  const [expiryType, setExpiryType] = useState<"FIXED" | "CUSTOM">(
    (settings?.expiryType as "FIXED" | "CUSTOM") || "FIXED"
  );
  const [expiryValue, setExpiryValue] = useState(
    String(settings?.expiryValue || "1")
  );
  const [expiryUnit, setExpiryUnit] = useState<"MONTH" | "YEAR">(
    (settings?.expiryUnit as "MONTH" | "YEAR") || "MONTH"
  );

  const updateMutation = useMutation({
    mutationFn: async (data: { expiryType: "FIXED" | "CUSTOM"; expiryValue: number; expiryUnit: "MONTH" | "YEAR" }) => {
      const res = await fetch("/api/supabase/cashcard-settings/expiry", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cashcardSettings.expiry.all });
    },
  });

  const handleUpdate = () => {
    updateMutation.mutate({
      expiryType,
      expiryValue: parseInt(expiryValue, 10),
      expiryUnit,
    });
  };

  if (isLoading) {
    return <div className="py-8 text-center text-gray-500">Đang tải...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">HẠN SỬ DỤNG THẺ TIỀN MẶT</h2>
        <Button
          variant="outline"
          onClick={handleUpdate}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? "Đang cập nhật..." : "Cập nhật"}
        </Button>
      </div>

      <RadioGroup
        value={expiryType}
        onValueChange={(value: string) => setExpiryType(value as "FIXED" | "CUSTOM")}
        className="space-y-4"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="FIXED" id="fixed" />
          <Label htmlFor="fixed" className="cursor-pointer">
            {ExpiryTypeLabel.FIXED}
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="CUSTOM" id="custom" />
          <Label htmlFor="custom" className="cursor-pointer">
            {ExpiryTypeLabel.CUSTOM}
          </Label>
        </div>
      </RadioGroup>

      <div className="space-y-2">
        <Label>
          Thời gian tính từ lần phát sinh giao dịch gần nhất{" "}
          <span className="text-red-500">*</span>
        </Label>
        <div className="flex items-center gap-4">
          <Input
            type="number"
            value={expiryValue}
            onChange={(e) => setExpiryValue(e.target.value)}
            className="w-24"
            min={1}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant={expiryUnit === "MONTH" ? "default" : "outline"}
              size="sm"
              onClick={() => setExpiryUnit("MONTH")}
              className={cn(
                expiryUnit === "MONTH" && "bg-blue-600 hover:bg-blue-700"
              )}
            >
              {ExpiryUnitLabel.MONTH}
            </Button>
            <Button
              type="button"
              variant={expiryUnit === "YEAR" ? "default" : "outline"}
              size="sm"
              onClick={() => setExpiryUnit("YEAR")}
              className={cn(
                expiryUnit === "YEAR" && "bg-blue-600 hover:bg-blue-700"
              )}
            >
              {ExpiryUnitLabel.YEAR}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
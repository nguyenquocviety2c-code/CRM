"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { warehouseSettingsSchema } from "@/lib/validations";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface WarehouseSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WarehouseSettingsDialog({ open, onOpenChange }: WarehouseSettingsDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: branchesData } = useQuery({
    queryKey: queryKeys.productCategories.list({ scope: "branches" }),
    queryFn: async () => {
      const res = await fetch("/api/supabase/branches");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return Array.isArray(json.data) ? json.data : [];
    },
  });

  const branches: Array<{ id: string; name: string }> = branchesData || [];
  const activeBranchId = branches[0]?.id || "";

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(warehouseSettingsSchema),
    defaultValues: {
      enableOutOfStockAlert: false,
      outOfStockThreshold: 0,
      enableLowStockAlert: false,
      lowStockThreshold: 0,
    },
  });

  // Fetch existing settings when the dialog opens and a branch is available.
  useEffect(() => {
    if (!open || !activeBranchId) return;
    let cancelled = false;
    fetch(`/api/supabase/warehouse/settings?branch_id=${encodeURIComponent(activeBranchId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json.ok || !json.data) return;
        const settings =
          (json.data.settings as Record<string, unknown> | undefined) ||
          (json.data as Record<string, unknown>);
        setValue("enableOutOfStockAlert", Boolean(settings.enableOutOfStockAlert ?? false));
        setValue("outOfStockThreshold", Number(settings.outOfStockThreshold ?? 0));
        setValue("enableLowStockAlert", Boolean(settings.enableLowStockAlert ?? false));
        setValue("lowStockThreshold", Number(settings.lowStockThreshold ?? 0));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, activeBranchId, setValue]);

  const onSubmit = async (data: unknown) => {
    setIsSubmitting(true);
    try {
      const formData = data as {
        enableOutOfStockAlert: boolean;
        outOfStockThreshold: number;
        enableLowStockAlert: boolean;
        lowStockThreshold: number;
      };
      const payload = {
        branch_id: activeBranchId,
        settings: {
          enableOutOfStockAlert: formData.enableOutOfStockAlert,
          outOfStockThreshold: formData.outOfStockThreshold,
          enableLowStockAlert: formData.enableLowStockAlert,
          lowStockThreshold: formData.lowStockThreshold,
        },
      };
      const res = await fetch("/api/supabase/warehouse/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      reset();
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating warehouse settings:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cài đặt thông báo hết hàng</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="enableOutOfStockAlert"
                checked={watch("enableOutOfStockAlert")}
                onCheckedChange={(checked) =>
                  setValue("enableOutOfStockAlert", checked as boolean)
                }
              />
              <Label htmlFor="enableOutOfStockAlert">
                Cho phép thông báo khi hết hàng
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="outOfStockThreshold">Ngưỡng hết hàng:</Label>
              <Input
                id="outOfStockThreshold"
                type="number"
                {...register("outOfStockThreshold", { valueAsNumber: true })}
                placeholder="Nhập số ..."
              />
              {errors.outOfStockThreshold && (
                <p className="text-sm text-red-500">
                  {errors.outOfStockThreshold.message}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="enableLowStockAlert"
                checked={watch("enableLowStockAlert")}
                onCheckedChange={(checked) =>
                  setValue("enableLowStockAlert", checked as boolean)
                }
              />
              <Label htmlFor="enableLowStockAlert">
                Cho phép thông báo khi sắp hết hàng
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lowStockThreshold">Ngưỡng sắp hết hàng:</Label>
              <Input
                id="lowStockThreshold"
                type="number"
                {...register("lowStockThreshold", { valueAsNumber: true })}
                placeholder="Nhập số ..."
              />
              {errors.lowStockThreshold && (
                <p className="text-sm text-red-500">
                  {errors.lowStockThreshold.message}
                </p>
              )}
            </div>
          </div>

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
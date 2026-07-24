"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useCashFundStore,
  useCashFundSettingsValue,
  useUpdateSetting,
} from "@/stores/cash-fund-store";
import { useToast } from "@/hooks/use-toast";

export function SettingDialog() {
  const { toast } = useToast();
  const { isSettingOpen, closeAllDialogs } = useCashFundStore();
  const { openingBalance, carryForward, isLoading } = useCashFundSettingsValue();
  const updateSetting = useUpdateSetting();

  // Local form state — adjusted during render when the server value changes
  // (mirrors the "adjusting state when a prop changes" pattern from the React
  // docs, avoiding the useEffect + setState lint rule).
  const [balance, setBalance] = useState(openingBalance);
  const [carry, setCarry] = useState(carryForward);
  const [lastSyncedOpening, setLastSyncedOpening] = useState(openingBalance);
  const [lastSyncedCarry, setLastSyncedCarry] = useState(carryForward);
  const [submitting, setSubmitting] = useState(false);

  if (openingBalance !== lastSyncedOpening) {
    setLastSyncedOpening(openingBalance);
    setBalance(openingBalance);
  }
  if (carryForward !== lastSyncedCarry) {
    setLastSyncedCarry(carryForward);
    setCarry(carryForward);
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await updateSetting(balance, carry);
      toast({
        title: "Thành công",
        description: "Cập nhật số quỹ thành công",
      });
      closeAllDialogs();
    } catch (err) {
      toast({
        title: "Lỗi",
        description: err instanceof Error ? err.message : "Cập nhật thất bại",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isSettingOpen}
      onOpenChange={(open) => !open && closeAllDialogs()}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cài đặt số quỹ (Chi nhánh)</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Opening Balance */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Tiền quỹ đầu ngày:</label>
              <div className="flex-1 relative">
                <Input
                  type="number"
                  value={balance}
                  onChange={(e) => setBalance(Number(e.target.value))}
                  className="pr-10"
                  disabled={isLoading || submitting}
                />
                <Info className="h-4 w-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          {/* Carry Forward */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="carryForward"
              checked={carry}
              onCheckedChange={(checked) => setCarry(checked as boolean)}
              disabled={isLoading || submitting}
            />
            <label
              htmlFor="carryForward"
              className="text-sm font-medium cursor-pointer"
            >
              Quỹ cộng dồn cho ngày kế tiếp
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={closeAllDialogs} disabled={submitting}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || submitting}>
            {submitting ? "Đang lưu..." : "OK"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSettingStore,
  StaffStatusOptions,
} from "@/stores/setting-store";
import { useToast } from "@/hooks/use-toast";

interface ShiftFormState {
  name: string;
  workStart: string;
  workEnd: string;
  checkInStart: string;
  checkInEnd: string;
  note: string;
  isDefault: boolean;
  status: string;
}

const initialState: ShiftFormState = {
  name: "",
  workStart: "08:00",
  workEnd: "17:00",
  checkInStart: "08:00",
  checkInEnd: "17:00",
  note: "",
  isDefault: false,
  status: "active",
};

function ShiftFormBody({ onClose }: { onClose: () => void }) {
  const {
    shiftDialog,
    selectedShiftId,
    shifts,
    createShift,
    updateShift,
  } = useSettingStore();
  const { toast } = useToast();
  const isEdit = shiftDialog === "edit";
  const existing = shifts.find((s) => s.id === selectedShiftId);

  const [form, setForm] = useState<ShiftFormState>(() => {
    if (isEdit && existing) {
      return {
        name: existing.name,
        workStart: existing.workStart,
        workEnd: existing.workEnd,
        checkInStart: existing.checkInStart,
        checkInEnd: existing.checkInEnd,
        note: existing.note,
        isDefault: existing.isDefault,
        status: existing.status,
      };
    }
    return initialState;
  });

  const update = <K extends keyof ShiftFormState>(
    key: K,
    value: ShiftFormState[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập tên ca làm việc",
        variant: "destructive",
      });
      return;
    }
    if (!form.workStart || !form.workEnd) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập thời gian ca làm việc",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      name: form.name.trim(),
      workStart: form.workStart,
      workEnd: form.workEnd,
      checkInStart: form.checkInStart,
      checkInEnd: form.checkInEnd,
      note: form.note,
      isDefault: form.isDefault,
      status: form.status as "active" | "inactive",
    };

    const res = isEdit
      ? await updateShift(selectedShiftId ?? "", payload)
      : await createShift(payload);

    if (!res.ok) {
      toast({
        title: isEdit ? "Không thể cập nhật ca làm việc" : "Không thể tạo mới ca làm việc",
        description: res.error || form.name,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: isEdit ? "Đã cập nhật ca làm việc" : "Đã tạo mới ca làm việc",
      description: `${form.name} · ${form.workStart} - ${form.workEnd}`,
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle className="text-lg font-semibold text-gray-900">
          {isEdit ? "Cập nhật ca làm việc" : "Tạo mới ca làm việc"}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {/* Name */}
        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">
            <span className="text-red-500">*</span> Tên ca làm việc:
          </Label>
          <Input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Nhập tên ca làm việc"
            className="h-9"
            autoFocus
          />
        </div>

        {/* Work time range */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">
              <span className="text-red-500">*</span> Giờ bắt đầu ca:
            </Label>
            <div className="relative flex h-9 items-center">
              <Input
                type="time"
                value={form.workStart}
                onChange={(e) => update("workStart", e.target.value)}
                className="h-9 pr-8"
              />
              <Clock className="pointer-events-none absolute right-2 h-4 w-4 text-gray-400" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">
              <span className="text-red-500">*</span> Giờ kết thúc ca:
            </Label>
            <div className="relative flex h-9 items-center">
              <Input
                type="time"
                value={form.workEnd}
                onChange={(e) => update("workEnd", e.target.value)}
                className="h-9 pr-8"
              />
              <Clock className="pointer-events-none absolute right-2 h-4 w-4 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Check-in time range */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">
              Giờ bắt đầu chấm công:
            </Label>
            <div className="relative flex h-9 items-center">
              <Input
                type="time"
                value={form.checkInStart}
                onChange={(e) => update("checkInStart", e.target.value)}
                className="h-9 pr-8"
              />
              <Clock className="pointer-events-none absolute right-2 h-4 w-4 text-gray-400" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">
              Giờ kết thúc chấm công:
            </Label>
            <div className="relative flex h-9 items-center">
              <Input
                type="time"
                value={form.checkInEnd}
                onChange={(e) => update("checkInEnd", e.target.value)}
                className="h-9 pr-8"
              />
              <Clock className="pointer-events-none absolute right-2 h-4 w-4 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">Ghi chú:</Label>
          <Textarea
            value={form.note}
            onChange={(e) => update("note", e.target.value)}
            placeholder="Nhập ghi chú..."
            className="min-h-20"
          />
        </div>

        {/* Default + Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="shift-default"
              checked={form.isDefault}
              onCheckedChange={(v) => update("isDefault", v === true)}
            />
            <Label
              htmlFor="shift-default"
              className="cursor-pointer text-sm font-normal text-gray-700"
            >
              Đặt làm ca mặc định
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">Trạng thái:</Label>
            <Select
              value={form.status}
              onValueChange={(v) => update("status", v)}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Chọn trạng thái" />
              </SelectTrigger>
              <SelectContent>
                {StaffStatusOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button
          onClick={handleSubmit}
          className="bg-sky-500 text-white hover:bg-sky-600"
        >
          OK
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function ShiftCreateDialog() {
  const { shiftDialog, closeShiftDialog, selectedShiftId } = useSettingStore();
  const open = shiftDialog !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeShiftDialog()}>
      {open && (
        <ShiftFormBody
          key={`${shiftDialog}-${selectedShiftId ?? "new"}`}
          onClose={closeShiftDialog}
        />
      )}
    </Dialog>
  );
}

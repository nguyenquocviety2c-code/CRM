"use client";

import { useState } from "react";
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
  useWorkerManagerStore,
  mockPayrollEmployees,
} from "@/stores/worker-manager-store";
import { useToast } from "@/hooks/use-toast";
import { DateRangePicker } from "@/components/shared/date-range-picker";

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function LeaveFormBody({
  employeeName,
  onClose,
}: {
  employeeName: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [leaveDays, setLeaveDays] = useState("1");
  const [note, setNote] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [unpaid, setUnpaid] = useState(false);
  const [withoutPermission, setWithoutPermission] = useState(false);

  const handleSubmit = () => {
    toast({
      title: "Đã ghi nhận ngày nghỉ",
      description: `${employeeName}: ${leaveDays} ngày${
        halfDay ? " (nửa ngày)" : ""
      }${unpaid ? " · không lương" : ""}${
        withoutPermission ? " · không xin phép" : ""
      }`,
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle className="text-lg font-semibold text-gray-900">
          Nghỉ
          <span className="ml-2 text-sm font-normal text-gray-500">
            · {employeeName}
          </span>
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {/* Ngày nghỉ — date range (single dual-calendar picker) */}
        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">
            <span className="text-red-500">*</span> Ngày nghỉ:
          </Label>
          <DateRangePicker
            dateFrom={startDate}
            dateTo={endDate}
            onChange={(from, to) => {
              setStartDate(from);
              setEndDate(to);
            }}
          />
        </div>

        {/* Nghỉ nửa ngày */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="leave-half-day"
            checked={halfDay}
            onCheckedChange={(v) => setHalfDay(v === true)}
          />
          <Label
            htmlFor="leave-half-day"
            className="cursor-pointer text-sm font-normal text-gray-700"
          >
            Nghỉ nửa ngày
          </Label>
        </div>

        {/* Số lượng ngày nghỉ */}
        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">
            Số lượng ngày nghỉ:
          </Label>
          <Input
            value={leaveDays}
            onChange={(e) => setLeaveDays(e.target.value)}
            className="h-9"
            inputMode="numeric"
          />
        </div>

        {/* Ghi chú */}
        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">Ghi chú:</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Lý do nghỉ..."
            className="min-h-20"
          />
        </div>

        {/* Nghỉ không lương */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="leave-unpaid"
            checked={unpaid}
            onCheckedChange={(v) => setUnpaid(v === true)}
          />
          <Label
            htmlFor="leave-unpaid"
            className="cursor-pointer text-sm font-normal text-gray-700"
          >
            Nghỉ không lương
          </Label>
        </div>

        {/* Nghỉ không xin phép */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="leave-without-permission"
            checked={withoutPermission}
            onCheckedChange={(v) => setWithoutPermission(v === true)}
          />
          <Label
            htmlFor="leave-without-permission"
            className="cursor-pointer text-sm font-normal text-gray-700"
          >
            Nghỉ không xin phép
          </Label>
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

export function LeaveDialog() {
  const { dialog, selectedEmployeeId, closeDialog } = useWorkerManagerStore();
  const open = dialog === "leave";

  const employee = mockPayrollEmployees.find(
    (e) => e.id === selectedEmployeeId
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeDialog()}>
      {open && (
        <LeaveFormBody
          key={selectedEmployeeId ?? "new"}
          employeeName={employee?.name ?? "Nhân viên"}
          onClose={closeDialog}
        />
      )}
    </Dialog>
  );
}

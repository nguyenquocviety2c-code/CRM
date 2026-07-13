"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useWorkerManagerStore,
  PaymentType,
  PaymentTypeLabel,
  PaymentMethodOptions,
} from "@/stores/worker-manager-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PAYMENT_TABS: PaymentType[] = [
  "advance",
  "salary",
  "salary_remain",
  "salary_bonus",
];

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function currentPayPeriod(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function formatVnd(n: number): string {
  return n.toLocaleString("vi-VN");
}

const SALARY_BASE = 8000000; // mock monthly salary

function PaymentFormBody({
  employeeName,
  onClose,
}: {
  employeeName: string;
  onClose: () => void;
}) {
  const { paymentType, selectedEmployeeId, openDialog } = useWorkerManagerStore();
  const { toast } = useToast();

  // The "Trả lương" tab has 2 extra fields: Kỳ lương + Còn lại
  const isSalaryTab = paymentType === "salary";

  const [payPeriod, setPayPeriod] = useState(currentPayPeriod());
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState("0");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());

  // Compute "Còn lại" (remaining) = salary base - amount paid (mock logic)
  const amountNum = parseInt(amount.replace(/[^\d]/g, ""), 10) || 0;
  const remainNum = Math.max(SALARY_BASE - amountNum, 0);

  const handleSubmit = () => {
    if (amountNum <= 0) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập số tiền hợp lệ",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Đã ghi nhận thanh toán",
      description: `${employeeName} · ${PaymentTypeLabel[paymentType]} · ${formatVnd(
        amountNum
      )} đ · ${PaymentMethodOptions.find((m) => m.value === method)?.label}`,
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle className="text-lg font-semibold text-gray-900">
          Thanh toán
          <span className="ml-2 text-sm font-normal text-gray-500">
            · {employeeName}
          </span>
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {/* Loại — payment type tabs */}
        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">Loại:</Label>
          <div className="flex flex-wrap gap-1 rounded-none border border-gray-200 bg-gray-50 p-1">
            {PAYMENT_TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  openDialog("payment", selectedEmployeeId ?? "", t)
                }
                className={cn(
                  "flex-1 px-3 py-1.5 text-sm font-medium transition-colors",
                  paymentType === t
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                )}
              >
                {PaymentTypeLabel[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Kỳ lương — only for Trả lương */}
        {isSalaryTab && (
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">Kỳ lương:</Label>
            <div className="relative flex h-9 items-center">
              <Input
                value={payPeriod}
                onChange={(e) => setPayPeriod(e.target.value)}
                className="h-9 pr-8"
                placeholder="MM-YYYY"
              />
              <Calendar className="pointer-events-none absolute right-2 h-4 w-4 text-gray-400" />
            </div>
          </div>
        )}

        {/* Phương thức */}
        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">
            <span className="text-red-500">*</span> Phương thức:
          </Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Chọn phương thức" />
            </SelectTrigger>
            <SelectContent>
              {PaymentMethodOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Số tiền */}
        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">
            <span className="text-red-500">*</span> Số tiền:
          </Label>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Nhập số tiền"
            className="h-9 text-sky-600"
            inputMode="numeric"
          />
        </div>

        {/* Còn lại — only for Trả lương */}
        {isSalaryTab && (
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">Còn lại:</Label>
            <Input
              value={formatVnd(remainNum)}
              readOnly
              className="h-9 bg-gray-50 text-gray-600"
            />
            <p className="text-xs text-gray-400">
              Số này sẽ được tính vào lương tồn
            </p>
          </div>
        )}

        {/* Ghi chú */}
        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">Ghi chú:</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nhập ghi chú"
            className="min-h-20"
          />
        </div>

        {/* Thời gian */}
        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">Thời gian:</Label>
          <div className="relative flex h-9 items-center">
            <Input
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 pr-8"
              placeholder="dd/mm/yyyy"
            />
            <Calendar className="pointer-events-none absolute right-2 h-4 w-4 text-gray-400" />
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

export function PaymentDialog() {
  const { dialog, selectedEmployeeId, paymentType, closeDialog, payrollEmployees } =
    useWorkerManagerStore();
  const open = dialog === "payment";

  const employee = payrollEmployees.find(
    (e) => e.id === selectedEmployeeId
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeDialog()}>
      {open && (
        <PaymentFormBody
          // remount when employee OR payment type changes — fresh form state
          key={`${selectedEmployeeId ?? "new"}-${paymentType}`}
          employeeName={employee?.name ?? "Nhân viên"}
          onClose={closeDialog}
        />
      )}
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Calendar, Minus, Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useWorkerManagerStore,
  mockPayrollEmployees,
} from "@/stores/worker-manager-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type RewardPenaltyType = "reward" | "penalty";

interface HistoryEntry {
  id: string;
  type: RewardPenaltyType;
  amount: number;
  reason: string;
  date: string;
  note?: string;
}

const ReasonOptions: Record<RewardPenaltyType, string[]> = {
  reward: [
    "Làm thêm giờ",
    "Hoàn thành xuất sắc",
    "Khách hài lòng",
    "Đạt chỉ tiêu",
    "Khác",
  ],
  penalty: [
    "Đi trễ",
    "Nghỉ không phép",
    "Lỗi nghiệp vụ",
    "Khách phàn nàn",
    "Khác",
  ],
};

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatVnd(n: number): string {
  return n.toLocaleString("vi-VN") + " đ";
}

const initialHistory: HistoryEntry[] = [
  {
    id: "h1",
    type: "reward",
    amount: 200000,
    reason: "Khách hài lòng",
    date: "15/06/2026",
  },
  {
    id: "h2",
    type: "penalty",
    amount: 50000,
    reason: "Đi trễ",
    date: "10/06/2026",
    note: "Trễ 15 phút",
  },
];

function RewardPenaltyFormBody({
  employeeName,
  onClose,
}: {
  employeeName: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<RewardPenaltyType>("reward");
  const [amount, setAmount] = useState("0");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);

  const totalReward = history
    .filter((h) => h.type === "reward")
    .reduce((s, h) => s + h.amount, 0);
  const totalPenalty = history
    .filter((h) => h.type === "penalty")
    .reduce((s, h) => s + h.amount, 0);

  const handleAdd = () => {
    const amt = parseInt(amount.replace(/[^\d]/g, ""), 10) || 0;
    if (amt <= 0) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập số tiền hợp lệ",
        variant: "destructive",
      });
      return;
    }
    const entry: HistoryEntry = {
      id: `h${Date.now()}`,
      type,
      amount: amt,
      reason: reason || "Khác",
      date,
      note: note || undefined,
    };
    setHistory((prev) => [entry, ...prev]);
    setAmount("0");
    setReason("");
    setNote("");
    toast({
      title: type === "reward" ? "Đã thêm thưởng" : "Đã thêm phạt",
      description: `${employeeName}: ${formatVnd(amt)} · ${entry.reason}`,
    });
  };

  const handleDelete = (id: string) => {
    setHistory((prev) => prev.filter((h) => h.id !== id));
  };

  const handleSave = () => {
    toast({
      title: "Đã lưu thay đổi",
      description: `Cập nhật thưởng/phạt cho ${employeeName}`,
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[640px]">
      <DialogHeader>
        <DialogTitle className="text-lg font-semibold text-gray-900">
          Thưởng / Phạt
          <span className="ml-2 text-sm font-normal text-gray-500">
            · {employeeName}
          </span>
        </DialogTitle>
      </DialogHeader>

      {/* Form add */}
      <div className="space-y-4 rounded-none border border-gray-200 bg-gray-50/50 p-4">
        {/* Type toggle */}
        <div className="space-y-1.5">
          <Label className="text-sm text-gray-700">
            <span className="text-red-500">*</span> Loại:
          </Label>
          <div className="inline-flex rounded-none border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setType("reward")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition-colors",
                type === "reward"
                  ? "bg-emerald-500 text-white"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              Thưởng
            </button>
            <button
              type="button"
              onClick={() => setType("penalty")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition-colors",
                type === "penalty"
                  ? "bg-red-500 text-white"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <Minus className="h-3.5 w-3.5" />
              Phạt
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Số tiền */}
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">
              <span className="text-red-500">*</span> Số tiền:
            </Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Nhập số tiền"
              className="h-9"
              inputMode="numeric"
            />
          </div>

          {/* Lý do */}
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">Lý do:</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Chọn lý do" />
              </SelectTrigger>
              <SelectContent>
                {ReasonOptions[type].map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          {/* Ghi chú */}
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">Ghi chú:</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nhập ghi chú"
              className="h-9"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleAdd}
            variant="outline"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Thêm
          </Button>
        </div>
      </div>

      {/* History table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-800">
            Lịch sử thưởng / phạt
          </h4>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-emerald-700">
              Tổng thưởng: <strong>{formatVnd(totalReward)}</strong>
            </span>
            <span className="text-red-700">
              Tổng phạt: <strong>{formatVnd(totalPenalty)}</strong>
            </span>
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto rounded-none border border-gray-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2 font-medium">Loại</th>
                <th className="px-3 py-2 text-right font-medium">Số tiền</th>
                <th className="px-3 py-2 font-medium">Lý do</th>
                <th className="px-3 py-2 font-medium">Thời gian</th>
                <th className="px-3 py-2 font-medium">Ghi chú</th>
                <th className="px-3 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-xs text-gray-400"
                  >
                    Chưa có thưởng/phạt
                  </td>
                </tr>
              )}
              {history.map((h) => (
                <tr
                  key={h.id}
                  className="border-t border-gray-100 hover:bg-gray-50/50"
                >
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium",
                        h.type === "reward"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      )}
                    >
                      {h.type === "reward" ? (
                        <Plus className="h-3 w-3" />
                      ) : (
                        <Minus className="h-3 w-3" />
                      )}
                      {h.type === "reward" ? "Thưởng" : "Phạt"}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-medium",
                      h.type === "reward"
                        ? "text-emerald-700"
                        : "text-red-700"
                    )}
                  >
                    {formatVnd(h.amount)}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{h.reason}</td>
                  <td className="px-3 py-2 text-gray-600">{h.date}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {h.note || "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(h.id)}
                      className="text-gray-400 hover:text-red-600"
                      title="Xóa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button
          onClick={handleSave}
          className="bg-sky-500 text-white hover:bg-sky-600"
        >
          OK
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function RewardPenaltyDialog() {
  const { dialog, selectedEmployeeId, closeDialog } = useWorkerManagerStore();
  const open = dialog === "reward-penalty";

  const employee = mockPayrollEmployees.find(
    (e) => e.id === selectedEmployeeId
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeDialog()}>
      {open && (
        <RewardPenaltyFormBody
          key={selectedEmployeeId ?? "new"}
          employeeName={employee?.name ?? "Nhân viên"}
          onClose={closeDialog}
        />
      )}
    </Dialog>
  );
}

"use client";

import { useMemo, useEffect } from "react";
import { Download, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useWorkerManagerStore,
} from "@/stores/worker-manager-store";
import { useBranchStore } from "@/stores/branch-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/shared/date-range-picker";

export function PayrollView() {
  const {
    searchKeyword,
    setSearchKeyword,
    openDialog,
    payrollEmployees,
    salaryDateFrom,
    salaryDateTo,
    setSalaryDateRange,
    fetchStaffTips,
  } = useWorkerManagerStore();
  const { selectedBranchId } = useBranchStore();
  const { toast } = useToast();

  // Fetch staff tips whenever the date range or branch changes.
  useEffect(() => {
    void fetchStaffTips(selectedBranchId);
  }, [fetchStaffTips, selectedBranchId, salaryDateFrom, salaryDateTo]);

  const filteredEmployees = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return payrollEmployees;
    return payrollEmployees.filter((e) =>
      e.name.toLowerCase().includes(kw)
    );
  }, [searchKeyword, payrollEmployees]);

  const handleExport = () => {
    toast({
      title: "Xuất tổng hợp",
      description: "Đang chuẩn bị file Excel tổng hợp lương...",
    });
  };

  const handleSettings = () => {
    toast({
      title: "Cài đặt lương",
      description: "Mở cấu hình lương nhân viên",
    });
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex h-9 w-64 items-center">
          <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-gray-400" />
          <Input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="Tìm kiếm nhân viên..."
            className="h-9 pl-8"
          />
        </div>

        {/* Date range picker (từ ngày - đến ngày) */}
        <DateRangePicker
          dateFrom={salaryDateFrom}
          dateTo={salaryDateTo}
          onChange={(from, to) => setSalaryDateRange(from, to)}
        />

        {/* Export summary */}
        <Button variant="outline" className="gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" />
          Xuất tổng hợp
        </Button>

        {/* Salary settings */}
        <Button variant="outline" className="gap-2" onClick={handleSettings}>
          <Settings className="h-4 w-4" />
          Cài đặt lương
        </Button>
      </div>

      {/* Payroll table */}
      <div className="overflow-hidden rounded-none border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead className="h-10 px-4 text-sm font-semibold text-gray-700">
                Tên nhân viên
              </TableHead>
              <TableHead className="h-10 px-4 text-center text-sm font-semibold text-gray-700">
                Nghỉ có phép
              </TableHead>
              <TableHead className="h-10 px-4 text-center text-sm font-semibold text-gray-700">
                Nghỉ không phép
              </TableHead>
              <TableHead className="h-10 px-4 text-right text-sm font-semibold text-gray-700">
                Thưởng
              </TableHead>
              <TableHead className="h-10 px-4 text-right text-sm font-semibold text-gray-700">
                Hành động
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-12 text-center text-sm text-gray-400"
                >
                  Không tìm thấy nhân viên phù hợp
                </TableCell>
              </TableRow>
            )}
            {filteredEmployees.map((emp) => (
              <TableRow
                key={emp.id}
                className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-sky-50/40"
              >
                <TableCell className="px-4 py-3">
                  <span className="text-sm font-medium text-sky-600 hover:underline">
                    {emp.name}
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3 text-center text-sm text-gray-700">
                  {emp.paidLeave}
                </TableCell>
                <TableCell className="px-4 py-3 text-center text-sm text-gray-700">
                  {emp.unpaidLeave}
                </TableCell>
                <TableCell className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                  {formatTip(emp.tip)}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <ActionButton
                      label="Nghỉ"
                      onClick={() => openDialog("leave", emp.id)}
                    />
                    <ActionButton
                      label="Thưởng/phạt"
                      onClick={() => openDialog("reward-penalty", emp.id)}
                    />
                    <ActionButton
                      label="Thanh toán"
                      onClick={() =>
                        openDialog("payment", emp.id, "advance")
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Format a tip amount as VND. 0 → "0".
function formatTip(tip?: number): string {
  const n = Number(tip || 0);
  return new Intl.NumberFormat("vi-VN").format(n);
}

function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "h-7 rounded-none px-2.5 text-xs font-medium text-sky-600 transition-colors",
        "hover:bg-sky-100 hover:text-sky-700"
      )}
    >
      {label}
    </button>
  );
}

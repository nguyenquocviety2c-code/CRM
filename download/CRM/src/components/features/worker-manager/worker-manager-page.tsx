"use client";

import { useEffect } from "react";
import { Clock, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkerManagerStore } from "@/stores/worker-manager-store";
import { useToast } from "@/hooks/use-toast";
import {
  AttendanceViewMode,
  AttendanceViewModeLabel,
  AttendanceStatusFilterOptions,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { AttendanceCustomView } from "./attendance-custom-view";
import { AttendanceOverviewView } from "./attendance-overview-view";
import { PayrollView } from "./payroll-view";
import { LeaveDialog } from "./leave-dialog";
import { RewardPenaltyDialog } from "./reward-penalty-dialog";
import { PaymentDialog } from "./payment-dialog";
import { BranchSelector } from "@/components/layout/branch-selector";
import { useBranchStore } from "@/stores/branch-store";

const viewModes: AttendanceViewMode[] = ["custom", "overview"];

export function WorkerManagerPage() {
  const {
    activeTab,
    setActiveTab,
    view,
    setView,
    date,
    setDate,
    status,
    setStatus,
    fetchPayrollEmployees,
    fetchAttendance,
    fetchPayrollPayments,
  } = useWorkerManagerStore();
  const { toast } = useToast();
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);

  // Initial load: fetch payroll employees (staff list), attendance for the
  // current month, and payroll payments. Attendance is re-fetched whenever the
  // date or status filter changes (handled by the dependency array below).
  useEffect(() => {
    fetchPayrollEmployees(selectedBranchId);
    fetchPayrollPayments(undefined, undefined, undefined, selectedBranchId);
  }, [fetchPayrollEmployees, fetchPayrollPayments, selectedBranchId]);

  useEffect(() => {
    fetchAttendance(date, status, selectedBranchId);
  }, [date, status, fetchAttendance, selectedBranchId]);

  const handleHistory = () => {
    toast({
      title: "Thông báo",
      description: "Lịch sử thao tác sẽ khả dụng ở giai đoạn sau",
    });
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-slate-900">Quản lý nhân viên</h1>
        </div>
        <BranchSelector />
      </div>

      {/* Sub-nav tabs: Chấm công / Quản lý lương */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("time-sheet")}
            className={cn(
              "rounded-t-lg px-4 py-2 text-sm font-medium transition-colors",
              activeTab === "time-sheet"
                ? "border-b-2 border-sky-500 text-sky-600"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            Chấm công
          </button>
          <button
            onClick={() => setActiveTab("salary")}
            className={cn(
              "rounded-t-lg px-4 py-2 text-sm font-medium transition-colors",
              activeTab === "salary"
                ? "border-b-2 border-sky-500 text-sky-600"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            Quản lý lương
          </button>
        </div>
      </div>

      {activeTab === "time-sheet" && (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            {/* View-mode toggle: Tùy chỉnh / Tổng quan */}
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-1">
              {viewModes.map((mode) => (
                <button
                  key={mode}
                  onClick={() => setView(mode)}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                    view === mode
                      ? "bg-sky-500 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  {AttendanceViewModeLabel[mode]}
                </button>
              ))}
            </div>

            {/* Date picker (MM/YYYY) */}
            <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
              <Clock className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="MM/YYYY"
                className="w-20 bg-transparent text-sm outline-none"
              />
            </div>

            {/* Status filter */}
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                {AttendanceStatusFilterOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Action button: Lịch sử thao tác */}
            <Button variant="outline" className="gap-2" onClick={handleHistory}>
              <History className="h-4 w-4" />
              Lịch sử thao tác
            </Button>
          </div>

          {/* View content */}
          {view === "custom" && <AttendanceCustomView />}
          {view === "overview" && <AttendanceOverviewView />}
        </>
      )}

      {activeTab === "salary" && <PayrollView />}

      {/* Dialogs (salary tab) */}
      <LeaveDialog />
      <RewardPenaltyDialog />
      <PaymentDialog />
    </div>
  );
}

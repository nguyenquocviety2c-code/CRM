"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { List, Clock, ChevronDown, Columns3, ArrowUpDown } from "lucide-react";
import { BookingViewMode, DateNav } from "@/stores/booking-store";
import { useBranchStore } from "@/stores/branch-store";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { format as fmtDate } from "date-fns";
import { cn } from "@/lib/utils";

/** Status options for the staff-view "Tất cả lịch hẹn" dropdown. "Đã thanh
 *  toán" maps to the `checkout` status (a booking auto-transitions to checkout
 *  once its invoice is paid). */
const staffStatusOptions = [
  { value: "all", label: "Tất cả lịch hẹn" },
  { value: "confirmed", label: "Đã xác nhận" },
  { value: "checkin", label: "Đã checkin" },
  { value: "checkout", label: "Đã thanh toán" },
  { value: "cancelled", label: "Đã hủy" },
] as const;

interface Staff {
  id: string;
  name: string;
}

interface BookingFilterProps {
  staffId: string | null;
  onStaffChange: (staffId: string | null) => void;
  viewMode: BookingViewMode;
  onViewModeChange: (mode: BookingViewMode) => void;
  dateNav: DateNav;
  onDateNavChange: (nav: DateNav) => void;
  dateRange: { from: Date; to: Date };
  onDateRangeChange: (range: { from: Date; to: Date }) => void;
  staffSearch: string;
  onStaffSearchChange: (search: string) => void;
  branchFilter: string | null;
  onBranchFilterChange: (id: string | null) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  /** Status filter (staff view) — null = all statuses. */
  statusFilter?: string | null;
  onStatusFilterChange?: (status: string | null) => void;
  // List/calendar view toggle + column visibility (for customer view).
  listViewMode?: "list" | "calendar";
  onListViewModeChange?: (mode: "list" | "calendar") => void;
  visibleColumns?: Record<string, boolean>;
  onToggleColumn?: (key: string) => void;
  columnDefs?: Array<{ key: string; label: string }>;
  /** When true, the logged-in staff has the `reorder_staff` permission → show
   *  the "Sắp xếp" button next to the staff filter. */
  canReorderStaff?: boolean;
  /** Called when the user clicks "Sắp xếp" — opens the drag-to-reorder dialog. */
  onReorderStaff?: () => void;
}

export function BookingFilter({
  staffId,
  onStaffChange,
  viewMode,
  onViewModeChange,
  dateNav,
  onDateNavChange,
  dateRange,
  onDateRangeChange,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  listViewMode = "list",
  onListViewModeChange,
  visibleColumns,
  onToggleColumn,
  columnDefs,
  canReorderStaff,
  onReorderStaff,
}: BookingFilterProps) {
  const { selectedBranchId } = useBranchStore();

  // Fetch staff from Supabase — filtered by selected branch + hairdresser groups
  const { data: staffData } = useQuery({
    queryKey: ["booking-staff", selectedBranchId],
    queryFn: async () => {
      if (!selectedBranchId) return [];
      const res = await fetch(
        `/api/supabase/staff?branch_id=${selectedBranchId}&active=true&limit=200`
      );
      const json = await res.json();
      if (!json.ok) return [];
      // Filter to only hairdresser groups: Artist, Creative Director, Master, Junior
      const hairdresserGroups = [
        "Artist",
        "Creative Director",
        "Master",
        "Junior",
      ];
      return (json.data as Array<Record<string, unknown>>)
        .filter((s) => {
          const groupName = (s.group as { name?: string } | null)?.name;
          return groupName && hairdresserGroups.includes(groupName);
        })
        .map((s) => ({ id: s.id as string, name: s.name as string }));
    },
  });

  const staffList: Staff[] = staffData || [];


  return (
    <div className="mb-4 space-y-3 rounded-lg border bg-white p-3">
      {/* Top row: Date nav (Hôm nay + Ngày mai + from/to date pickers) on left, View toggle on right */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={dateNav === "today" ? "default" : "outline"}
            size="sm"
            onClick={() => onDateNavChange("today")}
            className={dateNav === "today" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-white"}
          >
            Hôm nay
          </Button>
          <Button
            variant={dateNav === "tomorrow" ? "default" : "outline"}
            size="sm"
            onClick={() => onDateNavChange("tomorrow")}
            className={dateNav === "tomorrow" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-white"}
          >
            Ngày mai
          </Button>
          <Button
            variant={dateNav === "7days" ? "default" : "outline"}
            size="sm"
            onClick={() => onDateNavChange("7days")}
            className={dateNav === "7days" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-white"}
          >
            7 ngày
          </Button>
          {/* From/To date range — a single dual-calendar picker. The store works
              with Date objects (to = end-of-day), so convert dd/MM/yyyy ↔ Date. */}
          <DateRangePicker
            size="sm"
            dateFrom={fmtDate(dateRange.from, "dd/MM/yyyy")}
            dateTo={fmtDate(dateRange.to, "dd/MM/yyyy")}
            lockEndBeforeStart
            onChange={(from, to) => {
              // "dd/MM/yyyy" → Date (start = 00:00, end = 23:59:59.999).
              const [d1, m1, y1] = from.split("/").map(Number);
              const [d2, m2, y2] = to.split("/").map(Number);
              const f = new Date(y1, m1 - 1, d1);
              const t = new Date(y2, m2 - 1, d2);
              t.setHours(23, 59, 59, 999);
              onDateRangeChange({ from: f, to: t });
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle: customer / staff. h-9 (→ 28px via globals.css) matches
              the "Tạo mới" button height so the two View buttons line up. */}
          <div className="flex rounded-lg border">
            <button
              onClick={() => onViewModeChange("customer")}
              className={`h-9 rounded-l-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "customer"
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              View khách hàng
            </button>
            <button
              onClick={() => onViewModeChange("staff")}
              className={`h-9 rounded-r-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "staff"
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              View nhân viên
            </button>
          </div>
        </div>
      </div>

      {/* Second row: search + staff + list/calendar toggle — all on left */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 flex-wrap">
          {viewMode === "customer" && (
            <>
              {/* Search by name/phone */}
              <Input
                placeholder="Tìm theo tên hoặc sđt..."
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                className="w-[200px]"
              />

              {/* Staff filter — hairdressers from selected branch */}
              <Select
                value={staffId || "all"}
                onValueChange={(value) =>
                  onStaffChange(value === "all" ? null : value)
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tất cả nhân viên" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả nhân viên</SelectItem>
                  {staffList.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* "Sắp xếp" — opens the drag-to-reorder dialog. Placed next to the
                  staff filter so it's discoverable in both views. Only shown when
                  the logged-in staff has the reorder_staff permission. */}
              {canReorderStaff && onReorderStaff && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-9"
                  onClick={onReorderStaff}
                  title="Sắp xếp thứ tự nhân viên"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  Sắp xếp
                </Button>
              )}

              {/* Danh sách / Khung giờ dropdown — same row as search + staff */}
              {onListViewModeChange && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 h-9">
                      {listViewMode === "list" ? <List className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      {listViewMode === "list" ? "Danh sách" : "Khung giờ"}
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => onListViewModeChange("list")} className="cursor-pointer">
                      <List className="mr-2 h-4 w-4" /> Danh sách
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onListViewModeChange("calendar")} className="cursor-pointer">
                      <Clock className="mr-2 h-4 w-4" /> Khung giờ
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Column visibility toggle — same row, only in list view */}
              {listViewMode === "list" && onToggleColumn && columnDefs && visibleColumns && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 h-9">
                      <Columns3 className="h-4 w-4" />
                      Cột
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <div className="px-2 py-1.5 text-xs font-medium text-gray-500">Hiển thị cột</div>
                    {columnDefs.map((col) => (
                      <DropdownMenuItem
                        key={col.key}
                        onClick={(e) => { e.preventDefault(); onToggleColumn(col.key); }}
                        className="cursor-pointer"
                      >
                        <Checkbox
                          checked={visibleColumns[col.key]}
                          onCheckedChange={() => onToggleColumn(col.key)}
                          className="mr-2 h-4 w-4"
                        />
                        <span className="text-sm">{col.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}

          {viewMode === "staff" && (
            <>
              {/* Status filter — Tất cả lịch hẹn / Đã xác nhận / Đã checkin /
                  Đã thanh toán / Đã hủy. A dropdown button (not a free Select)
                  so the user picks one status at a time. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-9 w-[160px] justify-between">
                    {statusFilter
                      ? staffStatusOptions.find((o) => o.value === statusFilter)?.label || "Tất cả lịch hẹn"
                      : "Tất cả lịch hẹn"}
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {staffStatusOptions.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onClick={() => onStatusFilterChange?.(opt.value === "all" ? null : opt.value)}
                      className={cn("cursor-pointer text-xs", (statusFilter || null) === (opt.value === "all" ? null : opt.value) && "font-bold")}
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Staff picker — a dropdown button that opens a list of staff to
                  select (replaces the free-text "Nhập hoặc chọn nhân viên" box).
                  Selecting a staff filters bookings to that staff's appointments. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-9 w-[200px] justify-between">
                    <span className="truncate">
                      {staffId ? (staffList.find((s) => s.id === staffId)?.name || "Nhân viên") : "Tất cả nhân viên"}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                  <DropdownMenuItem
                    onClick={() => onStaffChange(null)}
                    className={cn("cursor-pointer text-xs", !staffId && "font-bold")}
                  >
                    Tất cả nhân viên
                  </DropdownMenuItem>
                  {staffList.map((staff) => (
                    <DropdownMenuItem
                      key={staff.id}
                      onClick={() => onStaffChange(staff.id)}
                      className={cn("cursor-pointer text-xs", staffId === staff.id && "font-bold")}
                    >
                      {staff.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* "Sắp xếp" — same button, shown in staff view too. */}
              {canReorderStaff && onReorderStaff && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-9"
                  onClick={onReorderStaff}
                  title="Sắp xếp thứ tự nhân viên"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  Sắp xếp
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

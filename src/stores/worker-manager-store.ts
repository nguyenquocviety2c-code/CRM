import { create } from "zustand";
import type {
  AttendanceViewMode,
  AttendancePeriodMode,
} from "@/lib/constants";
import { localDayStartUtc, localDayEndUtc } from "@/lib/utils";

// ============================================
// Salary Tab — Payment dialog type
// ============================================
export type PaymentType =
  | "advance" // Tạm ứng
  | "salary" // Trả lương
  | "salary_remain" // Trả lương tồn
  | "salary_bonus"; // Trả thưởng DT

export const PaymentTypeLabel: Record<PaymentType, string> = {
  advance: "Tạm ứng",
  salary: "Trả lương",
  salary_remain: "Trả lương tồn",
  salary_bonus: "Trả thưởng DT",
};

// ============================================
// Payroll employee (mapped from Supabase staff rows)
// ============================================
export interface PayrollEmployee {
  id: string;
  name: string;
  paidLeave: number; // Nghỉ có phép — derived from attendance (absent with note)
  unpaidLeave: number; // Nghỉ không phép — derived from attendance
  phone?: string | null;
  code?: string | null;
  tip?: number; // Tổng tiền thưởng (tip) từ hóa đơn trong khoảng thời gian chọn
}

// Kept for backward-compat imports — now always empty (data comes from Supabase).
export const mockPayrollEmployees: PayrollEmployee[] = [];

// ============================================
// Attendance record (mapped from Supabase attendance rows)
// ============================================
export interface AttendanceRecord {
  id: string;
  staffId: string;
  shiftId: string | null;
  date: string; // YYYY-MM-DD
  checkIn: string | null; // ISO datetime
  checkOut: string | null;
  status: string;
  note: string | null;
  staff?: { id: string; name: string; phone: string | null; code: string | null } | null;
  shift?: { id: string; name: string } | null;
}

// ============================================
// Payroll payment record (mapped from Supabase payroll_payments rows)
// ============================================
export interface PayrollPaymentRecord {
  id: string;
  staffId: string;
  paymentType: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string | null;
  note: string | null;
  createdBy: string | null;
  staff?: { id: string; name: string; phone: string | null; code: string | null } | null;
}

// ============================================
// Salary payment method options
// ============================================
export const PaymentMethodOptions = [
  { value: "cash", label: "Tiền mặt" },
  { value: "transfer", label: "Chuyển khoản" },
  { value: "card", label: "Thẻ" },
  { value: "wallet", label: "Ví điện tử" },
];

// ============================================
// Helpers
// ============================================

// Convert "MM/YYYY" → { dateFrom: "YYYY-MM-01", dateTo: "YYYY-MM-DD" }
function monthRangeFromMMYYYY(value: string): { dateFrom: string; dateTo: string } | null {
  const m = value.match(/^(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const year = parseInt(m[2], 10);
  if (!month || !year) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return {
    dateFrom: `${year}-${pad(month)}-01`,
    dateTo: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

// Map a raw Supabase attendance row (snake_case + nested `shifts`) → AttendanceRecord (camelCase + shift)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAttendanceRow(row: any): AttendanceRecord {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (row.staff || null) as any;
  // Supabase joins the shifts table as `shifts`, but the spec uses `shift`. Support both.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sh = (row.shift || row.shifts || null) as any;
  return {
    id: String(row.id),
    staffId: String(row.staff_id ?? ""),
    shiftId: row.shift_id ? String(row.shift_id) : null,
    date: String(row.date ?? ""),
    checkIn: row.check_in ?? null,
    checkOut: row.check_out ?? null,
    status: String(row.status ?? ""),
    note: row.note ?? null,
    staff: s
      ? {
          id: String(s.id ?? ""),
          name: String(s.name ?? ""),
          phone: s.phone ?? null,
          code: s.code ?? null,
        }
      : null,
    shift: sh
      ? {
          id: String(sh.id ?? ""),
          name: String(sh.name ?? ""),
        }
      : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPayrollPaymentRow(row: any): PayrollPaymentRecord {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (row.staff || null) as any;
  return {
    id: String(row.id),
    staffId: String(row.staff_id ?? ""),
    paymentType: String(row.payment_type ?? ""),
    amount: Number(row.amount ?? 0),
    paymentMethod: String(row.payment_method ?? ""),
    paymentDate: row.payment_date ?? null,
    note: row.note ?? null,
    createdBy: row.created_by ?? null,
    staff: s
      ? {
          id: String(s.id ?? ""),
          name: String(s.name ?? ""),
          phone: s.phone ?? null,
          code: s.code ?? null,
        }
      : null,
  };
}

// ============================================
// Salary store
// ============================================
type DialogKind = "leave" | "reward-penalty" | "payment" | null;

interface WorkerManagerState {
  activeTab: "time-sheet" | "salary";
  view: AttendanceViewMode;
  period: AttendancePeriodMode;
  date: string; // MM/YYYY (for month) — the primary picker format (time-sheet tab)
  status: string;

  // Salary tab state
  searchKeyword: string;
  selectedEmployeeId: string | null;
  dialog: DialogKind;
  paymentType: PaymentType;
  // Date range for the salary (payroll) tab — "dd/MM/yyyy" format. Used to
  // compute the Thưởng (tip) column from completed invoices in the range.
  salaryDateFrom: string;
  salaryDateTo: string;

  // Supabase-backed data
  payrollEmployees: PayrollEmployee[];
  attendanceRecords: AttendanceRecord[];
  payrollPayments: PayrollPaymentRecord[];
  loadingPayrollEmployees: boolean;
  loadingAttendance: boolean;
  loadingPayrollPayments: boolean;

  setActiveTab: (t: "time-sheet" | "salary") => void;
  setView: (v: AttendanceViewMode) => void;
  setPeriod: (p: AttendancePeriodMode) => void;
  setDate: (d: string) => void;
  setStatus: (s: string) => void;

  setSearchKeyword: (k: string) => void;
  openDialog: (kind: Exclude<DialogKind, null>, employeeId: string, paymentType?: PaymentType) => void;
  closeDialog: () => void;
  setSalaryDateRange: (from: string, to: string) => void;

  // Supabase fetch / mutate functions
  fetchPayrollEmployees: (branchId?: string | null) => Promise<void>;
  fetchStaffTips: (branchId?: string | null) => Promise<void>;
  fetchAttendance: (
    date: string,
    status?: string,
    branchId?: string | null
  ) => Promise<void>;
  fetchPayrollPayments: (
    staffId?: string,
    dateFrom?: string,
    dateTo?: string,
    branchId?: string | null
  ) => Promise<void>;
  createPayrollPayment: (payload: Record<string, unknown>) => Promise<boolean>;
  createAttendance: (payload: Record<string, unknown>) => Promise<boolean>;
  updateAttendance: (id: string, payload: Record<string, unknown>) => Promise<boolean>;
}

function currentMonth(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Current month range in "dd/MM/yyyy" format (1st → today) — default for the
// salary tab's date range picker.
function currentMonthRange(): { from: string; to: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `01/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    to: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
  };
}

// Convert "dd/MM/yyyy" → ISO "yyyy-MM-dd" for the API date filters.
function ddmmyyyyToIso(ddmmyyyy: string): string | null {
  if (!ddmmyyyy) return null;
  const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export const useWorkerManagerStore = create<WorkerManagerState>((set, get) => ({
  activeTab: "time-sheet",
  view: "custom",
  period: "month",
  date: currentMonth(),
  status: "all",

  searchKeyword: "",
  selectedEmployeeId: null,
  dialog: null,
  paymentType: "advance",
  salaryDateFrom: currentMonthRange().from,
  salaryDateTo: currentMonthRange().to,

  payrollEmployees: [],
  attendanceRecords: [],
  payrollPayments: [],
  loadingPayrollEmployees: false,
  loadingAttendance: false,
  loadingPayrollPayments: false,

  setActiveTab: (activeTab) => set({ activeTab }),
  setView: (view) => set({ view }),
  setPeriod: (period) => set({ period }),
  setDate: (date) => set({ date }),
  setStatus: (status) => set({ status }),

  setSearchKeyword: (searchKeyword) => set({ searchKeyword }),
  openDialog: (kind, employeeId, paymentType) =>
    set({
      dialog: kind,
      selectedEmployeeId: employeeId,
      ...(paymentType ? { paymentType } : {}),
    }),
  closeDialog: () => set({ dialog: null }),
  setSalaryDateRange: (from, to) => set({ salaryDateFrom: from, salaryDateTo: to }),

  // ----------------------------------------
  // Supabase: fetch active staff → payrollEmployees
  // ----------------------------------------
  fetchPayrollEmployees: async (branchId) => {
    set({ loadingPayrollEmployees: true });
    try {
      const params = new URLSearchParams();
      params.set("active", "true");
      params.set("limit", "500");
      if (branchId) params.set("branch_id", branchId);
      const res = await fetch(`/api/supabase/staff?${params.toString()}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        const records = get().attendanceRecords;
        // Pre-compute leave counts per staff from existing attendance records.
        const leaveByStaff = new Map<string, { paid: number; unpaid: number }>();
        for (const a of records) {
          if (a.status !== "absent") continue;
          const entry = leaveByStaff.get(a.staffId) || { paid: 0, unpaid: 0 };
          const note = (a.note || "").toLowerCase();
          if (note.includes("không phép") || note.includes("unpaid")) {
            entry.unpaid += 1;
          } else {
            entry.paid += 1;
          }
          leaveByStaff.set(a.staffId, entry);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const employees: PayrollEmployee[] = json.data.map((row: any) => {
          const leave = leaveByStaff.get(String(row.id)) || { paid: 0, unpaid: 0 };
          return {
            id: String(row.id),
            name: String(row.name ?? ""),
            paidLeave: leave.paid,
            unpaidLeave: leave.unpaid,
            phone: row.phone ?? null,
            code: row.code ?? null,
          };
        });
        set({ payrollEmployees: employees });
      } else {
        console.error("fetchPayrollEmployees: bad response", json);
      }
    } catch (error) {
      console.error("Error fetching payroll employees:", error);
    } finally {
      set({ loadingPayrollEmployees: false });
    }
  },

  // ----------------------------------------
  // Supabase: fetch staff tips (thưởng) from completed invoices in the
  // selected salary date range. Updates payrollEmployees[].tip in place.
  //
  // Tip allocation: the invoice's `tip` field is a single number for the whole
  // invoice. We allocate it to the staff who performed the invoice's service
  // items. Because invoice items only carry `staffName` (not staffId), we
  // match by name against the staff list. If an invoice has multiple service
  // items by different staff, the tip is split equally among them. If an
  // invoice has no service items with a staffName, the tip is not allocated.
  // ----------------------------------------
  fetchStaffTips: async (branchId) => {
    const { salaryDateFrom, salaryDateTo, payrollEmployees } = get();
    if (payrollEmployees.length === 0) return;
    const fromIso = ddmmyyyyToIso(salaryDateFrom);
    const toIso = ddmmyyyyToIso(salaryDateTo);
    try {
      const params = new URLSearchParams();
      params.set("status", "completed");
      params.set("limit", "1000");
      if (fromIso) params.set("date_from", localDayStartUtc(fromIso));
      if (toIso) params.set("date_to", localDayEndUtc(toIso));
      if (branchId && branchId !== "all") params.set("branch_id", branchId);
      const res = await fetch(`/api/supabase/invoices?${params.toString()}`);
      const json = await res.json();
      if (!json.ok || !Array.isArray(json.data)) {
        // Reset tips to 0 on failure.
        set({
          payrollEmployees: payrollEmployees.map((e) => ({ ...e, tip: 0 })),
        });
        return;
      }
      // Build a name → staffId map (case-insensitive, trimmed).
      const nameToId = new Map<string, string>();
      for (const emp of payrollEmployees) {
        nameToId.set(emp.name.trim().toLowerCase(), emp.id);
      }
      // Aggregate tips per staffId.
      const tipByStaffId = new Map<string, number>();
      for (const inv of json.data as Array<Record<string, unknown>>) {
        const tip = Number(inv.tip ?? 0);
        if (tip <= 0) continue;
        const items = Array.isArray(inv.items) ? inv.items as Array<Record<string, unknown>> : [];
        // Collect distinct staff names from service items.
        const staffNames = new Set<string>();
        for (const it of items) {
          const staffName = String(it.staffName ?? "").trim();
          if (staffName) staffNames.add(staffName);
        }
        if (staffNames.size === 0) continue;
        const perStaff = tip / staffNames.size;
        for (const name of staffNames) {
          const id = nameToId.get(name.toLowerCase());
          if (id) {
            tipByStaffId.set(id, (tipByStaffId.get(id) || 0) + perStaff);
          }
        }
      }
      // Merge tip into payrollEmployees.
      set({
        payrollEmployees: payrollEmployees.map((e) => ({
          ...e,
          tip: Math.round(tipByStaffId.get(e.id) || 0),
        })),
      });
    } catch (error) {
      console.error("Error fetching staff tips:", error);
      set({
        payrollEmployees: payrollEmployees.map((e) => ({ ...e, tip: 0 })),
      });
    }
  },

  // ----------------------------------------
  // Supabase: fetch attendance for a given month + status filter
  // ----------------------------------------
  fetchAttendance: async (date, status, branchId) => {
    set({ loadingAttendance: true });
    try {
      const params = new URLSearchParams();
      const range = monthRangeFromMMYYYY(date);
      if (range) {
        params.set("date_from", range.dateFrom);
        params.set("date_to", range.dateTo);
      }
      const statusValue = status && status !== "all" ? status : "";
      if (statusValue) params.set("status", statusValue);
      if (branchId) params.set("branch_id", branchId);
      params.set("limit", "500");
      const res = await fetch(`/api/supabase/attendance?${params.toString()}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const records = json.data.map(mapAttendanceRow);
        set({ attendanceRecords: records });
        // Re-derive leave counts on payroll employees since attendance changed.
        const prev = get().payrollEmployees;
        if (prev.length > 0) {
          const leaveByStaff = new Map<string, { paid: number; unpaid: number }>();
          for (const a of records) {
            if (a.status !== "absent") continue;
            const entry = leaveByStaff.get(a.staffId) || { paid: 0, unpaid: 0 };
            const note = (a.note || "").toLowerCase();
            if (note.includes("không phép") || note.includes("unpaid")) {
              entry.unpaid += 1;
            } else {
              entry.paid += 1;
            }
            leaveByStaff.set(a.staffId, entry);
          }
          const updated = prev.map((e) => {
            const leave = leaveByStaff.get(e.id) || { paid: 0, unpaid: 0 };
            return { ...e, paidLeave: leave.paid, unpaidLeave: leave.unpaid };
          });
          set({ payrollEmployees: updated });
        }
      } else {
        console.error("fetchAttendance: bad response", json);
      }
    } catch (error) {
      console.error("Error fetching attendance:", error);
    } finally {
      set({ loadingAttendance: false });
    }
  },

  // ----------------------------------------
  // Supabase: fetch payroll payments (optionally filtered)
  // ----------------------------------------
  fetchPayrollPayments: async (staffId, dateFrom, dateTo, branchId) => {
    set({ loadingPayrollPayments: true });
    try {
      const params = new URLSearchParams();
      if (staffId) params.set("staff_id", staffId);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (branchId) params.set("branch_id", branchId);
      params.set("limit", "500");
      const res = await fetch(`/api/supabase/payroll-payments?${params.toString()}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = json.data.map(mapPayrollPaymentRow);
        set({ payrollPayments: rows });
      } else {
        console.error("fetchPayrollPayments: bad response", json);
      }
    } catch (error) {
      console.error("Error fetching payroll payments:", error);
    } finally {
      set({ loadingPayrollPayments: false });
    }
  },

  // ----------------------------------------
  // Supabase: create a payroll payment
  // Accepts camelCase payload and maps to snake_case for the API.
  // ----------------------------------------
  createPayrollPayment: async (payload) => {
    try {
      const body: Record<string, unknown> = {};
      if (payload.staffId !== undefined) body.staff_id = payload.staffId;
      if (payload.paymentType !== undefined) body.payment_type = payload.paymentType;
      if (payload.amount !== undefined) body.amount = payload.amount;
      if (payload.paymentMethod !== undefined) body.payment_method = payload.paymentMethod;
      if (payload.paymentDate !== undefined) body.payment_date = payload.paymentDate;
      if (payload.note !== undefined) body.note = payload.note;
      if (payload.createdBy !== undefined) body.created_by = payload.createdBy;

      const res = await fetch("/api/supabase/payroll-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        const row = mapPayrollPaymentRow(json.data);
        set({ payrollPayments: [row, ...get().payrollPayments] });
        return true;
      }
      console.error("createPayrollPayment: bad response", json);
      return false;
    } catch (error) {
      console.error("Error creating payroll payment:", error);
      return false;
    }
  },

  // ----------------------------------------
  // Supabase: create an attendance record
  // Accepts camelCase payload and maps to snake_case for the API.
  // ----------------------------------------
  createAttendance: async (payload) => {
    try {
      const body: Record<string, unknown> = {};
      if (payload.staffId !== undefined) body.staff_id = payload.staffId;
      if (payload.shiftId !== undefined) body.shift_id = payload.shiftId;
      if (payload.date !== undefined) body.date = payload.date;
      if (payload.checkIn !== undefined) body.check_in = payload.checkIn;
      if (payload.checkOut !== undefined) body.check_out = payload.checkOut;
      if (payload.status !== undefined) body.status = payload.status;
      if (payload.note !== undefined) body.note = payload.note;

      const res = await fetch("/api/supabase/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        const row = mapAttendanceRow(json.data);
        set({ attendanceRecords: [row, ...get().attendanceRecords] });
        return true;
      }
      console.error("createAttendance: bad response", json);
      return false;
    } catch (error) {
      console.error("Error creating attendance:", error);
      return false;
    }
  },

  // ----------------------------------------
  // Supabase: update an attendance record (PATCH)
  // Accepts camelCase payload and maps to snake_case for the API.
  // ----------------------------------------
  updateAttendance: async (id, payload) => {
    try {
      const body: Record<string, unknown> = {};
      if (payload.staffId !== undefined) body.staff_id = payload.staffId;
      if (payload.shiftId !== undefined) body.shift_id = payload.shiftId;
      if (payload.date !== undefined) body.date = payload.date;
      if (payload.checkIn !== undefined) body.check_in = payload.checkIn;
      if (payload.checkOut !== undefined) body.check_out = payload.checkOut;
      if (payload.status !== undefined) body.status = payload.status;
      if (payload.note !== undefined) body.note = payload.note;

      const res = await fetch(`/api/supabase/attendance/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        const row = mapAttendanceRow(json.data);
        const prev = get().attendanceRecords;
        const next = prev.map((r) => (r.id === id ? row : r));
        set({ attendanceRecords: next });
        return true;
      }
      console.error("updateAttendance: bad response", json);
      return false;
    } catch (error) {
      console.error("Error updating attendance:", error);
      return false;
    }
  },
}));

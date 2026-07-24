// ============================================
// Module 10: Worker Manager — Attendance Types
// ============================================

import type {
  AttendanceViewMode,
  AttendancePeriodMode,
} from "@/lib/constants";

export type { AttendanceViewMode, AttendancePeriodMode };

// --- Custom view: weekly grid (employees x days) ---

export interface AttendanceCell {
  id: string;
  status: string; // onTime | late | early | missing | absent
  shiftName: string;
  checkIn: string | null; // ISO datetime or null
  checkOut: string | null; // ISO datetime or null
}

export interface AttendanceEmployeeRow {
  userId: string;
  userName: string;
  avatar?: string | null;
  cells: Record<string, AttendanceCell | null>; // keyed by YYYY-MM-DD
}

export interface AttendanceCustomResponse {
  employees: AttendanceEmployeeRow[];
  days: Array<{ date: string; label: string; weekday: string; isToday: boolean }>;
  periodLabel: string;
}

// --- Overview view: per-employee monthly summary ---

export interface AttendanceOverviewRow {
  userId: string;
  userName: string;
  avatar?: string | null;
  lateCount: number;
  earlyCount: number;
  overtimeHours: number;
  middayBreakHours: number;
  totalShifts: number;
  totalDaysOff: number;
  totalWorkingHours: number;
}

export interface AttendanceOverviewResponse {
  rows: AttendanceOverviewRow[];
  periodLabel: string;
}

// --- Shared filter shape ---

export interface AttendanceFilters {
  view: AttendanceViewMode;
  period: AttendancePeriodMode;
  date: string; // MM/YYYY for month, DD/MM/YYYY for day, or start of week
  status: string;
}

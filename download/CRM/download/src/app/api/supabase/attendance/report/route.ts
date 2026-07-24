import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Vietnamese weekday labels (Monday-first).
const WEEKDAY_LABELS = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ Nhật",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date): string {
  // YYYY-MM-DD (local)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Parse a "MM/YYYY" string into a Date at the 1st of that month.
function parseMonth(value: string): Date | null {
  const m = value.match(/^(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const year = parseInt(m[2], 10);
  const d = new Date(year, month - 1, 1, 0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

type AttendanceRow = {
  id: string;
  staff_id: string;
  shift_id: string | null;
  date: string; // YYYY-MM-DD
  check_in: string | null;
  check_out: string | null;
  status: string;
  note: string | null;
  shift?: { id: string; name: string } | null;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "custom";
    const dateStr = searchParams.get("date") || "";
    const status = searchParams.get("status") || "all";

    if (view === "custom") {
      return await handleCustomView({ dateStr, status });
    }

    if (view === "overview") {
      return await handleOverviewView({ dateStr });
    }

    return Response.json(
      { ok: false, error: "Invalid view mode" },
      { status: 400 }
    );
  } catch (error) {
    console.error("GET /api/supabase/attendance/report error:", error);
    return Response.json(
      { ok: false, error: "Lỗi khi lấy dữ liệu chấm công" },
      { status: 500 }
    );
  }
}

// ============================================
// Custom view: weekly grid (employees x days)
// ============================================
type CustomArgs = {
  dateStr: string;
  status: string;
};

async function handleCustomView(args: CustomArgs) {
  const { dateStr, status } = args;

  // For the custom grid we always show a 7-day week. If a MM/YYYY date is
  // supplied, anchor to the 1st of that month; otherwise anchor to today.
  const today = new Date();
  let anchor = today;
  if (dateStr) {
    const monthDate = parseMonth(dateStr);
    if (monthDate) anchor = monthDate;
  }

  // Find Monday of the week containing the anchor date.
  const dow = anchor.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDays.push(d);
  }

  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];

  const weekStartStr = dateKey(weekStart);
  const weekEndStr = dateKey(weekEnd);

  // Fetch all active staff (role in staff/manager). staff table has a `role`
  // column with default 'staff' — match the same filter the Prisma route used.
  const { data: staffRows, error: staffErr } = await supabaseAdmin
    .from("staff")
    .select("id, name, avatar, role, active")
    .eq("active", true)
    .in("role", ["staff", "manager"])
    .order("name", { ascending: true });
  if (staffErr) {
    return Response.json(
      { ok: false, error: staffErr.message },
      { status: 500 }
    );
  }
  const users = (staffRows ?? []) as Array<{
    id: string;
    name: string;
    avatar: string | null;
  }>;

  // Fetch attendance for the week.
  const staffIds = users.map((u) => u.id);
  let attQuery = supabaseAdmin
    .from("attendance")
    .select(
      "id, staff_id, shift_id, date, check_in, check_out, status, note, shift:shifts(id, name)"
    )
    .gte("date", weekStartStr)
    .lte("date", weekEndStr);
  if (staffIds.length > 0) {
    attQuery = attQuery.in("staff_id", staffIds);
  }
  const { data: attRows, error: attErr } = await attQuery;
  if (attErr) {
    return Response.json({ ok: false, error: attErr.message }, { status: 500 });
  }
  const attendances = (attRows ?? []) as unknown as AttendanceRow[];

  // Group attendance by staffId -> dateKey
  const attMap = new Map<string, Map<string, AttendanceRow>>();
  for (const a of attendances) {
    const key =
      typeof a.date === "string" ? a.date.slice(0, 10) : dateKey(new Date(a.date));
    if (!attMap.has(a.staff_id)) attMap.set(a.staff_id, new Map());
    attMap.get(a.staff_id)!.set(key, a);
  }

  // Apply status filter: if a specific status is selected, only include
  // employees who have at least one attendance with that status this week.
  const filteredUsers =
    status && status !== "all"
      ? users.filter((u) => {
          const userAtt = attMap.get(u.id);
          if (!userAtt) return false;
          return Array.from(userAtt.values()).some((a) => a.status === status);
        })
      : users;

  const employees = filteredUsers.map((u) => {
    const userAtt = attMap.get(u.id) || new Map<string, AttendanceRow>();
    const cells: Record<
      string,
      | {
          id: string;
          status: string;
          shiftName: string;
          checkIn: string | null;
          checkOut: string | null;
        }
      | null
    > = {};
    for (const day of weekDays) {
      const key = dateKey(day);
      const a = userAtt.get(key);
      if (a) {
        cells[key] = {
          id: a.id,
          status: a.status,
          shiftName: a.shift?.name || "Ca ngày",
          checkIn: a.check_in,
          checkOut: a.check_out,
        };
      } else {
        cells[key] = null;
      }
    }
    return {
      userId: u.id,
      userName: u.name,
      avatar: u.avatar,
      cells,
    };
  });

  const days = weekDays.map((d) => {
    const dow2 = d.getDay() === 0 ? 6 : d.getDay() - 1; // 0=Mon..6=Sun
    const isToday = d.toDateString() === today.toDateString();
    return {
      date: dateKey(d),
      label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
      weekday: WEEKDAY_LABELS[dow2],
      isToday,
    };
  });

  // Period label: "Tuần 23/06 - 29/06"
  const periodLabel = `Tuần ${pad(weekStart.getDate())}/${pad(
    weekStart.getMonth() + 1
  )} - ${pad(weekDays[6].getDate())}/${pad(weekDays[6].getMonth() + 1)}`;

  return Response.json({
    ok: true,
    data: { employees, days, periodLabel },
  });
}

// ============================================
// Overview view: per-employee monthly summary
// ============================================
type OverviewArgs = {
  dateStr: string;
};

async function handleOverviewView(args: OverviewArgs) {
  const { dateStr } = args;

  // Determine the month range from dateStr (MM/YYYY). Default to current month.
  const today = new Date();
  let monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  let monthEnd = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  if (dateStr) {
    const parsed = parseMonth(dateStr);
    if (parsed) {
      monthStart = parsed;
      monthEnd = new Date(
        parsed.getFullYear(),
        parsed.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
    }
  }

  const monthStartStr = dateKey(monthStart);
  const monthEndStr = dateKey(monthEnd);

  const { data: staffRows, error: staffErr } = await supabaseAdmin
    .from("staff")
    .select("id, name, avatar, role, active")
    .eq("active", true)
    .in("role", ["staff", "manager"])
    .order("name", { ascending: true });
  if (staffErr) {
    return Response.json(
      { ok: false, error: staffErr.message },
      { status: 500 }
    );
  }
  const users = (staffRows ?? []) as Array<{
    id: string;
    name: string;
    avatar: string | null;
  }>;

  const staffIds = users.map((u) => u.id);
  let attQuery = supabaseAdmin
    .from("attendance")
    .select("id, staff_id, date, check_in, check_out, status")
    .gte("date", monthStartStr)
    .lte("date", monthEndStr);
  if (staffIds.length > 0) {
    attQuery = attQuery.in("staff_id", staffIds);
  }
  const { data: attRows, error: attErr } = await attQuery;
  if (attErr) {
    return Response.json({ ok: false, error: attErr.message }, { status: 500 });
  }
  const attendances = (attRows ?? []) as unknown as Array<{
    id: string;
    staff_id: string;
    check_in: string | null;
    check_out: string | null;
    status: string;
  }>;

  // Aggregate per user
  const rows = users.map((u) => {
    const userAtt = attendances.filter((a) => a.staff_id === u.id);
    let lateCount = 0;
    let earlyCount = 0;
    let totalShifts = 0;
    let totalDaysOff = 0;
    let totalWorkingMinutes = 0;
    let overtimeMinutes = 0;
    let middayBreakMinutes = 0;

    for (const a of userAtt) {
      if (a.status === "late") lateCount++;
      if (a.status === "early") earlyCount++;
      if (a.status === "absent") {
        totalDaysOff++;
        continue;
      }
      if (a.status === "missing") continue;
      totalShifts++;

      // Compute working hours from checkIn/checkOut
      if (a.check_in && a.check_out) {
        const inMs = new Date(a.check_in).getTime();
        const outMs = new Date(a.check_out).getTime();
        const diffMin = Math.max(0, Math.round((outMs - inMs) / 60000));
        totalWorkingMinutes += diffMin;

        // Overtime = working minutes beyond 8 hours (480 min)
        if (diffMin > 480) {
          overtimeMinutes += diffMin - 480;
        }

        // Midday break: nominal 60 min for any shift > 6h
        if (diffMin > 360) {
          middayBreakMinutes += 60;
        }
      }
    }

    return {
      userId: u.id,
      userName: u.name,
      avatar: u.avatar,
      lateCount,
      earlyCount,
      overtimeHours: Math.round((overtimeMinutes / 60) * 10) / 10,
      middayBreakHours: Math.round((middayBreakMinutes / 60) * 10) / 10,
      totalShifts,
      totalDaysOff,
      totalWorkingHours: Math.round((totalWorkingMinutes / 60) * 10) / 10,
    };
  });

  // Period label: "Tháng 6 (01/06/2026 - 30/06/2026)"
  const periodLabel = `Tháng ${monthStart.getMonth() + 1} (${pad(
    monthStart.getDate()
  )}/${pad(monthStart.getMonth() + 1)}/${monthStart.getFullYear()} - ${pad(
    monthEnd.getDate()
  )}/${pad(monthEnd.getMonth() + 1)}/${monthEnd.getFullYear()})`;

  return Response.json({
    ok: true,
    data: { rows, periodLabel },
  });
}

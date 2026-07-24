import { create } from "zustand";

// ============================================
// API helpers
// ============================================
const STAFF_API = "/api/supabase/staff";
const STAFF_GROUPS_API = "/api/supabase/staff-groups";
const SHIFTS_API = "/api/supabase/shifts";

async function apiRequest<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string; pagination?: unknown }> {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      return {
        ok: false,
        error:
          (json && (json.error || json.message)) ||
          `Request failed with status ${res.status}`,
      };
    }
    return {
      ok: true,
      data: json.data as T,
      pagination: json.pagination,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

// ============================================
// Setting sub-tabs (matches left sub-sidebar)
// ============================================
export type SettingTab =
  | "salon-info"
  | "staff-settings"
  | "work-shift"
  | "commission"
  | "booking-channel"
  | "customer-sources"
  | "customer-groups"
  | "booking-settings";

export const SettingTabs: {
  id: SettingTab;
  label: string;
}[] = [
  { id: "salon-info", label: "Thông tin Salon" },
  { id: "staff-settings", label: "Cài đặt nhân viên" },
  { id: "work-shift", label: "Ca làm việc" },
  { id: "commission", label: "Hoa hồng nhân viên" },
  { id: "booking-channel", label: "Kênh đặt lịch" },
  { id: "customer-sources", label: "Nguồn khách hàng" },
  { id: "customer-groups", label: "Nhóm khách hàng" },
  { id: "booking-settings", label: "Đặt lịch" },
];

// ============================================
// Staff view modes (list vs groups)
// ============================================
export type StaffView = "list" | "groups";

// ============================================
// Dialog kinds
// ============================================
export type StaffDialogKind = "create" | "edit" | null;
export type StaffGroupDialogKind = "create" | "edit" | null;

// ============================================
// Staff interface (data fetched from Supabase)
// ============================================
export interface Staff {
  id: string;
  name: string;
  phone: string;
  group: string;
  groupId: string | null;
  status: "active" | "inactive";
  avatar?: string;
  code?: string;
  email?: string;
  username?: string;
  role?: string;
  branchId?: string | null;
  branch?: string;
  allowBooking?: boolean;
  allowOverlap?: boolean;
  appLogin?: boolean;
  accountType?: string;
  permissions?: Record<string, boolean>;
  branches?: string[];
  // Whether the staff account already has a login password set. Used by the
  // edit dialog to decide whether the "old password" field is required.
  hasPassword?: boolean;
}

// Raw Supabase staff row (snake_case) returned by /api/supabase/staff
interface StaffRow {
  id: string;
  code?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  username?: string | null;
  role?: string | null;
  avatar?: string | null;
  group_id?: string | null;
  branch_id?: string | null;
  active?: boolean | null;
  allow_booking?: boolean | null;
  allow_overlap?: boolean | null;
  app_login?: boolean | null;
  account_type?: string | null;
  permissions?: Record<string, boolean> | null;
  branches?: string[] | null;
  has_password?: boolean | null;
  created_at?: string;
  updated_at?: string;
  group?: {
    id: string;
    name: string;
    is_office_staff?: boolean | null;
  } | null;
  branch?: {
    id: string;
    name: string;
  } | null;
}

function mapStaffRow(row: StaffRow): Staff {
  return {
    id: row.id,
    code: row.code ?? undefined,
    name: row.name,
    phone: row.phone ?? "",
    email: row.email ?? undefined,
    username: row.username ?? undefined,
    role: row.role ?? undefined,
    avatar: row.avatar ?? undefined,
    groupId: row.group_id ?? null,
    group: row.group?.name ?? "",
    branchId: row.branch_id ?? null,
    branch: row.branch?.name ?? "",
    status: row.active ? "active" : "inactive",
    allowBooking: row.allow_booking ?? true,
    allowOverlap: row.allow_overlap ?? false,
    appLogin: row.app_login ?? false,
    accountType: row.account_type ?? "invoice_only",
    permissions: row.permissions ?? {},
    branches: row.branches ?? (row.branch_id ? [row.branch_id] : []),
    hasPassword: row.has_password ?? false,
  };
}

// Kept for backwards compatibility (now empty — state is populated via fetchStaff)
export const mockStaff: Staff[] = [];

// ============================================
// Staff groups interface (data fetched from Supabase)
// ============================================
export interface StaffGroup {
  id: string;
  name: string;
  isOfficeStaff?: boolean;
  active?: boolean;
  sortOrder?: number;
}

// Raw Supabase staff_groups row (snake_case)
export interface StaffGroupRow {
  id: string;
  name: string;
  is_office_staff?: boolean | null;
  active?: boolean | null;
  sort_order?: number | null;
  created_at?: string;
}

function mapStaffGroupRow(row: StaffGroupRow): StaffGroup {
  return {
    id: row.id,
    name: row.name,
    isOfficeStaff: Boolean(row.is_office_staff),
    active: row.active === undefined ? undefined : Boolean(row.active),
    sortOrder: row.sort_order ?? undefined,
  };
}

// Kept for backwards compatibility (now empty — state is populated via fetchStaffGroups)
export const mockStaffGroups: StaffGroup[] = [];

// ============================================
// Branch options — fetched dynamically from Supabase via /api/supabase/branches
// (kept as empty array for backwards compat; use useBranchStore or fetch API instead)
// ============================================
export const BranchOptions: { value: string; label: string }[] = [];

// ============================================
// Staff status options
// ============================================
export const StaffStatusOptions = [
  { value: "active", label: "Đang hoạt động" },
  { value: "inactive", label: "Ngừng hoạt động" },
];

// ============================================
// Permission groups (for Phân quyền tab)
// ============================================
export interface PermissionItem {
  key: string;
  label: string;
}
export interface PermissionGroup {
  id: string;
  title: string;
  permissions: PermissionItem[];
}

export const PermissionGroups: PermissionGroup[] = [
  {
    id: "booking",
    title: "Đặt lịch",
    permissions: [
      { key: "booking.allow", label: "Cho phép đặt lịch" },
      { key: "booking.overlap", label: "Đặt trùng lịch hẹn trên 1 khung giờ" },
      { key: "booking.view_all", label: "Xem tất cả lịch hẹn" },
      { key: "booking.edit", label: "Chỉnh sửa lịch hẹn" },
    ],
  },
  {
    id: "cashier",
    title: "Thu ngân",
    permissions: [
      { key: "cashier.create_invoice", label: "Tạo hóa đơn" },
      { key: "cashier.refund", label: "Hoàn tiền / Hủy hóa đơn" },
      { key: "cashier.discount", label: "Thay đổi giảm giá" },
      { key: "cashier.view_all", label: "Xem tất cả hóa đơn" },
    ],
  },
  {
    id: "customer",
    title: "Khách hàng",
    permissions: [
      { key: "customer.view", label: "Xem danh sách khách hàng" },
      { key: "customer.create", label: "Thêm / Sửa khách hàng" },
      { key: "customer.delete", label: "Xóa khách hàng" },
      { key: "customer.export", label: "Xuất dữ liệu khách hàng" },
    ],
  },
  {
    id: "product",
    title: "Sản phẩm & Kho",
    permissions: [
      { key: "product.manage", label: "Quản lý sản phẩm / dịch vụ" },
      { key: "warehouse.import", label: "Nhập kho" },
      { key: "warehouse.export", label: "Xuất kho" },
      { key: "warehouse.transfer", label: "Chuyển kho" },
    ],
  },
  {
    id: "finance",
    title: "Thu chi & Công nợ",
    permissions: [
      { key: "finance.revenue", label: "Tạo phiếu thu" },
      { key: "finance.expenditure", label: "Tạo phiếu chi" },
      { key: "finance.debt", label: "Quản lý công nợ" },
    ],
  },
  {
    id: "report",
    title: "Báo cáo",
    permissions: [
      { key: "report.view", label: "Xem báo cáo" },
      { key: "report.export", label: "Xuất báo cáo" },
    ],
  },
  {
    id: "staff",
    title: "Quản lý nhân viên",
    permissions: [
      { key: "staff.attendance", label: "Chấm công" },
      { key: "staff.salary", label: "Quản lý lương" },
    ],
  },
  {
    id: "system",
    title: "Hệ thống",
    permissions: [
      { key: "system.app_login", label: "Đăng nhập app chuyên viên bằng số điện thoại" },
      { key: "system.settings", label: "Truy cập Cài đặt" },
    ],
  },
];

// ============================================
// Shift data (Ca làm việc) — fetched from Supabase
// ============================================
export interface Shift {
  id: string;
  name: string; // Tên ca làm việc
  workStart: string; // HH:mm
  workEnd: string; // HH:mm
  checkInStart: string; // HH:mm
  checkInEnd: string; // HH:mm
  note: string;
  isDefault: boolean;
  status: "active" | "inactive";
  branchId?: string | null;
}

// Raw Supabase shifts row (snake_case)
export interface ShiftRow {
  id: string;
  name: string;
  work_start?: string | null;
  work_end?: string | null;
  check_in_start?: string | null;
  check_in_end?: string | null;
  note?: string | null;
  is_default?: boolean | null;
  status?: string | null;
  branch_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

function mapShiftRow(row: ShiftRow): Shift {
  const rawStatus = row.status ?? "active";
  return {
    id: row.id,
    name: row.name,
    workStart: row.work_start ?? "",
    workEnd: row.work_end ?? "",
    checkInStart: row.check_in_start ?? "",
    checkInEnd: row.check_in_end ?? "",
    note: row.note ?? "",
    isDefault: Boolean(row.is_default),
    status: rawStatus === "inactive" ? "inactive" : "active",
    branchId: row.branch_id ?? null,
  };
}

// Kept for backwards compatibility (now empty — state is populated via fetchShifts)
export const mockShifts: Shift[] = [];

export type ShiftDialogKind = "create" | "edit" | null;

export type ShiftSortField = "name" | "workTime" | "checkTime";
export type SortDirection = "asc" | "desc";

// ============================================
// Mock customer source data (Nguồn khách hàng)
// ============================================
export interface CustomerSource {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
}

export const mockCustomerSources: CustomerSource[] = [
  { id: "cs1", name: "Nhân viên Level 1 dẫn đến", description: "Đặt lịch qua nhân viên", isDefault: false },
  { id: "cs2", name: "Người thân giới thiệu", description: "Khách được người thân giới thiệu", isDefault: false },
  { id: "cs3", name: "Tờ rơi", description: "Khách biết cửa hàng thông qua việc nhận tờ rơi", isDefault: false },
  { id: "cs4", name: "Reddit", description: "Khách hàng mới biết qua mạng xã hội Reddit", isDefault: false },
  { id: "cs5", name: "Gần cơ quan", description: "Khách hàng có chỗ làm việc, cơ quan gần với quán", isDefault: false },
  { id: "cs6", name: "Khách vãng lai", description: "Khách đi qua, đi chơi vô tình thấy quán", isDefault: false },
  { id: "cs7", name: "Threads", description: "Khách biết qua bài đăng Threads", isDefault: false },
  { id: "cs8", name: "Thỏa thuận", description: "Thỏa thuận của cửa hàng dẫn bạn bè, người quen đến", isDefault: false },
  { id: "cs9", name: "Google Maps", description: "KH biết đến qua google maps", isDefault: false },
  { id: "cs10", name: "Nhà gần cửa hàng", description: "Khách hàng xóm, ở quanh gần cửa hàng", isDefault: false },
  { id: "cs11", name: "Bạn bè giới thiệu", description: "Khách hàng mới được bạn bè giới thiệu", isDefault: false },
  { id: "cs12", name: "Tiktok", description: "Khách biết qua video trên tiktok", isDefault: false },
];

export type SourceDialogKind = "create" | "edit" | null;

// ============================================
// Input payload shapes (camelCase -> snake_case mapping is done in store)
// ============================================
export interface StaffInput {
  name: string;
  phone?: string;
  email?: string;
  username?: string;
  password?: string;
  oldPassword?: string;
  role?: string;
  avatar?: string;
  groupId?: string | null;
  branchId?: string | null;
  active?: boolean;
  allowBooking?: boolean;
  allowOverlap?: boolean;
  appLogin?: boolean;
  accountType?: string;
  // permissions is a JSONB column; the staff-create dialog stores the full
  // list of selected group IDs under the `group_ids` key alongside the
  // boolean permission flags, so allow arbitrary values (not just booleans).
  permissions?: Record<string, boolean | string[]>;
  branchIds?: string[];
}

export interface StaffGroupInput {
  name: string;
  isOfficeStaff?: boolean;
  active?: boolean;
  sortOrder?: number;
}

export interface ShiftInput {
  name: string;
  workStart?: string;
  workEnd?: string;
  checkInStart?: string;
  checkInEnd?: string;
  note?: string;
  isDefault?: boolean;
  status?: "active" | "inactive";
  branchId?: string | null;
}

// ============================================
// Setting store
// ============================================
interface SettingState {
  activeTab: SettingTab;
  staffView: StaffView;
  staffDialog: StaffDialogKind;
  staffGroupDialog: StaffGroupDialogKind;
  selectedStaffId: string | null;
  selectedGroupId: string | null;
  searchKeyword: string;
  groupFilter: string; // staff list group filter

  // Shift tab
  shiftDialog: ShiftDialogKind;
  selectedShiftId: string | null;
  shiftSearch: string;
  shiftSortField: ShiftSortField;
  shiftSortDir: SortDirection;
  shiftPage: number;
  shiftPageSize: number;

  // Customer source tab
  sourceDialog: SourceDialogKind;
  selectedSourceId: string | null;
  sourceSearch: string;

  // Data fetched from Supabase API
  staff: Staff[];
  staffGroups: StaffGroup[];
  shifts: Shift[];
  staffLoading: boolean;
  staffGroupsLoading: boolean;
  shiftsLoading: boolean;

  setActiveTab: (t: SettingTab) => void;
  setStaffView: (v: StaffView) => void;
  openStaffDialog: (kind: Exclude<StaffDialogKind, null>, staffId?: string) => void;
  closeStaffDialog: () => void;
  // Re-fetch a single staff member's fresh data (incl. has_password) so the
  // edit dialog always reflects the real current state — not a stale snapshot
  // from when the staff list was last loaded.
  refreshStaffById: (id: string) => Promise<void>;
  openStaffGroupDialog: (kind: Exclude<StaffGroupDialogKind, null>, groupId?: string) => void;
  closeStaffGroupDialog: () => void;
  setSearchKeyword: (k: string) => void;
  setGroupFilter: (g: string) => void;

  openShiftDialog: (kind: Exclude<ShiftDialogKind, null>, shiftId?: string) => void;
  closeShiftDialog: () => void;
  setShiftSearch: (k: string) => void;
  setShiftSort: (field: ShiftSortField, dir: SortDirection) => void;
  setShiftPage: (p: number) => void;
  setShiftPageSize: (s: number) => void;

  openSourceDialog: (kind: Exclude<SourceDialogKind, null>, sourceId?: string) => void;
  closeSourceDialog: () => void;
  setSourceSearch: (k: string) => void;

  // Async data operations (Supabase API)
  fetchStaff: (params?: {
    search?: string;
    groupId?: string;
    branchId?: string;
    active?: boolean;
    page?: number;
    limit?: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  fetchStaffGroups: (params?: { active?: boolean }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  fetchShifts: (params?: {
    search?: string;
    branchId?: string;
    status?: string;
    active?: boolean;
    page?: number;
    limit?: number;
  }) => Promise<{ ok: boolean; error?: string }>;

  createStaff: (
    input: StaffInput
  ) => Promise<{ ok: boolean; error?: string; data?: Staff }>;
  updateStaff: (
    id: string,
    input: StaffInput
  ) => Promise<{ ok: boolean; error?: string; data?: Staff }>;
  deleteStaff: (
    id: string
  ) => Promise<{ ok: boolean; error?: string }>;

  createStaffGroup: (
    input: StaffGroupInput
  ) => Promise<{ ok: boolean; error?: string; data?: StaffGroup }>;
  updateStaffGroup: (
    id: string,
    input: StaffGroupInput
  ) => Promise<{ ok: boolean; error?: string; data?: StaffGroup }>;
  deleteStaffGroup: (
    id: string
  ) => Promise<{ ok: boolean; error?: string }>;

  createShift: (
    input: ShiftInput
  ) => Promise<{ ok: boolean; error?: string; data?: Shift }>;
  updateShift: (
    id: string,
    input: ShiftInput
  ) => Promise<{ ok: boolean; error?: string; data?: Shift }>;
  deleteShift: (
    id: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

export const useSettingStore = create<SettingState>((set, get) => ({
  activeTab: "salon-info",
  staffView: "list",
  staffDialog: null,
  staffGroupDialog: null,
  selectedStaffId: null,
  selectedGroupId: null,
  searchKeyword: "",
  groupFilter: "all",

  shiftDialog: null,
  selectedShiftId: null,
  shiftSearch: "",
  shiftSortField: "name",
  shiftSortDir: "asc",
  shiftPage: 1,
  shiftPageSize: 20,

  sourceDialog: null,
  selectedSourceId: null,
  sourceSearch: "",

  staff: [],
  staffGroups: [],
  shifts: [],
  staffLoading: false,
  staffGroupsLoading: false,
  shiftsLoading: false,

  setActiveTab: (activeTab) => set({ activeTab }),
  setStaffView: (staffView) => set({ staffView }),
  openStaffDialog: (kind, staffId) =>
    set({ staffDialog: kind, selectedStaffId: staffId ?? null }),
  closeStaffDialog: () => set({ staffDialog: null, selectedStaffId: null }),
  refreshStaffById: async (id) => {
    try {
      const res = await apiRequest<StaffRow>(`${STAFF_API}/${id}`, {
        method: "GET",
      });
      if (!res.ok) return;
      const fresh = mapStaffRow(res.data as StaffRow);
      set({
        staff: get().staff.map((s) => (s.id === id ? { ...s, ...fresh } : s)),
      });
    } catch {
      // Best-effort refresh; the dialog still works with cached data.
    }
  },
  openStaffGroupDialog: (kind, groupId) =>
    set({ staffGroupDialog: kind, selectedGroupId: groupId ?? null }),
  closeStaffGroupDialog: () =>
    set({ staffGroupDialog: null, selectedGroupId: null }),
  setSearchKeyword: (searchKeyword) => set({ searchKeyword }),
  setGroupFilter: (groupFilter) => set({ groupFilter }),

  openShiftDialog: (kind, shiftId) =>
    set({ shiftDialog: kind, selectedShiftId: shiftId ?? null }),
  closeShiftDialog: () => set({ shiftDialog: null, selectedShiftId: null }),
  setShiftSearch: (shiftSearch) => set({ shiftSearch, shiftPage: 1 }),
  setShiftSort: (shiftSortField, shiftSortDir) =>
    set({ shiftSortField, shiftSortDir }),
  setShiftPage: (shiftPage) => set({ shiftPage }),
  setShiftPageSize: (shiftPageSize) => set({ shiftPageSize, shiftPage: 1 }),

  openSourceDialog: (kind, sourceId) =>
    set({ sourceDialog: kind, selectedSourceId: sourceId ?? null }),
  closeSourceDialog: () =>
    set({ sourceDialog: null, selectedSourceId: null }),
  setSourceSearch: (sourceSearch) => set({ sourceSearch }),

  // =============== Staff ===============
  fetchStaff: async (params) => {
    set({ staffLoading: true });
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.groupId) qs.set("group_id", params.groupId);
    if (params?.branchId) qs.set("branch_id", params.branchId);
    if (params?.active !== undefined)
      qs.set("active", String(params.active));
    qs.set("page", String(params?.page ?? 1));
    qs.set("limit", String(params?.limit ?? 500));
    const url = `${STAFF_API}?${qs.toString()}`;
    const res = await apiRequest<StaffRow[]>(url, { method: "GET" });
    if (!res.ok) {
      set({ staffLoading: false });
      return { ok: false, error: res.error };
    }
    const rows = res.data ?? [];
    const staff = rows.map(mapStaffRow);
    set({ staff, staffLoading: false });
    return { ok: true };
  },

  createStaff: async (input) => {
    const payload: Record<string, unknown> = { name: input.name.trim() };
    if (input.phone !== undefined) payload.phone = input.phone;
    if (input.email !== undefined) payload.email = input.email;
    if (input.username !== undefined) payload.username = input.username;
    if (input.password !== undefined) payload.password = input.password;
    if (input.role !== undefined) payload.role = input.role;
    if (input.avatar !== undefined) payload.avatar = input.avatar;
    if (input.groupId !== undefined) payload.group_id = input.groupId;
    if (input.branchId !== undefined) payload.branch_id = input.branchId;
    if (input.active !== undefined) payload.active = input.active;
    if (input.allowBooking !== undefined) payload.allow_booking = input.allowBooking;
    if (input.allowOverlap !== undefined) payload.allow_overlap = input.allowOverlap;
    if (input.appLogin !== undefined) payload.app_login = input.appLogin;
    if (input.accountType !== undefined) payload.account_type = input.accountType;
    if (input.permissions !== undefined) payload.permissions = input.permissions;
    if (input.branchIds !== undefined) payload.branch_ids = input.branchIds;
    const res = await apiRequest<StaffRow>(STAFF_API, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: res.error };
    const created = mapStaffRow(res.data as StaffRow);
    set({ staff: [created, ...get().staff] });
    return { ok: true, data: created };
  },

  updateStaff: async (id, input) => {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.phone !== undefined) payload.phone = input.phone;
    if (input.email !== undefined) payload.email = input.email;
    if (input.username !== undefined) payload.username = input.username;
    if (input.password !== undefined) {
      payload.password = input.password;
      // The API verifies old_password before accepting a password change.
      payload.old_password = input.oldPassword || "";
    }
    if (input.role !== undefined) payload.role = input.role;
    if (input.avatar !== undefined) payload.avatar = input.avatar;
    if (input.groupId !== undefined) payload.group_id = input.groupId;
    if (input.branchId !== undefined) payload.branch_id = input.branchId;
    if (input.active !== undefined) payload.active = input.active;
    if (input.allowBooking !== undefined) payload.allow_booking = input.allowBooking;
    if (input.allowOverlap !== undefined) payload.allow_overlap = input.allowOverlap;
    if (input.appLogin !== undefined) payload.app_login = input.appLogin;
    if (input.accountType !== undefined) payload.account_type = input.accountType;
    if (input.permissions !== undefined) payload.permissions = input.permissions;
    if (input.branchIds !== undefined) payload.branch_ids = input.branchIds;
    const res = await apiRequest<StaffRow>(`${STAFF_API}/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: res.error };
    const updated = mapStaffRow(res.data as StaffRow);
    set({
      staff: get().staff.map((s) => (s.id === id ? updated : s)),
    });
    return { ok: true, data: updated };
  },

  deleteStaff: async (id) => {
    const res = await apiRequest<null>(`${STAFF_API}/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) return { ok: false, error: res.error };
    set({ staff: get().staff.filter((s) => s.id !== id) });
    return { ok: true };
  },

  // =============== Staff groups ===============
  fetchStaffGroups: async (params) => {
    set({ staffGroupsLoading: true });
    const qs = new URLSearchParams();
    if (params?.active !== undefined)
      qs.set("active", String(params.active));
    const url = qs.toString()
      ? `${STAFF_GROUPS_API}?${qs.toString()}`
      : STAFF_GROUPS_API;
    const res = await apiRequest<StaffGroupRow[]>(url, { method: "GET" });
    if (!res.ok) {
      set({ staffGroupsLoading: false });
      return { ok: false, error: res.error };
    }
    const rows = res.data ?? [];
    const groups = rows.map(mapStaffGroupRow);
    set({ staffGroups: groups, staffGroupsLoading: false });
    return { ok: true };
  },

  createStaffGroup: async (input) => {
    const payload: Record<string, unknown> = { name: input.name.trim() };
    if (input.isOfficeStaff !== undefined)
      payload.is_office_staff = input.isOfficeStaff;
    if (input.active !== undefined) payload.active = input.active;
    if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
    const res = await apiRequest<StaffGroupRow>(STAFF_GROUPS_API, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: res.error };
    const created = mapStaffGroupRow(res.data as StaffGroupRow);
    set({ staffGroups: [...get().staffGroups, created] });
    return { ok: true, data: created };
  },

  updateStaffGroup: async (id, input) => {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.isOfficeStaff !== undefined)
      payload.is_office_staff = input.isOfficeStaff;
    if (input.active !== undefined) payload.active = input.active;
    if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
    const res = await apiRequest<StaffGroupRow>(`${STAFF_GROUPS_API}/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: res.error };
    const updated = mapStaffGroupRow(res.data as StaffGroupRow);
    set({
      staffGroups: get().staffGroups.map((g) =>
        g.id === id ? updated : g
      ),
    });
    return { ok: true, data: updated };
  },

  deleteStaffGroup: async (id) => {
    const res = await apiRequest<null>(`${STAFF_GROUPS_API}/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) return { ok: false, error: res.error };
    set({ staffGroups: get().staffGroups.filter((g) => g.id !== id) });
    return { ok: true };
  },

  // =============== Shifts ===============
  fetchShifts: async (params) => {
    set({ shiftsLoading: true });
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.branchId) qs.set("branch_id", params.branchId);
    if (params?.status) qs.set("status", params.status);
    if (params?.active !== undefined)
      qs.set("active", String(params.active));
    qs.set("page", String(params?.page ?? 1));
    qs.set("limit", String(params?.limit ?? 500));
    const url = `${SHIFTS_API}?${qs.toString()}`;
    const res = await apiRequest<ShiftRow[]>(url, { method: "GET" });
    if (!res.ok) {
      set({ shiftsLoading: false });
      return { ok: false, error: res.error };
    }
    const rows = res.data ?? [];
    const shifts = rows.map(mapShiftRow);
    set({ shifts, shiftsLoading: false });
    return { ok: true };
  },

  createShift: async (input) => {
    const payload: Record<string, unknown> = { name: input.name.trim() };
    if (input.workStart !== undefined) payload.work_start = input.workStart;
    if (input.workEnd !== undefined) payload.work_end = input.workEnd;
    if (input.checkInStart !== undefined)
      payload.check_in_start = input.checkInStart;
    if (input.checkInEnd !== undefined)
      payload.check_in_end = input.checkInEnd;
    if (input.note !== undefined) payload.note = input.note;
    if (input.isDefault !== undefined) payload.is_default = input.isDefault;
    if (input.status !== undefined) payload.status = input.status;
    if (input.branchId !== undefined) payload.branch_id = input.branchId;
    const res = await apiRequest<ShiftRow>(SHIFTS_API, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: res.error };
    const created = mapShiftRow(res.data as ShiftRow);
    set({ shifts: [created, ...get().shifts] });
    return { ok: true, data: created };
  },

  updateShift: async (id, input) => {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.workStart !== undefined) payload.work_start = input.workStart;
    if (input.workEnd !== undefined) payload.work_end = input.workEnd;
    if (input.checkInStart !== undefined)
      payload.check_in_start = input.checkInStart;
    if (input.checkInEnd !== undefined)
      payload.check_in_end = input.checkInEnd;
    if (input.note !== undefined) payload.note = input.note;
    if (input.isDefault !== undefined) payload.is_default = input.isDefault;
    if (input.status !== undefined) payload.status = input.status;
    if (input.branchId !== undefined) payload.branch_id = input.branchId;
    const res = await apiRequest<ShiftRow>(`${SHIFTS_API}/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: res.error };
    const updated = mapShiftRow(res.data as ShiftRow);
    set({
      shifts: get().shifts.map((s) => (s.id === id ? updated : s)),
    });
    return { ok: true, data: updated };
  },

  deleteShift: async (id) => {
    const res = await apiRequest<null>(`${SHIFTS_API}/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) return { ok: false, error: res.error };
    set({ shifts: get().shifts.filter((s) => s.id !== id) });
    return { ok: true };
  },
}));

import { create } from "zustand";
import { BookingStatusType } from "@/lib/constants";

export type BookingViewMode = "customer" | "staff";
export type DateNav = "today" | "tomorrow" | "7days";

export interface BookingServiceEntry {
  id: string;
  serviceCategoryId: string;
  serviceId: string;
  staffId: string;
  showNote: boolean;
  duration?: number;
}

/** Shape of booking_services rows as returned by the Supabase bookings API. */
export interface BookingServiceRow {
  id: string;
  booking_id: string;
  service_id: string;
  staff_id: string | null;
  service_category_id: string | null;
  sort_order: number;
  service: { id: string; name: string; code: string; price: number; duration: number } | null;
  category: { id: string; name: string } | null;
  staff: { id: string; name: string } | null;
}

export interface Booking {
  id: string;
  code: string;
  date: string;
  time: string;
  /** ISO timestamp from Supabase; used to derive date/time when those are empty. */
  date_time?: string;
  status: BookingStatusType;
  note: string | null;
  numberOfCustomers: number;
  customerSourceId: string | null;
  customerChannelId: string | null;
  source?: { id: string; name: string } | null;
  channel?: { id: string; name: string } | null;
  /** Raw creator staff id (UUID). Null when the booking was placed by a
   *  customer via the /dat-lich kiosk (no staff logged in). */
  created_by?: string | null;
  /** Creator staff profile ({ id, name }) resolved by the bookings API.
   *  Null when created_by is null (kiosk) OR the staff record was deleted. */
  createdBy: { id?: string; name?: string; email?: string } | null;
  customer: { id: string; name: string; phone: string; code: string };
  branch: { id: string; name: string } | null;
  services: BookingServiceEntry[] | BookingServiceRow[];
  invoice: { id: string; code?: string | null; status?: string; final_amount?: number | string; payment_method?: string } | null;
  /** Timestamp when the cashier marked this booking as "reminded" (Nhắc lịch).
   *  Null = not yet reminded. Set via PATCH /api/supabase/bookings/:id. */
  reminder_at?: string | null;
}

interface BookingStore {
  // Dialog state
  dialogOpen: boolean;
  selectedBooking: Booking | null;

  // View mode
  viewMode: BookingViewMode;
  setViewMode: (mode: BookingViewMode) => void;

  // Date navigation
  dateNav: DateNav;
  setDateNav: (nav: DateNav) => void;
  dateRange: { from: Date; to: Date };
  setDateRange: (range: { from: Date; to: Date }) => void;

  // Filters
  filterStaffId: string | null;
  setFilterStaffId: (staffId: string | null) => void;
  staffSearch: string;
  setStaffSearch: (search: string) => void;
  branchFilter: string | null;
  setBranchFilter: (id: string | null) => void;
  statusFilter: BookingStatusType | null;
  setStatusFilter: (status: BookingStatusType | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  /** ID of a booking to highlight (flash 3×) after cross-module navigation
   *  (e.g. from Thu ngân → Lịch hẹn). Set before navigating; cleared after
   *  the flash animation completes. */
  highlightBookingId: string | null;
  setHighlightBookingId: (id: string | null) => void;

  // Actions
  openDialog: (booking?: Booking) => void;
  closeDialog: () => void;
}

function getDateRangeFromNav(nav: DateNav): { from: Date; to: Date } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const from = new Date(now);
  const to = new Date(now);

  switch (nav) {
    case "today":
      to.setHours(23, 59, 59, 999);
      break;
    case "tomorrow":
      from.setDate(from.getDate() + 1);
      to.setDate(to.getDate() + 1);
      to.setHours(23, 59, 59, 999);
      break;
    case "7days":
      to.setDate(to.getDate() + 7);
      to.setHours(23, 59, 59, 999);
      break;
  }

  return { from, to };
}

export const useBookingStore = create<BookingStore>((set) => ({
  dialogOpen: false,
  selectedBooking: null,
  viewMode: "customer",
  dateNav: "today",
  dateRange: getDateRangeFromNav("today"),
  filterStaffId: null,
  staffSearch: "",
  branchFilter: null,
  statusFilter: null,
  searchQuery: "",
  highlightBookingId: null,

  openDialog: (booking?: Booking) =>
    set({ dialogOpen: true, selectedBooking: booking || null }),
  closeDialog: () => set({ dialogOpen: false, selectedBooking: null }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setDateNav: (nav) =>
    set({ dateNav: nav, dateRange: getDateRangeFromNav(nav) }),
  setDateRange: (range) => set({ dateRange: range }),
  setFilterStaffId: (staffId) => set({ filterStaffId: staffId }),
  setStaffSearch: (search) => set({ staffSearch: search }),
  setBranchFilter: (id) => set({ branchFilter: id }),
  setStatusFilter: (status) => set({ statusFilter: status }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setHighlightBookingId: (id) => set({ highlightBookingId: id }),
}));
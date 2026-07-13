import { create } from "zustand";
import type {
  WarehouseReportView,
  WarehouseTransferStatus,
} from "@/lib/constants";

interface WarehouseReportState {
  // Filters
  dateFrom: string;
  dateTo: string;
  categoryId: string;
  search: string;
  stockStatus: string;
  transferStatus: WarehouseTransferStatus;

  // View
  view: WarehouseReportView;

  // Pagination
  page: number;
  pageSize: number;

  // Actions
  setDateRange: (from: string, to: string) => void;
  setCategoryId: (id: string) => void;
  setSearch: (s: string) => void;
  setStockStatus: (s: string) => void;
  setTransferStatus: (s: WarehouseTransferStatus) => void;
  setView: (v: WarehouseReportView) => void;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export const useWarehouseReportStore = create<WarehouseReportState>((set) => ({
  dateFrom: today(),
  dateTo: today(),
  categoryId: "",
  search: "",
  stockStatus: "all",
  transferStatus: "completed",
  view: "inventory",
  page: 1,
  pageSize: 20,

  setDateRange: (dateFrom, dateTo) => set({ dateFrom, dateTo, page: 1 }),
  setCategoryId: (categoryId) => set({ categoryId, page: 1 }),
  setSearch: (search) => set({ search, page: 1 }),
  setStockStatus: (stockStatus) => set({ stockStatus, page: 1 }),
  setTransferStatus: (transferStatus) => set({ transferStatus, page: 1 }),
  setView: (view) => set({ view, page: 1 }),
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize, page: 1 }),
}));

import { create } from "zustand";

interface InvoiceFilterState {
  branchId: string;
  from: string;
  to: string;
  search: string;
  status: "all" | "paid" | "unpaid" | "cancelled";
  page: number;
  limit: number;
  setBranchId: (branchId: string) => void;
  setFrom: (from: string) => void;
  setTo: (to: string) => void;
  setSearch: (search: string) => void;
  setStatus: (status: "all" | "paid" | "unpaid" | "cancelled") => void;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  resetFilters: () => void;
}

export const useInvoiceFilterStore = create<InvoiceFilterState>((set) => ({
  branchId: "",
  from: "",
  to: "",
  search: "",
  status: "all",
  page: 1,
  limit: 20,
  setBranchId: (branchId) => set({ branchId, page: 1 }),
  setFrom: (from) => set({ from, page: 1 }),
  setTo: (to) => set({ to, page: 1 }),
  setSearch: (search) => set({ search, page: 1 }),
  setStatus: (status) => set({ status, page: 1 }),
  setPage: (page) => set({ page }),
  setLimit: (limit) => set({ limit, page: 1 }),
  resetFilters: () =>
    set({
      branchId: "",
      from: "",
      to: "",
      search: "",
      status: "all",
      page: 1,
      limit: 20,
    }),
}));
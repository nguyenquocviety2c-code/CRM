import { create } from "zustand";

interface ActivityFilterState {
  branchId: string;
  from: string;
  to: string;
  search: string;
  action: string;
  page: number;
  limit: number;
  setBranchId: (branchId: string) => void;
  setFrom: (from: string) => void;
  setTo: (to: string) => void;
  setSearch: (search: string) => void;
  setAction: (action: string) => void;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  resetFilters: () => void;
}

export const useActivityFilterStore = create<ActivityFilterState>((set) => ({
  branchId: "",
  from: "",
  to: "",
  search: "",
  action: "",
  page: 1,
  limit: 20,
  setBranchId: (branchId) => set({ branchId, page: 1 }),
  setFrom: (from) => set({ from, page: 1 }),
  setTo: (to) => set({ to, page: 1 }),
  setSearch: (search) => set({ search, page: 1 }),
  setAction: (action) => set({ action, page: 1 }),
  setPage: (page) => set({ page }),
  setLimit: (limit) => set({ limit, page: 1 }),
  resetFilters: () =>
    set({
      branchId: "",
      from: "",
      to: "",
      search: "",
      action: "",
      page: 1,
      limit: 20,
    }),
}));
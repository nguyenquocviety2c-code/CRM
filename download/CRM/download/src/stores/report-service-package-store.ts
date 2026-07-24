import { create } from "zustand";
import type { ServicePackageReportView } from "@/lib/constants";

interface ServicePackageReportState {
  // View
  view: ServicePackageReportView;

  // Filters
  customerSearch: string;
  categoryId: string;
  packageSearch: string; // usage view only

  // Pagination
  page: number;
  pageSize: number;

  // Actions
  setView: (v: ServicePackageReportView) => void;
  setCustomerSearch: (s: string) => void;
  setCategoryId: (s: string) => void;
  setPackageSearch: (s: string) => void;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
}

export const useServicePackageReportStore = create<ServicePackageReportState>(
  (set) => ({
    view: "purchased",
    customerSearch: "",
    categoryId: "",
    packageSearch: "",
    page: 1,
    pageSize: 20,

    setView: (view) => set({ view, page: 1 }),
    setCustomerSearch: (customerSearch) => set({ customerSearch, page: 1 }),
    setCategoryId: (categoryId) => set({ categoryId, page: 1 }),
    setPackageSearch: (packageSearch) => set({ packageSearch, page: 1 }),
    setPage: (page) => set({ page }),
    setPageSize: (pageSize) => set({ pageSize, page: 1 }),
  })
);

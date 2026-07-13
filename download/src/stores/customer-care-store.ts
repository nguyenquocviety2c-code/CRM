import { create } from "zustand";

export interface CustomerSet {
  id: string;
  name: string;
  note: string | null;
  autoUpdate: boolean;
  createdAt: string;
  updatedAt: string;
  conditions: CustomerSetCondition[];
}

export interface CustomerSetCondition {
  id: string;
  customerSetId: string;
  conditionType: string;
  conditionValue: string | null;
}

export interface Incentive {
  id: string;
  code: string | null;
  name: string;
  applyScope: string | null;
  startDate: string | null;
  endDate: string | null;
  branchIds: string | null;
  discountType: string | null;
  serviceIds: string | null;
  discountValue: number;
  usageLimit: number;
  autoApplyTarget: string | null;
  type: string;
  usedCount: number;
  unusedCount: number;
  expiredCount: number;
  cost: number;
  createdAt: string;
  updatedAt: string;
}

interface CustomerCareStore {
  // Customer Set Dialog
  dialogOpen: boolean;
  selectedCustomerSet: CustomerSet | null;
  // Customer Set Delete dialog
  deleteDialogOpen: boolean;
  deletingCustomerSet: CustomerSet | null;
  // Incentive Dialog
  incentiveDialogOpen: boolean;
  selectedIncentive: Incentive | null;
  // Incentive Delete dialog
  incentiveDeleteDialogOpen: boolean;
  deletingIncentive: Incentive | null;
  // Filters
  search: string;
  page: number;
  limit: number;
  setSearch: (search: string) => void;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  // Actions
  openCreateDialog: () => void;
  openEditDialog: (customerSet: CustomerSet) => void;
  closeDialog: () => void;
  openDeleteDialog: (customerSet: CustomerSet) => void;
  closeDeleteDialog: () => void;
  openIncentiveCreateDialog: () => void;
  openIncentiveEditDialog: (incentive: Incentive) => void;
  closeIncentiveDialog: () => void;
  openIncentiveDeleteDialog: (incentive: Incentive) => void;
  closeIncentiveDeleteDialog: () => void;
}

export const useCustomerCareStore = create<CustomerCareStore>((set) => ({
  dialogOpen: false,
  selectedCustomerSet: null,
  deleteDialogOpen: false,
  deletingCustomerSet: null,
  incentiveDialogOpen: false,
  selectedIncentive: null,
  incentiveDeleteDialogOpen: false,
  deletingIncentive: null,

  openCreateDialog: () => set({ dialogOpen: true, selectedCustomerSet: null }),
  openEditDialog: (customerSet) =>
    set({ dialogOpen: true, selectedCustomerSet: customerSet }),
  closeDialog: () => set({ dialogOpen: false, selectedCustomerSet: null }),
  openDeleteDialog: (customerSet) =>
    set({ deleteDialogOpen: true, deletingCustomerSet: customerSet }),
  closeDeleteDialog: () =>
    set({ deleteDialogOpen: false, deletingCustomerSet: null }),
  openIncentiveCreateDialog: () =>
    set({ incentiveDialogOpen: true, selectedIncentive: null }),
  openIncentiveEditDialog: (incentive) =>
    set({ incentiveDialogOpen: true, selectedIncentive: incentive }),
  closeIncentiveDialog: () =>
    set({ incentiveDialogOpen: false, selectedIncentive: null }),
  openIncentiveDeleteDialog: (incentive) =>
    set({ incentiveDeleteDialogOpen: true, deletingIncentive: incentive }),
  closeIncentiveDeleteDialog: () =>
    set({ incentiveDeleteDialogOpen: false, deletingIncentive: null }),
  search: "",
  page: 1,
  limit: 20,
  setSearch: (search) => set({ search }),
  setPage: (page) => set({ page }),
  setLimit: (limit) => set({ limit }),
}));

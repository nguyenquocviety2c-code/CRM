import { create } from "zustand";

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  birthday: string | null;
  address: string | null;
  note: string | null;
  totalSpent: number;
  debt: number;
  active: boolean;
  source: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  rank: { id: string; name: string } | null;
  /** Liên lạc channel — comes from the booking's customer_channel_id. May be null. */
  channel?: { id: string; name: string } | null;
  sourceId: string | null;
  groupId: string | null;
  rankId: string | null;
  /** "old" = has >=1 completed invoice; "new" = no completed invoice. */
  customer_type?: "old" | "new";
  has_completed_invoice?: boolean;
  // Supabase returns snake_case fields. Kept optional for legacy callers.
  total_spent?: number;
  source_id?: string | null;
  group_id?: string | null;
  branch_id?: string | null;
}

interface CustomerStore {
  // Dialog
  dialogOpen: boolean;
  selectedCustomer: Customer | null;
  // Delete dialog
  deleteDialogOpen: boolean;
  deletingCustomer: Customer | null;
  // Filters
  filterSource: string;
  filterGroup: string;
  filterRank: string;
  // Actions
  openCreateDialog: () => void;
  openEditDialog: (customer: Customer) => void;
  closeDialog: () => void;
  openDeleteDialog: (customer: Customer) => void;
  closeDeleteDialog: () => void;
  setFilterSource: (source: string) => void;
  setFilterGroup: (group: string) => void;
  setFilterRank: (rank: string) => void;
}

export const useCustomerStore = create<CustomerStore>((set) => ({
  dialogOpen: false,
  selectedCustomer: null,
  deleteDialogOpen: false,
  deletingCustomer: null,
  filterSource: "",
  filterGroup: "",
  filterRank: "",

  openCreateDialog: () => set({ dialogOpen: true, selectedCustomer: null }),
  openEditDialog: (customer) =>
    set({ dialogOpen: true, selectedCustomer: customer }),
  closeDialog: () => set({ dialogOpen: false, selectedCustomer: null }),
  openDeleteDialog: (customer) =>
    set({ deleteDialogOpen: true, deletingCustomer: customer }),
  closeDeleteDialog: () =>
    set({ deleteDialogOpen: false, deletingCustomer: null }),
  setFilterSource: (source) => set({ filterSource: source }),
  setFilterGroup: (group) => set({ filterGroup: group }),
  setFilterRank: (rank) => set({ filterRank: rank }),
}));
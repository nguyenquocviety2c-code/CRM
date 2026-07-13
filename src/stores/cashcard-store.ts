import { create } from "zustand";

export interface CashCard {
  id: string;
  code: string;
  balance: number;
  status: "active" | "locked" | "expired";
  expiryDate: string | null;
  lockedUntil: string | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string } | null;
  coOwner: { id: string; name: string } | null;
}

interface CashCardStore {
  // Dialog states
  createDialogOpen: boolean;
  extendDialogOpen: boolean;
  lockDialogOpen: boolean;
  topupDialogOpen: boolean;
  deleteDialogOpen: boolean;
  // Selected card
  selectedCard: CashCard | null;
  deletingCard: CashCard | null;
  // Filters
  search: string;
  customerSearch: string;
  // Actions
  openCreateDialog: () => void;
  openExtendDialog: (card: CashCard) => void;
  openLockDialog: (card: CashCard) => void;
  openTopupDialog: (card: CashCard) => void;
  openDeleteDialog: (card: CashCard) => void;
  closeAllDialogs: () => void;
  setSearch: (search: string) => void;
  setCustomerSearch: (search: string) => void;
}

export const useCashCardStore = create<CashCardStore>((set) => ({
  createDialogOpen: false,
  extendDialogOpen: false,
  lockDialogOpen: false,
  topupDialogOpen: false,
  deleteDialogOpen: false,
  selectedCard: null,
  deletingCard: null,
  search: "",
  customerSearch: "",

  openCreateDialog: () =>
    set({ createDialogOpen: true, selectedCard: null }),
  openExtendDialog: (card) =>
    set({ extendDialogOpen: true, selectedCard: card }),
  openLockDialog: (card) =>
    set({ lockDialogOpen: true, selectedCard: card }),
  openTopupDialog: (card) =>
    set({ topupDialogOpen: true, selectedCard: card }),
  openDeleteDialog: (card) =>
    set({ deleteDialogOpen: true, deletingCard: card }),
  closeAllDialogs: () =>
    set({
      createDialogOpen: false,
      extendDialogOpen: false,
      lockDialogOpen: false,
      topupDialogOpen: false,
      deleteDialogOpen: false,
      selectedCard: null,
      deletingCard: null,
    }),
  setSearch: (search) => set({ search }),
  setCustomerSearch: (customerSearch) => set({ customerSearch }),
}));
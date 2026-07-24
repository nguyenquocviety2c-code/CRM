"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Branch {
  id: string;
  name: string;
  active: boolean;
}

interface BranchState {
  branches: Branch[];
  selectedBranchId: string | null;
  setBranches: (branches: Branch[]) => void;
  setSelectedBranchId: (id: string | null) => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set, get) => ({
      branches: [],
      selectedBranchId: null,
      // When branches are loaded, DO NOT overwrite the existing selection.
      // The selectedBranchId is persisted to localStorage so it survives
      // page reloads and module/tab switches. We only auto-select the first
      // branch if nothing is selected yet (initial load).
      setBranches: (branches) =>
        set((state) => {
          const current = state.selectedBranchId;
          // Keep the current selection if it still exists in the new list.
          if (current && branches.some((b) => b.id === current)) {
            return { branches };
          }
          // Keep "all" selection too (multi-branch view).
          if (current === "all") {
            return { branches };
          }
          // Otherwise auto-select the first active branch (or first branch).
          return {
            branches,
            selectedBranchId:
              branches.find((b) => b.active)?.id || branches[0]?.id || null,
          };
        }),
      setSelectedBranchId: (id) => set({ selectedBranchId: id }),
    }),
    {
      name: "branch-store",
      // Only persist the selection (not the branches list, which is always
      // re-fetched from the API — avoids stale data if branches change).
      partialize: (state) => ({ selectedBranchId: state.selectedBranchId }),
    }
  )
);

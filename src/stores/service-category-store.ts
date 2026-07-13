import { create } from "zustand";
import { ServiceCategory } from "@/types/product-service";

interface ServiceCategoryState {
  items: ServiceCategory[];
  search: string;
  dialogOpen: boolean;
  dialogMode: "create" | "edit";
  editingId: string | null;
  loading: boolean;
  setSearch: (s: string) => void;
  openDialog: (mode: "create" | "edit", id?: string) => void;
  closeDialog: () => void;
  fetchItems: (branchId?: string) => Promise<void>;
  addItem: (name: string, branchIds?: string[]) => Promise<void>;
  updateItem: (id: string, name: string, branchIds?: string[]) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

export const useServiceCategoryStore = create<ServiceCategoryState>((set, get) => ({
  items: [],
  search: "",
  dialogOpen: false,
  dialogMode: "create",
  editingId: null,
  loading: false,

  setSearch: (s) => set({ search: s }),

  openDialog: (mode, id) =>
    set({
      dialogOpen: true,
      dialogMode: mode,
      editingId: id || null,
    }),

  closeDialog: () =>
    set({
      dialogOpen: false,
      editingId: null,
    }),

  fetchItems: async (branchId?: string) => {
    set({ loading: true });
    try {
      const url = branchId
        ? `/api/supabase/service-categories?branch_id=${branchId}`
        : "/api/supabase/service-categories";
      const response = await fetch(url);
      const result = await response.json();
      if (result.ok) {
        const rows = Array.isArray(result.data) ? result.data : [];
        set({
          items: rows.map((r: Record<string, unknown>) => ({
            id: String(r.id),
            name: String(r.name ?? ""),
            branchId: (r.branch_id as string) || null,
            branches: (r.branches as string[]) || [],
          })),
        });
      }
    } catch (error) {
      console.error("Error fetching service categories:", error);
    } finally {
      set({ loading: false });
    }
  },

  addItem: async (name, branchIds) => {
    try {
      const response = await fetch("/api/supabase/service-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, branch_ids: branchIds || [] }),
      });
      const result = await response.json();
      if (result.ok) {
        await get().fetchItems();
      }
    } catch (error) {
      console.error("Error creating service category:", error);
    }
  },

  updateItem: async (id, name, branchIds) => {
    try {
      const response = await fetch(`/api/supabase/service-categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, branch_ids: branchIds || [] }),
      });
      const result = await response.json();
      if (result.ok) {
        await get().fetchItems();
      }
    } catch (error) {
      console.error("Error updating service category:", error);
    }
  },

  deleteItem: async (id) => {
    try {
      const response = await fetch(`/api/supabase/service-categories/${id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (result.ok) {
        await get().fetchItems();
      }
    } catch (error) {
      console.error("Error deleting service category:", error);
    }
  },
}));

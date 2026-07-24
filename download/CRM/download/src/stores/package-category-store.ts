import { create } from "zustand";
import { PackageCategory } from "@/types/product-service";

interface PackageCategoryState {
  items: PackageCategory[];
  search: string;
  page: number;
  pageSize: number;
  dialogOpen: boolean;
  dialogMode: "create" | "edit";
  editingId: string | null;
  deleteTargetId: string | null;
  deleteTargetName: string | null;
  loading: boolean;
  setSearch: (s: string) => void;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
  openDialog: (mode: "create" | "edit", id?: string) => void;
  closeDialog: () => void;
  openDeleteConfirm: (id: string, name: string) => void;
  closeDeleteConfirm: () => void;
  fetchItems: () => Promise<void>;
  addItem: (name: string) => Promise<void>;
  updateItem: (id: string, name: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

export const usePackageCategoryStore = create<PackageCategoryState>(
  (set, get) => ({
    items: [],
    search: "",
    page: 1,
    pageSize: 20,
    dialogOpen: false,
    dialogMode: "create",
    editingId: null,
    deleteTargetId: null,
    deleteTargetName: null,
    loading: false,

    setSearch: (s) => set({ search: s, page: 1 }),

    setPage: (n) => set({ page: n }),

    setPageSize: (n) => set({ pageSize: n, page: 1 }),

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

    openDeleteConfirm: (id, name) =>
      set({
        deleteTargetId: id,
        deleteTargetName: name,
      }),

    closeDeleteConfirm: () =>
      set({
        deleteTargetId: null,
        deleteTargetName: null,
      }),

    fetchItems: async () => {
      set({ loading: true });
      try {
        const response = await fetch("/api/supabase/package-categories");
        const result = await response.json();
        if (result.ok) {
          const rows = Array.isArray(result.data) ? result.data : [];
          set({
            items: rows.map((r: Record<string, unknown>) => ({
              id: String(r.id),
              name: String(r.name ?? ""),
            })),
          });
        }
      } catch (error) {
        console.error("Error fetching package categories:", error);
      } finally {
        set({ loading: false });
      }
    },

    addItem: async (name) => {
      try {
        const response = await fetch("/api/supabase/package-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const result = await response.json();
        if (result.ok) {
          await get().fetchItems();
        }
      } catch (error) {
        console.error("Error creating package category:", error);
      }
    },

    updateItem: async (id, name) => {
      try {
        const response = await fetch(
          `/api/supabase/package-categories/${id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          }
        );
        const result = await response.json();
        if (result.ok) {
          await get().fetchItems();
        }
      } catch (error) {
        console.error("Error updating package category:", error);
      }
    },

    deleteItem: async (id) => {
      try {
        const response = await fetch(
          `/api/supabase/package-categories/${id}`,
          {
            method: "DELETE",
          }
        );
        const result = await response.json();
        if (result.ok) {
          await get().fetchItems();
        }
      } catch (error) {
        console.error("Error deleting package category:", error);
      }
    },
  })
);

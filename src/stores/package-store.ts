import { create } from "zustand";
import { Package } from "@/types/product-service";
import { useBranchStore } from "@/stores/branch-store";

interface PackageState {
  items: Package[];
  search: string;
  categoryFilter: string;
  page: number;
  pageSize: number;
  loading: boolean;
  setSearch: (s: string) => void;
  setCategoryFilter: (id: string) => void;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
  fetchItems: () => Promise<void>;
  toggleActive: (id: string) => Promise<void>;
}

/**
 * Map a Supabase package row (snake_case with joined tables) to the
 * frontend Package interface (camelCase).
 */
function mapPackageRow(row: Record<string, unknown>): Package {
  const category = row.package_categories as { id?: string; name?: string } | null;
  const items = Array.isArray(row.package_items)
    ? (row.package_items as Array<Record<string, unknown>>)
    : [];

  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    totalPrice: Number(row.total_price ?? 0),
    discountPrice: Number(row.discount_price ?? 0),
    active: Boolean(row.active ?? true),
    categoryId: (row.category_id as string | null) ?? null,
    category: category
      ? { id: String(category.id ?? ""), name: String(category.name ?? "") }
      : null,
    items,
    createdAt: String(row.created_at ?? ""),
  };
}

export const usePackageStore = create<PackageState>((set, get) => ({
  items: [],
  search: "",
  categoryFilter: "all",
  page: 1,
  pageSize: 20,
  loading: false,

  setSearch: (s) => set({ search: s, page: 1 }),

  setCategoryFilter: (id) => set({ categoryFilter: id, page: 1 }),

  setPage: (n) => set({ page: n }),

  setPageSize: (n) => set({ pageSize: n, page: 1 }),

  fetchItems: async () => {
    set({ loading: true });
    try {
      const params = new URLSearchParams();
      if (get().search) params.append("search", get().search);
      if (get().categoryFilter !== "all")
        params.append("category_id", get().categoryFilter);

      // Filter by the globally-selected branch (the BranchSelector in the page
      // header). "all" / null / "" → no branch filter (show packages from every
      // branch). The packages API probes for a branch_id column at runtime and
      // gracefully no-ops if the table doesn't have one, so this is safe.
      const branchId = useBranchStore.getState().selectedBranchId;
      if (branchId && branchId !== "all") {
        params.append("branch_id", branchId);
      }

      const response = await fetch(`/api/supabase/packages?${params.toString()}`);
      const result = await response.json();
      if (result.ok) {
        const rows = Array.isArray(result.data) ? result.data : [];
        set({ items: rows.map(mapPackageRow) });
      }
    } catch (error) {
      console.error("Error fetching packages:", error);
    } finally {
      set({ loading: false });
    }
  },

  toggleActive: async (id) => {
    const current = get().items.find((item) => item.id === id);
    if (!current) return;
    const next = !current.active;
    // Optimistically update UI.
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, active: next } : item
      ),
    }));
    try {
      const response = await fetch(`/api/supabase/packages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      const result = await response.json();
      if (!result.ok) {
        // Revert on failure.
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, active: !next } : item
          ),
        }));
      }
    } catch (error) {
      console.error("Error toggling package active:", error);
      // Revert on error.
      set((state) => ({
        items: state.items.map((item) =>
          item.id === id ? { ...item, active: !next } : item
        ),
      }));
    }
  },
}));

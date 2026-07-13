"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, ChevronDown, Scissors, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ServiceList } from "@/components/features/product-service/service-list";
import { ServiceFilter } from "@/components/features/product-service/service-filter";
import { ServiceDialog } from "@/components/features/product-service/service-dialog";
import { ServiceCategoryDialog } from "@/components/features/product-service/service-category-dialog";
import { Service } from "@/types";
import { BranchSelector } from "@/components/layout/branch-selector";
import { useServiceCategoryStore } from "@/stores/service-category-store";
import {
  ColumnDef,
  buildDefaultVisibleColumns,
  toggleColumnKey,
} from "@/components/shared/column-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Column definitions for the visibility toggle.
const SERVICE_COLUMN_DEFS: ColumnDef[] = [
  { key: "stt", label: "STT" },
  { key: "name", label: "Tên dịch vụ" },
  { key: "category", label: "Nhóm" },
  { key: "branch", label: "Chi nhánh" },
  { key: "price", label: "Đơn giá" },
  { key: "active", label: "Sẵn sàng bán" },
];

/**
 * Map a Supabase service row (snake_case with joined tables) to the
 * frontend Service interface (camelCase).
 */
function mapServiceRow(row: Record<string, unknown>): Service {
  const category = (row.category || row.service_categories) as { id?: string; name?: string } | null;
  const branch = (row.branch || row.branches) as { id?: string; name?: string } | null;
  const subPrices = Array.isArray(row.sub_prices || row.service_sub_prices)
    ? (row.sub_prices || row.service_sub_prices as Array<Record<string, unknown>>).map((sp) => ({
        label: String(sp.label ?? ""),
        price: Number(sp.price ?? 0),
      }))
    : [];

  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    price: Number(row.price ?? 0),
    cost: Number(row.cost ?? 0),
    costType: String(row.cost_type ?? "VND"),
    subPrices,
    duration: Number(row.duration ?? 0),
    active: Boolean(row.active ?? true),
    allowBooking: Boolean(row.allow_booking ?? true),
    showOnApp: Boolean(row.show_on_app ?? true),
    categoryId: (row.category_id as string | null) ?? null,
    category: category ? { name: category.name ?? "" } : null,
    branchId: (row.branch_id as string | null) ?? null,
    branch: branch ? { name: branch.name ?? "" } : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export default function ServicePage() {
  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => buildDefaultVisibleColumns(SERVICE_COLUMN_DEFS)
  );
  const toggleColumn = (key: string) =>
    setVisibleColumns((prev) => toggleColumnKey(prev, key));

  // Service category store — single source of truth for categories.
  // The ServiceCategoryDialog reads from this store (items, dialogOpen,
  // dialogMode, editingId) and writes to it (addItem, updateItem, fetchItems).
  const {
    items: categoryItems,
    openDialog: openCategoryDialog,
    fetchItems: fetchCategories,
  } = useServiceCategoryStore();
  // Derive the {id, name}[] list for the filter + service dialog.
  const categories = categoryItems.map((c) => ({ id: c.id, name: c.name }));

  const fetchServices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (categoryFilter) params.append("category_id", categoryFilter);

      const response = await fetch(`/api/supabase/services?${params.toString()}`);
      const result = await response.json();
      if (result.ok) {
        let rows = Array.isArray(result.data) ? result.data : [];
        // Filter by the page-level "Lọc theo chi nhánh" dropdown. This is
        // independent from the global BranchSelector — it lets the user view
        // services available at a specific branch or at all branches.
        // branch_id is a comma-separated UUID string; a service belongs to a
        // branch if the branch id appears in that list.
        if (branchFilter && branchFilter !== "all") {
          rows = rows.filter((s: Record<string, unknown>) => {
            const svcBranchIds = String(s.branch_id || "").split(",").map((x) => x.trim());
            return svcBranchIds.includes(branchFilter);
          });
        }
        setServices(rows.map(mapServiceRow));
      }
    } catch (error) {
      console.error("Error fetching services:", error);
    }
  }, [search, categoryFilter, branchFilter]);

  // Load reference data (categories via store, branches + products directly) once on mount.
  useEffect(() => {
    void fetchCategories();
    void (async () => {
      try {
        const [branchRes, prodRes] = await Promise.all([
          fetch("/api/supabase/branches"),
          fetch("/api/supabase/products"),
        ]);
        const [branchJson, prodJson] = await Promise.all([
          branchRes.json(),
          prodRes.json(),
        ]);
        if (branchJson.ok) {
          const rows = Array.isArray(branchJson.data) ? branchJson.data : [];
          setBranches(
            rows.map((b: Record<string, unknown>) => ({
              id: String(b.id),
              name: String(b.name),
            }))
          );
        }
        if (prodJson.ok) {
          const rows = Array.isArray(prodJson.data) ? prodJson.data : [];
          setProducts(
            rows.map((p: Record<string, unknown>) => ({
              id: String(p.id),
              name: String(p.name),
            }))
          );
        }
      } catch (error) {
        console.error("Error fetching reference data:", error);
      }
    })();
  }, [fetchCategories]);

  // Reload services whenever search, category filter, or categories change.
  // The categoryItems dependency ensures services are re-fetched after a
  // category is added/edited/deleted (so the Nhóm column shows updated names).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchServices();
  }, [fetchServices, categoryItems]);

  const handleCreateService = async (data: unknown) => {
    try {
      const form = data as Record<string, unknown>;
      const payload: Record<string, unknown> = {
        name: form.name,
        price: form.price,
        cost: form.cost,
        cost_type: form.costType ?? "VND",
        duration: form.duration,
        category_id: form.categoryId || null,
        branch_id: form.branchId || null,
        allow_booking: form.allowBooking ?? true,
        show_on_app: form.showOnApp ?? true,
        sub_prices: Array.isArray(form.subPrices)
          ? (form.subPrices as Array<Record<string, unknown>>).map((sp) => ({
              label: sp.label,
              price: sp.price,
            }))
          : [],
        attached_products: Array.isArray(form.attachedProducts)
          ? (form.attachedProducts as Array<Record<string, unknown>>).map((ap) => ({
              product_id: ap.productId,
              quantity: 1,
            }))
          : [],
      };

      const response = await fetch("/api/supabase/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.ok) {
        fetchServices();
        setIsDialogOpen(false);
      }
    } catch (error) {
      console.error("Error creating service:", error);
    }
  };

  const handleToggleAvailability = async (id: string, active: boolean) => {
    try {
      const response = await fetch(`/api/supabase/services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const result = await response.json();
      if (result.ok) {
        fetchServices();
      }
    } catch (error) {
      console.error("Error toggling availability:", error);
    }
  };

  const handleEditService = async (data: unknown) => {
    if (!editingServiceId) return;
    try {
      const form = data as Record<string, unknown>;
      const payload: Record<string, unknown> = {
        name: form.name,
        price: form.price,
        cost: form.cost,
        cost_type: form.costType ?? "VND",
        duration: form.duration,
        category_id: form.categoryId || null,
        branch_id: form.branchId || null,
        allow_booking: form.allowBooking ?? true,
        show_on_app: form.showOnApp ?? true,
      };

      const response = await fetch(`/api/supabase/services/${editingServiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.ok) {
        fetchServices();
        setIsDialogOpen(false);
        setEditingServiceId(null);
      }
    } catch (error) {
      console.error("Error updating service:", error);
    }
  };

  const handleDeleteService = async (id: string) => {
    try {
      const response = await fetch(`/api/supabase/services/${id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (result.ok) {
        fetchServices();
        setIsDialogOpen(false);
        setEditingServiceId(null);
      } else {
        alert(result.error || "Không thể xóa dịch vụ");
      }
    } catch (error) {
      console.error("Error deleting service:", error);
      alert("Không thể xóa dịch vụ");
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6 bg-gray-50 min-h-[calc(100vh-4rem)]">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Danh sách dịch vụ</h1>
            <div className="flex items-center gap-4">
              <BranchSelector />
              {/* Tạo mới dropdown — 2 options: Dịch vụ / Nhóm dịch vụ */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Tạo mới
                    <ChevronDown className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditingServiceId(null);
                      setIsDialogOpen(true);
                    }}
                  >
                    <Scissors className="h-4 w-4 mr-2" />
                    Dịch vụ
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => openCategoryDialog("create")}
                  >
                    <Layers className="h-4 w-4 mr-2" />
                    Nhóm dịch vụ
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Filter */}
          <ServiceFilter
            onSearchChange={setSearch}
            onCategoryChange={setCategoryFilter}
            categories={categories}
            columnDefs={SERVICE_COLUMN_DEFS}
            visibleColumns={visibleColumns}
            onToggleColumn={toggleColumn}
            branches={branches}
            branchFilter={branchFilter}
            onBranchChange={setBranchFilter}
          />

          {/* List */}
          <ServiceList
            services={services}
            onToggleAvailability={handleToggleAvailability}
            onEdit={(id) => {
              setEditingServiceId(id);
              setIsDialogOpen(true);
            }}
            onEditCategory={(categoryId) => openCategoryDialog("edit", categoryId)}
            visibleColumns={visibleColumns}
            branches={branches}
          />
        </div>

        {/* Service Dialog (create / edit service) */}
        <ServiceDialog
          open={isDialogOpen}
          onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingServiceId(null); }}
          onSubmit={editingServiceId ? handleEditService : handleCreateService}
          onDelete={handleDeleteService}
          categories={categories}
          branches={branches}
          products={products}
          editService={editingServiceId ? services.find(s => s.id === editingServiceId) as React.ComponentProps<typeof ServiceDialog>["editService"] : null}
        />

        {/* Service Category Dialog (create / edit category) */}
        <ServiceCategoryDialog />
      </div>
    </div>
  );
}

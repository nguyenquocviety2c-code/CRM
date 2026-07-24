"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useCustomerCareStore } from "@/stores/customer-care-store";
import { IncentivesTabs } from "@/components/features/customer-care/incentives-tabs";
import { PromotionList } from "@/components/features/customer-care/promotion-list";
import { VoucherList } from "@/components/features/customer-care/voucher-list";
import { IncentiveDialog } from "@/components/features/customer-care/incentive-dialog";
import { useToast } from "@/hooks/use-toast";

type SubTab = "promotion" | "voucher";

interface IncentiveItem {
  id: string;
  code: string;
  name: string;
  discountValue: number;
  applyScope: string | null;
  serviceIds: string | null;
  startDate: string | null;
  endDate: string | null;
  usageLimit: number;
  usedCount: number;
  unusedCount: number;
  expiredCount: number;
  cost: number;
  branchIds?: string | null;
  discountType?: string | null;
  autoApplyTarget?: string | null;
  type?: string | null;
}

export default function IncentivesPage() {
  const [activeTab, setActiveTab] = useState<SubTab>("promotion");
  const [dialogOpen, setDialogOpen] = useState(false);
  // The incentive being edited (null = create mode). Tracked here so the
  // IncentiveDialog can be pre-filled and the submit handler knows whether
  // to POST (create) or PUT (update).
  const [editingIncentive, setEditingIncentive] = useState<IncentiveItem | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { search, page, limit } = useCustomerCareStore();

  // Fetch promotions
  const {
    data: promotionsData,
    isLoading: promotionsLoading,
    error: promotionsError,
  } = useQuery({
    queryKey: queryKeys.customerCare.incentives.list({ search, page, limit }),
    queryFn: async () => {
      const params = new URLSearchParams({
        search,
        page: String(page),
        limit: String(limit),
        type: "promotion",
      });
      const res = await fetch(`/api/supabase/incentives?${params}`);
      if (!res.ok) throw new Error("Failed to fetch promotions");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Unknown error");
      return json.data;
    },
    placeholderData: (previousData) => previousData,
  });

  // Fetch vouchers
  const {
    data: vouchersData,
    isLoading: vouchersLoading,
    error: vouchersError,
  } = useQuery({
    queryKey: queryKeys.customerCare.vouchers.list({ search, page, limit }),
    queryFn: async () => {
      const params = new URLSearchParams({
        search,
        page: String(page),
        limit: String(limit),
        type: "voucher",
      });
      const res = await fetch(`/api/supabase/incentives?${params}`);
      if (!res.ok) throw new Error("Failed to fetch vouchers");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Unknown error");
      return json.data;
    },
    placeholderData: (previousData) => previousData,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: unknown) => {
      const res = await fetch("/api/supabase/incentives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Unknown error");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerCare.incentives.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.customerCare.vouchers.all });
      toast({ title: "Tạo khuyến mãi thành công" });
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    },
  });

  // Update mutation (PUT to /api/supabase/incentives/:id). Reuses the same
  // form payload as create; the API's PUT handler maps camelCase -> snake_case.
  const updateMutation = useMutation({
    mutationFn: async (data: unknown) => {
      const payload = data as { id?: string };
      if (!payload.id) throw new Error("Missing incentive id");
      const { id, ...body } = payload;
      const res = await fetch(`/api/supabase/incentives/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Unknown error");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerCare.incentives.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.customerCare.vouchers.all });
      toast({ title: "Cập nhật khuyến mãi thành công" });
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/supabase/incentives/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Unknown error");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerCare.incentives.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.customerCare.vouchers.all });
      toast({ title: "Xóa khuyến mãi thành công" });
    },
    onError: (error: Error) => {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    },
  });

  // Open the dialog in EDIT mode with the selected incentive pre-filled.
  const handleEdit = (item: IncentiveItem) => {
    setEditingIncentive(item);
    setDialogOpen(true);
  };

  // Submit handler: routes to update (PUT) when editing, create (POST) otherwise.
  // Includes the editing incentive's id so updateMutation can build the PUT URL.
  const handleSubmit = (data: unknown) => {
    if (editingIncentive) {
      updateMutation.mutate({ ...(data as Record<string, unknown>), id: editingIncentive.id });
    } else {
      createMutation.mutate(data);
    }
  };

  // Open the dialog in CREATE mode (clears any previously-edited item).
  const handleOpenCreate = () => {
    setEditingIncentive(null);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Bạn có chắc muốn xóa khuyến mãi này?")) {
      deleteMutation.mutate(id);
    }
  };

  const promotions = (promotionsData?.items as IncentiveItem[]) || [];
  const vouchers = (vouchersData?.items as IncentiveItem[]) || [];

  return (
    <div className="space-y-4">
      <IncentivesTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "promotion" && (
        <PromotionList
          promotions={promotions}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onCreate={handleOpenCreate}
        />
      )}

      {activeTab === "voucher" && (
        <VoucherList
          vouchers={vouchers}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onCreate={handleOpenCreate}
        />
      )}

      <IncentiveDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          // Clear the editing target when the dialog closes so the next open
          // starts in create mode unless handleEdit sets a new target.
          if (!v) setEditingIncentive(null);
        }}
        onSubmit={handleSubmit}
        initialData={editingIncentive}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
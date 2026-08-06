"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useCustomerCareStore } from "@/stores/customer-care-store";
import { IncentivesTabs } from "@/components/features/customer-care/incentives-tabs";
import { PromotionList } from "@/components/features/customer-care/promotion-list";
import { VoucherList } from "@/components/features/customer-care/voucher-list";
import { IncentiveDialog } from "@/components/features/customer-care/incentive-dialog";
import {
  IncentiveDetailDialog,
  type IncentiveDetail,
} from "@/components/features/customer-care/incentive-detail-dialog";
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

// Build a "dd/MM/yyyy" string for today (used as the default end of the date
// range). Keeps the date-range picker logic consistent with the rest of the
// app, which uses dd/MM/yyyy everywhere.
function todayDDMMYYYY(): string {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}
// Build a "dd/MM/yyyy" for the first day of the current month (used as the
// default start of the date range — shows the current month by default).
function firstOfMonthDDMMYYYY(): string {
  const now = new Date();
  return `01/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

export default function IncentivesPage() {
  const [activeTab, setActiveTab] = useState<SubTab>("promotion");
  const [dialogOpen, setDialogOpen] = useState(false);
  // The incentive being edited (null = create mode). Tracked here so the
  // IncentiveDialog can be pre-filled and the submit handler knows whether
  // to POST (create) or PUT (update).
  const [editingIncentive, setEditingIncentive] = useState<IncentiveItem | null>(null);
  // Detail (view-only) dialog state — opens when the cashier clicks the blue
  // program-name link in either the Promotion or Voucher list. Stores the
  // selected item + which tab it came from (so the dialog title says
  // "Chi tiết khuyến mãi" vs "Chi tiết voucher").
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewingDetail, setViewingDetail] = useState<IncentiveDetail | null>(null);
  // Date range filter shared by BOTH the promotion and voucher tabs. The
  // lists only show items whose [startDate, endDate] validity window OVERLAPS
  // the selected [dateFrom, dateTo] range — so a voucher that ran 01 Aug → 15
  // Aug still appears when the user picks 10 Aug → 20 Aug (partial overlap).
  // Defaults to the current month.
  const [dateFrom, setDateFrom] = useState<string>(firstOfMonthDDMMYYYY());
  const [dateTo, setDateTo] = useState<string>(todayDDMMYYYY());
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

  // Open the DETAIL (view-only) dialog for a promotion. Maps the promotion's
  // fields to the IncentiveDetail shape and flags type="promotion" so the
  // dialog title reads "Chi tiết khuyến mãi".
  const handleViewPromotion = (item: IncentiveItem) => {
    setViewingDetail({ ...item, type: "promotion" });
    setDetailOpen(true);
  };

  // Open the EDIT form dialog (IncentiveDialog) for a voucher — pre-filled
  // with the voucher's data so staff can view AND edit all fields. This
  // mirrors the "Tạo mới" dialog but in edit mode, giving full access to the
  // voucher's settings (code, name, discount, validity, branches, services/
  // products, usage limit, etc.). The promotion tab keeps its read-only
  // detail dialog (handleViewPromotion above); the voucher tab uses the edit
  // form per the user's request.
  const handleViewVoucher = (item: IncentiveItem) => {
    setEditingIncentive(item);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Bạn có chắc muốn xóa khuyến mãi này?")) {
      deleteMutation.mutate(id);
    }
  };

  const promotions = (promotionsData?.items as IncentiveItem[]) || [];
  const vouchers = (vouchersData?.items as IncentiveItem[]) || [];

  // Date-range overlap filter — shared by BOTH tabs.
  // An incentive is INCLUDED when its validity window [startDate, endDate]
  // OVERLAPS the selected [dateFrom, dateTo] range. The overlap test is the
  // standard interval-intersection check:  startA <= endB && endA >= startB.
  // Incentives with no startDate AND no endDate are treated as always-active
  // (unbounded) and always pass the filter. Incentives with only one bound
  // use that bound against the opposite end of the selected range.
  const parseDDMMYYYY = (s: string): number => {
    if (!s) return NaN;
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return NaN;
    // Use noon UTC to avoid DST skew; only the date matters for overlap.
    return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
  };
  const rangeStart = parseDDMMYYYY(dateFrom);
  const rangeEnd = parseDDMMYYYY(dateTo);
  const passesDateRange = (item: { startDate?: string | null; endDate?: string | null }): boolean => {
    // No selected range → show everything (defensive — defaults always set).
    if (isNaN(rangeStart) || isNaN(rangeEnd)) return true;
    const sRaw = item.startDate;
    const eRaw = item.endDate;
    const s = sRaw ? new Date(sRaw).getTime() : NaN;
    const e = eRaw ? new Date(eRaw).getTime() : NaN;
    // Unbounded on both sides → always active.
    if (isNaN(s) && isNaN(e)) return true;
    // Unbounded start: active up to endDate. Overlaps when endDate >= rangeStart.
    if (isNaN(s)) return !isNaN(e) && e >= rangeStart;
    // Unbounded end: active from startDate. Overlaps when startDate <= rangeEnd.
    if (isNaN(e)) return !isNaN(s) && s <= rangeEnd;
    // Both bounds: standard interval overlap.
    return s <= rangeEnd && e >= rangeStart;
  };
  const filteredPromotions = promotions.filter(passesDateRange);
  const filteredVouchers = vouchers.filter(passesDateRange);

  return (
    <div className="space-y-4">
      <IncentivesTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "promotion" && (
        <PromotionList
          promotions={filteredPromotions}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onCreate={handleOpenCreate}
          onView={handleViewPromotion}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateRangeChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
      )}

      {activeTab === "voucher" && (
        <VoucherList
          vouchers={filteredVouchers}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onCreate={handleOpenCreate}
          onView={handleViewVoucher}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateRangeChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
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

      <IncentiveDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        detail={viewingDetail}
      />
    </div>
  );
}
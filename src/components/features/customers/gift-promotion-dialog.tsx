"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, Ticket, Loader2, Search, X, Check, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { isPromotionActive, type IncentiveShape } from "@/lib/promotion-utils";
import { formatVND } from "@/lib/utils";

/** Minimal customer shape — only the fields needed to filter suitable
 * promotions/vouchers. Mirrors HistoryCustomer from customer-history-dialog. */
export interface GiftPromoCustomer {
  id: string;
  name?: string | null;
  group?: { id: string; name: string } | null;
  rank?: { id: string; name: string } | null;
  totalSpent?: number;
  total_spent?: number;
  created_at?: string | null;
}

interface GiftPromotionDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: GiftPromoCustomer;
}

/**
 * Determine whether a customer is a "Khách hàng mới" (new customer): no
 * completed invoices yet (totalSpent === 0 or undefined). Used to filter
 * promotions whose autoApplyTarget === "new".
 */
function isNewCustomer(c: GiftPromoCustomer): boolean {
  const spent = Number(c.totalSpent ?? c.total_spent ?? 0);
  return spent <= 0;
}

/**
 * Determine whether a customer is a "Khách hàng cũ" (returning customer): has
 * at least one completed invoice (totalSpent > 0). The inverse of
 * isNewCustomer — used to filter promotions whose autoApplyTarget === "old".
 */
function isOldCustomer(c: GiftPromoCustomer): boolean {
  const spent = Number(c.totalSpent ?? c.total_spent ?? 0);
  return spent > 0;
}

/**
 * Determine whether a customer is a "Khách hàng VIP": has a rank or group
 * whose name contains "vip" (case-insensitive). Used to filter promotions
 * whose autoApplyTarget === "vip".
 */
function isVipCustomer(c: GiftPromoCustomer): boolean {
  const rankName = (c.rank?.name || "").toLowerCase();
  const groupName = (c.group?.name || "").toLowerCase();
  return rankName.includes("vip") || groupName.includes("vip");
}

/**
 * Determine whether a customer is a "member" (thành viên): has ANY group or
 * rank assigned. Used to filter promotions whose applyScope === "members_only".
 */
function isMember(c: GiftPromoCustomer): boolean {
  return !!(c.group || c.rank);
}

/**
 * Is this incentive suitable for the given customer? Checks the customer-type
 * targeting (autoApplyTarget + applyScope) — does NOT check date/usage (that's
 * isPromotionActive, applied separately).
 *
 * - autoApplyTarget "all" → suitable for everyone.
 * - autoApplyTarget "new" → suitable only for new customers (no completed invoice).
 * - autoApplyTarget "old" → suitable only for returning customers (≥1 completed invoice).
 * - autoApplyTarget "vip" → suitable only for VIP customers.
 * - autoApplyTarget "customer_set:<id>" → treated as suitable for everyone here.
 *   Customer-set membership is computed on the server (see customer-sets
 *   members API) and this dialog doesn't have that lookup wired in; defaulting
 *   to "suitable" avoids hiding promotions that the cashier manually gifts to
 *   a customer who happens to be in the targeted set. The auto-apply path
 *   (server-side) is the real gatekeeper for automatic application.
 * - applyScope "members_only" → suitable only for members (has group/rank).
 * - applyScope "all_customers" / "time_range" → no customer-type restriction.
 */
function isIncentiveSuitable(
  incentive: Pick<IncentiveShape, "applyScope" | "autoApplyTarget">,
  customer: GiftPromoCustomer
): boolean {
  const scope = incentive.applyScope;
  const target = incentive.autoApplyTarget as string | null | undefined;
  // members_only → requires the customer to be a member.
  if (scope === "members_only" && !isMember(customer)) return false;
  // autoApplyTarget targeting. "all" / empty / customer_set:* = no restriction
  // here (see docstring above for the customer_set rationale).
  if (target === "new" && !isNewCustomer(customer)) return false;
  if (target === "old" && !isOldCustomer(customer)) return false;
  if (target === "vip" && !isVipCustomer(customer)) return false;
  return true;
}

/** Format a date string (ISO) as DD/MM/YYYY, or "—" on parse failure. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return "—";
  }
}

/** Discount-type → display label. */
function discountLabel(type: string, value: number): string {
  switch (type) {
    case "SERVICE_DISCOUNT":
    case "PRODUCT_DISCOUNT":
      return `Giảm ${value}%`;
    case "SERVICE_GIFT":
      return `Tặng dịch vụ`;
    case "PRODUCT_GIFT":
      return `Tặng sản phẩm`;
    default:
      return `Giảm ${value}%`;
  }
}

export function GiftPromotionDialog({
  open,
  onOpenChange,
  customer,
}: GiftPromotionDialogProps) {
  const queryClient = useQueryClient();
  // Whether the eligible list is shown. Initially the dialog just shows a
  // summary of the customer + a "Xem khuyến mãi & voucher phù hợp" button.
  // Clicking it reveals the filtered list.
  const [showList, setShowList] = useState(false);
  // Selected incentive ids (checkboxes) — the cashier checks multiple then
  // clicks "Lưu" to gift them to the customer.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch ALL promotions + vouchers (both types) so we can filter client-side
  // by the customer's type (new/vip/member) AND active status (date + usage).
  // A high limit ensures we don't miss eligible ones — the incentives table
  // is small (a few dozen rows).
  const { data, isFetching } = useQuery<{
    items: Array<IncentiveShape & { autoApplyTarget?: string | null; unusedCount?: number }>;
  }>({
    queryKey: ["gift-promo-incentives"],
    queryFn: async () => {
      const fetchType = async (type: "promotion" | "voucher") => {
        const res = await fetch(`/api/supabase/incentives?type=${type}&limit=500`);
        const json = await res.json();
        if (!json.ok) return [];
        return (json.data?.items || []) as Array<
          IncentiveShape & { autoApplyTarget?: string | null; unusedCount?: number }
        >;
      };
      const [promos, vouchers] = await Promise.all([
        fetchType("promotion"),
        fetchType("voucher"),
      ]);
      return { items: [...promos, ...vouchers] };
    },
    enabled: open && showList,
  });

  // Fetch the customer's EXISTING gifts so we can show which incentives are
  // already gifted (pre-checked) and avoid re-gifting them. Each row includes
  // the joined incentive shape so we can also use it to show already-gifted
  // ones that are no longer in the eligible list (e.g. expired globally but
  // still gifted to this customer).
  const { data: giftsData } = useQuery<{
    items: Array<{
      id: string;
      customer_id: string;
      incentive_id: string;
      created_at: string;
      incentive: IncentiveShape & { autoApplyTarget?: string | null } | null;
    }>;
  }>({
    queryKey: ["customer-gifts", customer.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/supabase/customer-gifts?customer_id=${encodeURIComponent(customer.id)}`
      );
      const json = await res.json();
      if (!json.ok) return { items: [] };
      return { items: json.data || [] };
    },
    enabled: open && showList,
  });
  // Set of incentive ids already gifted to this customer.
  const giftedIds = new Set(
    (giftsData?.items || [])
      .filter((g) => g.incentive)
      .map((g) => g.incentive_id)
  );

  // Filter: active (date + usage) AND suitable for this customer's type.
  const eligible = (data?.items || []).filter(
    (inc) => isPromotionActive(inc) && isIncentiveSuitable(inc, customer)
  );

  // Save mutation — POSTs the selected incentive ids to the customer-gifts
  // API. On success, invalidates the customer-gifts query so the pre-checked
  // state refreshes, and closes the dialog.
  const saveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/supabase/customer-gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customer.id,
          incentive_ids: ids,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Không thể tặng khuyến mãi");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-gifts", customer.id] });
      // Also invalidate cashier/booking promo lists so the gifted incentives
      // appear there for this customer.
      queryClient.invalidateQueries({ queryKey: ["cashier-promotions"] });
      setSelectedIds(new Set());
      setShowList(false);
      onOpenChange(false);
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] sm:max-w-[520px] p-4 gap-3">
        <DialogHeader className="space-y-0">
          <DialogTitle className="text-sm flex items-center gap-2">
            <Gift className="h-4 w-4 text-blue-600" />
            Tặng khuyến mãi
          </DialogTitle>
        </DialogHeader>

        {/* Customer summary — shows who the gift is for + their type badges. */}
        <div className="rounded-md bg-blue-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {customer.name || "Khách hàng"}
            </span>
            <div className="flex flex-wrap gap-1">
              {isNewCustomer(customer) && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  Khách mới
                </span>
              )}
              {isVipCustomer(customer) && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                  VIP
                </span>
              )}
              {isMember(customer) && (
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                  Thành viên
                </span>
              )}
              {!isNewCustomer(customer) && !isVipCustomer(customer) && !isMember(customer) && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                  Khách thường
                </span>
              )}
            </div>
          </div>
        </div>

        {!showList ? (
          <div className="py-2 text-center">
            <p className="mb-3 text-xs text-gray-500">
              Xem các khuyến mãi &amp; voucher phù hợp với đối tượng khách hàng này,
              còn trong thời gian áp dụng và còn số lượng.
            </p>
            <Button
              type="button"
              onClick={() => setShowList(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Search className="mr-2 h-4 w-4" />
              Xem khuyến mãi &amp; voucher phù hợp
            </Button>
          </div>
        ) : isFetching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            <span className="ml-2 text-xs text-gray-500">Đang tải...</span>
          </div>
        ) : eligible.length === 0 ? (
          <div className="py-6 text-center">
            <X className="mx-auto mb-2 h-6 w-6 text-gray-300" />
            <p className="text-xs text-gray-500">
              Không có khuyến mãi / voucher phù hợp với khách hàng này lúc này.
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              (Chỉ hiện khuyến mãi còn trong thời gian áp dụng và còn số lượng.)
            </p>
          </div>
        ) : (
          <>
            <div className="dialog-list-scroll max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {eligible.map((inc) => {
                const isGifted = giftedIds.has(inc.id);
                const isChecked = selectedIds.has(inc.id) || isGifted;
                return (
                  <div
                    key={inc.id}
                    className={`rounded-md border px-2.5 py-1.5 transition-colors ${
                      isChecked
                        ? "border-blue-400 bg-blue-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    } ${isGifted ? "opacity-70" : ""}`}
                  >
                    <label className="flex cursor-pointer items-start gap-2">
                      {/* Checkbox — select multiple. Already-gifted ones are
                          pre-checked and disabled (can't un-gift from here). */}
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isGifted}
                        onChange={() => toggleSelect(inc.id)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`shrink-0 rounded px-1 text-[9px] font-semibold ${
                              inc.type === "voucher"
                                ? "bg-purple-100 text-purple-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {inc.type === "voucher" ? (
                              <Ticket className="h-2.5 w-2.5" />
                            ) : (
                              "KM"
                            )}
                          </span>
                          <span
                            className="flex-1 truncate text-xs font-medium text-gray-800"
                            title={inc.name}
                          >
                            {inc.name}
                          </span>
                          <span className="shrink-0 text-[11px] font-medium text-emerald-600">
                            {discountLabel(inc.discountType, inc.discountValue)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400">
                          <span>
                            Áp dụng: {formatDate(inc.startDate)} → {formatDate(inc.endDate)}
                          </span>
                          <span>•</span>
                          <span>
                            Còn:{" "}
                            {inc.usageLimit > 0
                              ? `${Math.max(0, inc.usageLimit - inc.usedCount)}/${inc.usageLimit}`
                              : "∞"}
                          </span>
                          {inc.code && (
                            <>
                              <span>•</span>
                              <span className="font-mono">{inc.code}</span>
                            </>
                          )}
                          {isGifted && (
                            <>
                              <span>•</span>
                              <span className="font-medium text-blue-600">Đã tặng</span>
                            </>
                          )}
                        </div>
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
            {/* Selection summary */}
            {selectedIds.size > 0 && (
              <p className="text-[11px] text-blue-600">
                Đã chọn {selectedIds.size} khuyến mãi/voucher để tặng.
              </p>
            )}
          </>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowList(false);
              setSelectedIds(new Set());
              onOpenChange(false);
            }}
          >
            Đóng
          </Button>
          {showList && eligible.length > 0 && (
            <Button
              size="sm"
              disabled={selectedIds.size === 0 || saveMutation.isPending}
              onClick={() => saveMutation.mutate(Array.from(selectedIds))}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              Lưu ({selectedIds.size})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
